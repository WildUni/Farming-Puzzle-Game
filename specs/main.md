# main.ts

Whole-game functions. This module coordinates the other modules: it owns `GameState` and calls `plot.ts`, `orders.ts` and `mulberry.ts` to do the detailed work.

## Exports

### `createGame(seed: RNGSeed, config: GameConfig): GameState`

Returns a fresh state for a new run.

| Field | Starting value |
| --- | --- |
| `mode` | `config.mode` |
| `status` | `'running'` |
| `tick` | `0` |
| `rngState` | `seedRNG(seed)` |
| `plots` | `START_PLOTS` empty plots, each a separate object |
| `inventory` | `{}` |
| `orders` | `[]` |
| `nextOrderId` | `0` |
| `score`, `ordersCompleted`, `ordersFailed` | `0` |

Rules:
- The same seed and config always give an equal state (`toEqual`).
- Does not create the first order yet. That will happen in `step` or a separate start function.

### `applyAction(state: GameState, action: Action, crops: CropTable): GameState | null`

Applies one player move. This is the only way player input changes `GameState`, so every move can be recorded in the action log and replayed.

| Argument | Type | Meaning |
| --- | --- | --- |
| `state` | `GameState` | The current state. Never changed |
| `action` | `Action` | The move (see [types.md](types.md)) |
| `crops` | `CropTable` | Crop stats, needed for planting checks and harvest yield |

Returns a **new** state, or `null` if the move is not allowed. A `null` result means nothing happened: the caller keeps the old state.

**Rules for every action**
1. Returns `null` when `state.status` is `'ended'`.
2. Never changes `state` or anything inside it. Plots and orders the action doesn't touch may be shared with the old state, since nothing changes them in place.
3. Does not change `tick` or `rngState`. Time only moves in `step`, and actions never draw random numbers.
4. Deterministic: the same arguments always give an equal result.

**Order within a tick.** On each tick, `step` runs first, then the actions logged for that tick are applied in log order. So a crop whose growth finishes on tick *t* can be harvested on tick *t*, and an order with `expiresAt` *t* can still be delivered by actions on tick *t*. `step` on tick *t + 1* fails it before that tick's actions run. `replay` must use the same order.

**`plant`** `{ type: 'plant', plot, cropId }`
- `plot` must be a whole number from `0` to `plots.length − 1`, otherwise `null`.
- Calls `plant(plots[plot], cropId, state.tick, crops)`. Returns `null` if that does (plot not empty, or unknown crop).
- Replaces that plot with the growing plot. Nothing else changes.
- Planting is free for now (no seeds or coins).

**`harvest`** `{ type: 'harvest', plot }`
- `plot` must be a valid index, as for `plant`.
- Calls `harvest(plots[plot])`. Returns `null` if the plot is not `'ready'` (empty or still growing).
- Empties that plot and adds `crops[cropId].yield` to `inventory[cropId]` (starting from 0 if missing).

**`deliver`** `{ type: 'deliver', orderId }`
- Finds the open order with that `id`. Returns `null` if there is none (unknown, already filled, or already failed).
- Returns `null` if the order `isExpired` at `state.tick` (`tick > expiresAt`). Delivering on tick `expiresAt` itself is allowed. With the tick order above this can't normally happen, but it keeps `applyAction` safe to call on any state.
- Calls `fulfill(order, inventory)`. Returns `null` if the inventory is short.
- Removes the order from `orders` (other orders keep their order), stores the new inventory, adds `order.value` to `score`, and adds 1 to `ordersCompleted`.
- Does not create a new order. That is `step`'s job.

### `step(state: GameState, crops: CropTable): GameState`

Moves the game forward one tick. This is the only way time passes in a run.

| Argument | Type | Meaning |
| --- | --- | --- |
| `state` | `GameState` | The current state. Never changed |
| `crops` | `CropTable` | Crop stats, for growth times and for picking new orders |

Returns a **new** state. The steps run in this order, each one using the result of the one before:

1. **Tick:** `tick` becomes `state.tick + 1`. Every later step uses this new tick.
2. **Growth:** every plot is passed through `updateGrowth(plot, tick, crops)`. A crop planted on tick *p* becomes `'ready'` on tick *p + growTicks*. Empty and ready plots don't change.
3. **Failed orders:** every order where `isExpired(order, tick)` (`tick > expiresAt`) is removed, and `ordersFailed` goes up by 1 for each. The other orders keep their order in the list.
4. **End of run:** if the mode's end condition is met, `status` becomes `'ended'` and `step` stops here. No new orders are created.
   - **Timed:** `tick >= TIMED_MODE_TICKS`. Ticks `0` to `TIMED_MODE_TICKS − 1` are playable.
   - **Survival** and **Puzzle:** no end condition yet (see Open items).
5. **New orders:** while fewer than `MAX_OPEN_ORDERS` orders are open, create one with `createOrder(nextOrderId, tick, rngState, crops)`, add it to the **end** of `orders`, store the returned RNG state, and add 1 to `nextOrderId`. This also creates the first orders, on tick 1, and refills a slot the tick after an order is delivered or failed.

**Rules**
- Once `status` is `'ended'`, returns `state` unchanged.
- Never changes `state` or anything inside it.
- Never changes `inventory`, `score` or `ordersCompleted`. Those only change through `applyAction`.
- `rngState` changes only when orders are created, by exactly two draws per order.
- Deterministic: the same arguments always give an equal result, so the same seed and the same actions always give the same run.

## Tests (`main.test.ts`)

**`createGame`**
- Starts with the fresh state in the table above.
- The same seed gives an equal state.

**`applyAction`: every action**
- Returns `null` once `status` is `'ended'`.
- Never changes the state passed in (checked with a deep copy taken before the call).
- Leaves `tick` and `rngState` unchanged.

**`plant`**
- Plants a crop on an empty plot with `plantedAt = tick`, and leaves the other plots alone.
- Returns `null` for a busy plot (growing or ready).
- Returns `null` for an unknown crop.
- Returns `null` for a plot index that is negative, too large, or not a whole number.

**`harvest`**
- Empties a ready plot and adds the crop's yield to the inventory.
- Adds to crops already held.
- Returns `null` for an empty plot, a growing plot and a bad index.

**`deliver`**
- Removes the order, takes its crops, adds its value to `score` and adds 1 to `ordersCompleted`.
- Leaves other orders in place and in order.
- Returns `null` when the inventory is short.
- Returns `null` for an unknown order id, and for an order delivered twice.
- Allows delivery on tick `expiresAt`, and returns `null` for an order still in the list on tick `expiresAt + 1`.

**Full flow**
- Plant, wait for growth with `updateGrowth`, harvest, and deliver: the order is filled.

**`step`: tick and rules**
- Increases `tick` by 1.
- Never changes the state passed in.
- Leaves `inventory`, `score` and `ordersCompleted` alone.
- Returns the state unchanged once `status` is `'ended'`.
- The same seed gives an equal state after many steps.

**`step`: growth**
- A planted crop is still growing on tick `plantedAt + growTicks − 1` and ready on `plantedAt + growTicks`.
- Empty and ready plots don't change.

**`step`: orders**
- The first step fills up to `MAX_OPEN_ORDERS` orders, with ids from 0, `expiresAt = tick + ORDER_TICKS`, and `nextOrderId` and `rngState` advanced to match `createOrder`.
- Never opens more than `MAX_OPEN_ORDERS` orders.
- An order is still open on its `expiresAt` tick and fails on the tick after: it is removed and `ordersFailed` goes up by 1.
- A failed order is replaced on the same step with a new id, and the remaining orders keep their order.
- A delivered order is replaced on the next step.

**`step`: end of run**
- Timed ends on tick `TIMED_MODE_TICKS` and creates no new orders on that step. After that, `step` changes nothing and `applyAction` returns `null`.
- Survival doesn't end by time.

**`step` with `applyAction`**
- A crop can be harvested on the same tick `step` makes it ready.
- An order can be delivered on its `expiresAt` tick, but after the next `step` it is gone.

## Planned

### `replay(seed, config, log, crops): GameState`

Runs `createGame`, then applies each logged action on its tick while stepping forward. Replaying a run's log must give a state equal to the original run's final state.

## Open items

- [ ] Consider renaming to `game.ts` as it grows.
- [ ] Add the time bonus to `deliver`'s score once the scoring rule reads `GameState` (see [scoring.md](scoring.md)).
- [ ] Planting costs (seeds or coins) once Survival's economy is built.
- [ ] Survival end condition (no lives left) once `lives` is in `GameState`. Failing an order should probably cost a life.
- [ ] Puzzle end condition (the level's order filled or failed) once puzzle levels exist.
- [ ] Open more orders at once as Survival difficulty rises, and in Timed rush waves, instead of a fixed `MAX_OPEN_ORDERS`.
