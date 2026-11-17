# main.ts

Whole-game functions. This module coordinates the other modules: it owns `GameState` and calls `plot.ts`, `orders.ts` and `mulberry.ts` to do the detailed work.

## Exports

### `createGame(seed: RNGSeed, config: GameConfig): GameState` (default export)

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

## Planned

### `step(state, crops): GameState`

Moves the game forward one tick:
1. Increase `tick` by 1.
2. Call `updateGrowth` on every plot.
3. Fail orders where `isExpired` (`tick > expiresAt`) and increase `ordersFailed`.
4. Create the next order when one closes, using `nextOrderId` and `rngState`.
5. Set `status` to `'ended'` when the mode's end condition is met (time up in Timed, no lives in Survival).

Does nothing once `status` is `'ended'`.

### `replay(seed, config, log, crops): GameState`

Runs `createGame`, then applies each logged action on its tick while stepping forward. Replaying a run's log must give a state equal to the original run's final state.

## Open items

- [ ] Consider renaming to `game.ts` as it grows.
- [ ] Add the time bonus to `deliver`'s score once the scoring rule reads `GameState` (see [scoring.md](scoring.md)).
- [ ] Planting costs (seeds or coins) once Survival's economy is built.
