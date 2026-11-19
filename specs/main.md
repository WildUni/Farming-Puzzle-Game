# main.ts

Whole-game functions. This module coordinates the other modules: it owns `GameState` and calls `plot.ts`, `orders.ts`, `difficulty.ts` and `mulberry.ts` to do the detailed work.

## Exports

### `createGame(seed: RNGSeed, config: GameConfig): GameState`

Returns a fresh state for a new run.

| Field                                      | Starting value                                      |
| ------------------------------------------ | --------------------------------------------------- |
| `mode`                                     | `config.mode`                                       |
| `status`                                   | `'running'`                                         |
| `tick`                                     | `0`                                                 |
| `rngState`                                 | `seedRNG(seed)`                                     |
| `plots`                                    | `START_PLOTS` empty plots, each a separate object   |
| `inventory`                                | `{}`                                                |
| `orders`                                   | `[]`                                                |
| `nextOrderId`                              | `0`                                                 |
| `score`, `ordersCompleted`, `ordersFailed` | `0`                                                 |
| `lives`                                    | Survival: `DIFFICULTY.startLives`. Other modes: `0` |
| `coins`, `livesBought`                     | `0`                                                 |

Rules:

- The same seed and config always give an equal state (`toEqual`).
- Every run starts with 0 coins, whatever the seed or mode.
- Does not create the first order yet. That will happen in `step` or a separate start function.

### `applyAction(state: GameState, action: Action, crops: CropTable): GameState | null`

Applies one player move. This is the only way player input changes `GameState`, so every move can be recorded in the action log and replayed.

| Argument | Type        | Meaning                                                  |
| -------- | ----------- | -------------------------------------------------------- |
| `state`  | `GameState` | The current state. Never changed                         |
| `action` | `Action`    | The move (see [types.md](types.md))                      |
| `crops`  | `CropTable` | Crop stats, needed for planting checks and harvest yield |

Returns a **new** state, or `null` if the move is not allowed. A `null` result means nothing happened: the caller keeps the old state.

**Rules for every action**

1. Returns `null` when `state.status` is `'ended'`.
2. Never changes `state` or anything inside it. Plots and orders the action doesn't touch may be shared with the old state, since nothing changes them in place.
3. Does not change `tick` or `rngState`. Time only moves in `step`, and actions never draw random numbers.
4. Deterministic: the same arguments always give an equal result.

**Order within a tick.** On each tick, `step` runs first, then the actions logged for that tick are applied in log order. So a crop whose growth finishes on tick _t_ can be harvested on tick _t_, and an order with `expiresAt` _t_ can still be delivered by actions on tick _t_. `step` on tick _t + 1_ fails it before that tick's actions run. `replay` must use the same order.

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
- **Survival:** also adds `DIFFICULTY.coinsPerOrder` to `coins`. Other modes don't earn coins.
- Does not create a new order. That is `step`'s job. Filling an order can raise the level (see [difficulty.md](difficulty.md)); orders `step` creates from then on use the new level's rules, while orders already open keep their time limit and amount.

**`buyLife`** `{ type: 'buyLife' }`

- Survival only. Returns `null` in other modes.
- The price is `lifePrice(livesBought)` (see [difficulty.md](difficulty.md)). Returns `null` if `coins` is below it.
- Takes the price from `coins`, adds 1 to `lives` and 1 to `livesBought`. Nothing else changes.
- There is no cap on lives. The rising price is the limit.

### `canBuyLife(state: GameState): boolean`

`true` when `buyLife` would succeed: the run is Survival, not ended, and `coins >= lifePrice(livesBought)`. The buy button uses it, so the screen and the rules can't disagree.

### `orderRules(state: GameState): OrderRules`

The order rules `step` uses for new orders.

- **Survival:** `orderRulesFor(levelFor(ordersCompleted))` from `difficulty.ts`.
- **Timed** and **Puzzle:** the fixed `DEFAULT_ORDER_RULES` from `game_constants.ts` (`MAX_OPEN_ORDERS`, `ORDER_TICKS`, `ORDER_MIN_AMOUNT`, `ORDER_MAX_AMOUNT`).

### `step(state: GameState, crops: CropTable): GameState`

Moves the game forward one tick. This is the only way time passes in a run.

| Argument | Type        | Meaning                                                 |
| -------- | ----------- | ------------------------------------------------------- |
| `state`  | `GameState` | The current state. Never changed                        |
| `crops`  | `CropTable` | Crop stats, for growth times and for picking new orders |

Returns a **new** state. The steps run in this order, each one using the result of the one before:

1. **Tick:** `tick` becomes `state.tick + 1`. Every later step uses this new tick.
2. **Growth:** every plot is passed through `updateGrowth(plot, tick, crops)`. A crop planted on tick _p_ becomes `'ready'` on tick _p + growTicks_. Empty and ready plots don't change.
3. **Failed orders:** every order where `isExpired(order, tick)` (`tick > expiresAt`) is removed, and `ordersFailed` goes up by 1 for each. The other orders keep their order in the list.
    - **Survival:** each failed order also costs one life. `lives` never goes below 0, even when more orders fail on one tick than there are lives left.
4. **End of run:** if the mode's end condition is met, `status` becomes `'ended'` and `step` stops here. No new orders are created.
    - **Timed:** `tick >= TIMED_MODE_TICKS`. Ticks `0` to `TIMED_MODE_TICKS − 1` are playable.
    - **Survival:** `lives` is 0. Once ended, `applyAction` refuses every action, including `buyLife`.
    - **Puzzle:** no end condition yet (see Open items).
5. **New orders:** with `rules = orderRules(state)`, while fewer than `rules.maxOpenOrders` orders are open, create one with `createOrder(nextOrderId, tick, rngState, crops, rules)`, add it to the **end** of `orders`, store the returned RNG state, and add 1 to `nextOrderId`. This also creates the first orders, on tick 1, and refills a slot the tick after an order is delivered or failed. If more orders are open than `maxOpenOrders` allows, none are removed; no new ones are made until the count drops.

**Rules**

- Once `status` is `'ended'`, returns `state` unchanged.
- Never changes `state` or anything inside it.
- Never changes `inventory`, `score`, `ordersCompleted`, `coins` or `livesBought`. Those only change through `applyAction`. `lives` only goes down in `step`.
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
- Survival pays `coinsPerOrder` coins; Timed pays none.
- Leaves other orders in place and in order.
- Returns `null` when the inventory is short.
- Returns `null` for an unknown order id, and for an order delivered twice.
- Allows delivery on tick `expiresAt`, and returns `null` for an order still in the list on tick `expiresAt + 1`.

**`buyLife`**

- Takes the price, adds a life and counts the purchase.
- Buying several lives in a row charges the config's price sequence.
- Returns `null` when coins are one short of the price, and in Timed.
- `canBuyLife` agrees with `applyAction` in each of these cases, and is `false` once the run has ended.

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

**`step`: orders** (run in Timed, where the order rules are the fixed constants)

- The first step fills up to `MAX_OPEN_ORDERS` orders, with ids from 0, `expiresAt = tick + ORDER_TICKS`, and `nextOrderId` and `rngState` advanced to match `createOrder`.
- Never opens more than `MAX_OPEN_ORDERS` orders.
- An order is still open on its `expiresAt` tick and fails on the tick after: it is removed and `ordersFailed` goes up by 1.
- A failed order is replaced on the same step with a new id, and the remaining orders keep their order.
- A delivered order is replaced on the next step.

**`step`: end of run**

- Timed ends on tick `TIMED_MODE_TICKS` and creates no new orders on that step. After that, `step` changes nothing and `applyAction` returns `null`.
- Survival doesn't end by time while lives are left.

**`step`: Survival lives and difficulty**

- A failed order costs one life; Timed loses no lives.
- Two orders failing on the same tick with one life left end the run at 0 lives, not −1.
- The run ends on the tick lives reach 0, creates no new orders on that step, and refuses every action after, including `buyLife`.
- A player who does nothing loses all lives in a fixed number of ticks. With level-1 rules (`T = orderTicks`, `k = maxOpenOrders`) and `L` lives, orders fail in groups of `k` every `T + 1` ticks starting on tick `T + 2`, so the run ends on tick `ceil(L / k) × (T + 1) + 1`. The test checks this formula against the shipped config and pins the default value.
- New orders use the current level's rules: level-1 orders at the start, and after `ordersPerLevel` filled orders, new orders get level 2's time limit, amount range and open-order count.
- Two or more orders are open at once when the level allows it.

**`step` with `applyAction`**

- A crop can be harvested on the same tick `step` makes it ready.
- An order can be delivered on its `expiresAt` tick, but after the next `step` it is gone.

`replay`, which rebuilds a run from its seed and action log, lives in `verification.ts` (see [verification.md](verification.md)).

## Open items

- [ ] Consider renaming to `game.ts` as it grows.
- [ ] Add the time bonus to `deliver`'s score once the scoring rule reads `GameState` (see [scoring.md](scoring.md)).
- [ ] Planting costs (seeds or coins), if the economy needs a coin sink besides lives.
- [x] Survival end condition: the run ends when lives reach 0, and a failed order costs a life.
- [ ] Puzzle end condition (the level's order filled or failed) once puzzle levels exist.
- [x] Open more orders at once as Survival difficulty rises (`orderRules`).
- [ ] Timed rush waves (Day 5), also through `orderRules`.
