# main.ts

Whole-game functions. This module coordinates the other modules: it owns `GameState` and calls `plot.ts`, `orders.ts`, `difficulty.ts`, `upgrades.ts` and `mulberry.ts` to do the detailed work.

## Exports

### `createGame(seed: RNGSeed, config: GameConfig): GameState`

Returns a fresh state for a new run.

| Field                                      | Starting value                                                                                                                                                                                             |
| ------------------------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `mode`                                     | `config.mode`                                                                                                                                                                                              |
| `status`                                   | `'running'`                                                                                                                                                                                                |
| `tick`                                     | `0`                                                                                                                                                                                                        |
| `rng`                                      | `{ orders: seedRNG(seed), upgrades: seedStream(seed, 1), harvest: seedStream(seed, 2), drops: seedStream(seed, 3), events: seedStream(seed, 4), lives: seedStream(seed, 5), shrink: seedStream(seed, 6) }` |
| `plots`                                    | `START_PLOTS` empty plots, each a separate object                                                                                                                                                          |
| `inventory`                                | `{}`                                                                                                                                                                                                       |
| `orders`                                   | `[]`                                                                                                                                                                                                       |
| `nextOrderId`                              | `0`                                                                                                                                                                                                        |
| `score`, `ordersCompleted`, `ordersFailed` | `0`                                                                                                                                                                                                        |
| `lives`                                    | Survival: `DIFFICULTY.startLives`. Other modes: `0`                                                                                                                                                        |
| `coins`, `livesBought`                     | `0`                                                                                                                                                                                                        |
| `upgrades`                                 | `[]`                                                                                                                                                                                                       |
| `upgradeOffer`                             | `null`                                                                                                                                                                                                     |
| `offersMade`                               | `0`                                                                                                                                                                                                        |
| `allowPowerUps`                            | `config.allowPowerUps`                                                                                                                                                                                     |
| `powerUps`, `activeEffects`                | `[]`                                                                                                                                                                                                       |
| `allowEvents`                              | `config.allowEvents`                                                                                                                                                                                       |
| `event`                                    | `null`                                                                                                                                                                                                     |
| `nextEventAt`                              | `EVENTS.firstEventTicks`                                                                                                                                                                                   |
| `secondWind`                               | `false`                                                                                                                                                                                                    |

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
1. While `upgradeOffer` is not `null`, returns `null` for every action except `chooseUpgrade` (the clock is stopped; see [upgrades.md](upgrades.md)).
1. Never changes `state` or anything inside it. Plots and orders the action doesn't touch may be shared with the old state, since nothing changes them in place.
1. Does not change `tick`. Time only moves in `step`.
1. Does not change `rng.orders` or `rng.upgrades`. Only two actions draw random numbers: `harvest` (the bumper roll from `rng.harvest` and the drop roll from `rng.drops`, see below) and `usePowerUp` with Good omen (an event announcement from `rng.events`).
1. Deterministic: the same arguments always give an equal result.

**Order within a tick.** On each tick, `step` runs first, then the actions logged for that tick are applied in log order. So a crop whose growth finishes on tick _t_ can be harvested on tick _t_, and an order with `expiresAt` _t_ can still be delivered by actions on tick _t_. `step` on tick _t + 1_ fails it before that tick's actions run. `replay` must use the same order.

**`plant`** `{ type: 'plant', plot, cropId }`

- `plot` must be a whole number from `0` to `plots.length − 1`, otherwise `null`.
- Calls `plant(plots[plot], cropId, state.tick, crops, growthPct)` with `growthPct` from `plantGrowthPct(state, plot, cropId)`: `modifiersAt(upgrades, { plot, cropId })`, so run-wide, plot and crop upgrades all count, plus Last stand on a Survival run's last life. Returns `null` if that does (plot not empty, or unknown crop).
- Replaces that plot with the growing plot. Nothing else changes.
- Planting is free for now (no seeds or coins).

**`harvest`** `{ type: 'harvest', plot }`

- `plot` must be a valid index, as for `plant`.
- Calls `harvest(plots[plot])`. Returns `null` if the plot is not `'ready'` (empty or still growing).
- Returns `null` while `harvestBlocked(activeEffects, plot, tick)`: Crows are there and the plot isn't shielded (see [events.md](events.md)).
- Empties that plot and adds `crops[cropId].yield + yieldBonus` to `inventory[cropId]` (starting from 0 if missing), with `yieldBonus` from `modifiersAt(upgrades, { plot, cropId })`.
- **Bumper harvest:** if `bumperChance` from the same `modifiersAt` is above 0, draws `roll = randomInt(rng.harvest, 0, 99)`, stores the new state in `rng.harvest`, and adds `bumperExtra` more crops (1 without Bigger bumper) when `roll < bumperChance`. With `bumperChance` 0 it draws nothing (see [upgrades.md](upgrades.md)).
- **Worms:** adds `harvestBonusAt(activeEffects, plot, tick)` more crops (see [events.md](events.md)).
- **Power-up drop:** then calls `rollDrop(state)`, stores the new `rng.drops`, and appends the dropped id to `powerUps` if there is one and `powerUps.length < powerUpSlots`. A drop with every slot full is lost. With power-ups off or `dropChance` 0 it draws nothing (see [powerups.md](powerups.md)).

**`deliver`** `{ type: 'deliver', orderId }`

- Finds the open order with that `id`. Returns `null` if there is none (unknown, already filled, or already failed).
- Returns `null` if the order `isExpired` at `state.tick` (`tick > expiresAt`). Delivering on tick `expiresAt` itself is allowed. With the tick order above this can't normally happen, but it keeps `applyAction` safe to call on any state.
- Calls `fulfill(order, inventory)`. Returns `null` if the inventory is short.
- Removes the order from `orders` (other orders keep their order), stores the new inventory, adds `order.value` to `score`, and adds 1 to `ordersCompleted`.
- **Survival:** also adds `DIFFICULTY.coinsPerOrder + coinsPerOrder` (the modifier) `+ deliverBonusAt(activeEffects, tick)` (Generous customer, Gold rush) `+ earlyBirdCoins` when `2 × timeLeft(order, tick) >= timeLimit` (Early bird) to `coins`. Other modes don't earn coins.
- Everything after the crops are taken is shared with the Finish one and Finish all power-ups (`completeOrder`), which fill orders without crops.
- Does not create a new order. That is `step`'s job. Filling an order can raise the level (see [difficulty.md](difficulty.md)); orders `step` creates from then on use the new level's rules, while orders already open keep their time limit and amount.

**`buyLife`** `{ type: 'buyLife' }`

- Survival only. Returns `null` in other modes.
- Returns `null` at the cap: `lives >= maxLivesFor(state)`.
- The price is `lifePriceFor(state)`. Returns `null` if `coins` is below it.
- Takes the price from `coins`, adds 1 to `lives` and 1 to `livesBought`. Nothing else changes.
- Lives are capped at `maxLivesFor(state)`: `DIFFICULTY.maxLives` (3) plus Extra heart's `extraLives`. The rising price is a second limit.

**`chooseUpgrade`** `{ type: 'chooseUpgrade', upgradeId, target? }`

- Returns `null` when there is no open offer, or no card on it has `upgradeId`.
- Untargeted upgrade: returns `null` if `target` is given (other than `null`). Targeted upgrade: returns `null` unless `target` is in `validTargets(upgrades, upgradeId, plots.length, crops)`.
- Appends `{ id: upgradeId, tier: <the card's tier>, target: target ?? null }` to `upgrades` (a new array) and sets `upgradeOffer` to `null`.
- If `modifiersFor(upgrades).extraPlots` went up, adds that many empty plots to the end of `plots`, so `plots.length` is always `START_PLOTS + extraPlots`.
- Nothing else changes. See [upgrades.md](upgrades.md) for the whole offer flow.

**`usePowerUp`** `{ type: 'usePowerUp', slot, target? }`

- Returns `null` when power-ups are off, `slot` is not an index into `powerUps`, or the target is wrong for the power-up (`target` must be in `powerUpTargets(state, slot)` for a plot power-up, and left out for the rest).
- Removes `powerUps[slot]` (the others keep their order) and fires its effect: Ready one makes the target plot ready, Growth boost runs `cutGrowth` on every plot, Coin bag adds coins, Ready all readies every growing crop, Clean slate empties every plot, Finish one fills the target order and Finish all every order (for no score), Good omen announces a good event, and a lasting power-up (Order freeze, Gold rush) goes through `startEffect` with `durationFor(def, upgrades)` ticks.
- Only Good omen draws (from `rng.events`). See [powerups.md](powerups.md) for the full rules and [effects.md](effects.md) for what each effect does.

### `withUpgrade(state: GameState, copy: OwnedUpgrade): GameState`

Appends `copy` to `upgrades` (a new array) and adds empty plots if `extraPlots` went up, as `chooseUpgrade` describes. In Survival, if `extraLives` went up (Extra heart), the cap goes up by that much and that many lives are added, filling the new hearts.

### `maxLivesFor(state: GameState): number`

The most lives a Survival run can hold: `DIFFICULTY.maxLives + modifiersFor(upgrades).extraLives`. `buyLife`, `canBuyLife`, the hearts and the buy button all use it. `chooseUpgrade` and the debug menu (see [debug.md](debug.md)) both use it.

### `nextOrderPreview(state: GameState, crops: CropTable): Order | null`

Sneak peek. `null` once the run has ended or while `sneakPeek` is 0. Otherwise the order step 7 would create next if it were made now: the same `createOrder` and Small order roll, from copies of `rng.orders` and `rng.shrink` (nothing is stored), with `nextOrderId`, the current `orderRules` and Second wind if it is due. A level-up, a new upgrade or Second wind turning on before the order is made can still change its amount or time; its crop is always the one that comes.

### `lifePriceFor(state: GameState): number`

Price of the next life with upgrades applied: `scalePct(lifePrice(livesBought), lifePricePct)`. `buyLife`, `canBuyLife` and the buy button all use it.

### `canBuyLife(state: GameState): boolean`

`true` when `buyLife` would succeed: the run is Survival, not ended, no upgrade offer is open, `lives < maxLivesFor(state)`, and `coins >= lifePriceFor(state)`. The buy button uses it, so the screen and the rules can't disagree.

### `orderRules(state: GameState): OrderRules`

The order rules `step` uses for new orders.

- **Survival:** `orderRulesFor(runLevel(state))` from `difficulty.ts` (the level slowed by Steady pace), with `orderTicks` scaled by the `orderTimePct` modifier (`scalePct`).
- **Timed** and **Puzzle:** the fixed `DEFAULT_ORDER_RULES` from `game_constants.ts` (`MAX_OPEN_ORDERS`, `ORDER_TICKS`, `ORDER_MIN_AMOUNT`, `ORDER_MAX_AMOUNT`).

### `step(state: GameState, crops: CropTable): GameState`

Moves the game forward one tick. This is the only way time passes in a run.

| Argument | Type        | Meaning                            |
| -------- | ----------- | ---------------------------------- |
| `state`  | `GameState` | The current state. Never changed   |
| `crops`  | `CropTable` | Crop stats, for picking new orders |

Returns a **new** state. The steps run in this order, each one using the result of the one before:

1. **Tick:** `tick` becomes `state.tick + 1`. Every later step uses this new tick.
2. **Events start and end:** if the announced event's `startsAt` is this tick it starts (`startEvent(state, crops, orderRules(state))`: an instant effect fires, or a lasting one goes through `startEffect`; Moles may draw its block roll, and Birds and Emergency order their picks, from `rng.events`). Then, if its `endsAt` is this tick or earlier, `event` becomes `null` and `nextEventAt = tick + gapTicks(state)`. See [events.md](events.md).
3. **Effects:** `tickEffects(activeEffects, plots, orders, tick)` drops lasting effects that have ended and moves crops' and orders' deadlines for the ones still active (see [effects.md](effects.md)). It runs before growth and failed orders, so a crop pulled to this tick turns ready now, and an order pushed past this tick doesn't fail.
4. **Growth:** every plot is passed through `updateGrowth(plot, tick)`. A growing plot becomes `'ready'` on its `readyAt` tick (_p + growTicks_ for a crop planted on tick _p_). Empty and ready plots don't change.
5. **Failed orders:** every order where `isExpired(order, tick)` (`tick > expiresAt`) is removed, and `ordersFailed` goes up by 1 for each. The other orders keep their order in the list.
    - **Survival:** each failed order also costs one life. `lives` never goes below 0, even when more orders fail on one tick than there are lives left. With `secondChance` above 0, each failed order first draws `randomInt(rng.lives, 0, 99)` and keeps the life when the roll is below it. If any life was lost, `secondWind` becomes `true`.
6. **End of run:** if the mode's end condition is met, `status` becomes `'ended'` and `step` stops here. No new orders are created.
    - **Timed:** `tick >= TIMED_MODE_TICKS`. Ticks `0` to `TIMED_MODE_TICKS − 1` are playable.
    - **Survival:** `lives` is 0. Once ended, `applyAction` refuses every action, including `buyLife`.
    - **Puzzle:** no end condition yet (see Open items).
7. **New orders:** with `rules = orderRules(state)`, while fewer than `rules.maxOpenOrders` orders are open, create one with `createOrder(nextOrderId, tick, rng.orders, crops, rules)`, add it to the **end** of `orders`, store the returned state in `rng.orders`, and add 1 to `nextOrderId`. **Small order:** with `smallOrderChance` above 0, each new order then draws `randomInt(rng.shrink, 0, 99)`; below the chance, every amount becomes `ceil(amount / 2)`, the value stays, and the order's `small` is set to `true` so the screen can mark it. **Second wind:** while `secondWind` is `true`, the first order made uses `orderTicks = scalePct(rules.orderTicks, secondWindPct)`, and `secondWind` becomes `false`. This also creates the first orders, on tick 1, and refills a slot the tick after an order is delivered or failed. If more orders are open than `maxOpenOrders` allows, none are removed; no new ones are made until the count drops.
8. **Event announcement:** if `allowEvents`, no event is announced or running and `tick >= nextEventAt`, `announceEvent(state)` picks the next event from `rng.events` and stores it in `event`; if nothing is eligible, `nextEventAt = tick + gapTicks(state)`. Skipped when the run ended on this step.
9. **Upgrade offer (Survival):** if `ordersCompleted >= (offersMade + 1) × ORDERS_PER_UPGRADE`, `rollOffer(state, "survival", crops)` picks the offer from `rng.upgrades`, `upgradeOffer` is set to it (or stays `null` if nothing is eligible), the new state is stored in `rng.upgrades` and `offersMade` goes up by 1.

**Rules**

- Once `status` is `'ended'`, returns `state` unchanged.
- While `upgradeOffer` is not `null`, returns `state` unchanged: time stops until `chooseUpgrade`.
- Never changes `state` or anything inside it.
- Never changes `score`, `ordersCompleted`, `coins`, `livesBought` or `powerUps`. Those only change through `applyAction`. `inventory` changes in `step` only when Helpful neighbor or Rot starts. `lives` only goes down in `step` (and up through `buyLife` and Extra heart). `activeEffects` gains entries through `usePowerUp` and lasting events; `step` only removes ended ones.
- `rng.orders` changes only when orders are created (exactly two draws per order). `rng.upgrades` changes only when an upgrade offer is made (exactly two draws per card). `rng.events` changes only when an event is announced (two or three draws), Moles' block roll is made (one draw), or Birds (two per seeded plot) or Emergency order (two) start. `rng.lives` changes only on a failed order with Second chance (one draw each), and `rng.shrink` only on a new order with Small order (one draw each). `step` never touches `rng.harvest` or `rng.drops`. No stream's draws depend on another's, so upgrade picks, harvests, drops, power-up use and events never change which orders come next.
- Deterministic: the same arguments always give an equal result, so the same seed and the same actions always give the same run.

## Tests (`main.test.ts`)

**`createGame`**

- Starts with the fresh state in the table above.
- The same seed gives an equal state.

**`applyAction`: every action**

- Returns `null` once `status` is `'ended'`.
- Never changes the state passed in (checked with a deep copy taken before the call).
- Leaves `tick` and `rng` unchanged.

**`plant`**

- Plants a crop on an empty plot with `plantedAt = tick` and `readyAt = tick + growTicks`, and leaves the other plots alone.
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
- Refused at the cap; Extra heart raises the cap by one.
- Returns `null` when coins are one short of the price, and in Timed.
- `canBuyLife` agrees with `applyAction` in each of these cases, and is `false` once the run has ended or lives are at the cap.

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

- The first step fills up to `MAX_OPEN_ORDERS` orders, with ids from 0, `expiresAt = tick + ORDER_TICKS`, and `nextOrderId` and `rng.orders` advanced to match `createOrder`.
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

**Upgrades** (see [upgrades.md](upgrades.md) for the full list)

- The offer flow: no offer before `ORDERS_PER_UPGRADE` filled orders, an offer on the next step, time stopped and other actions refused while it is open, `chooseUpgrade` accepting only an offered id with a valid target (or none, for untargeted upgrades), the next offer at `2 × ORDERS_PER_UPGRADE`, none in Timed, none when nothing is eligible.
- Making an offer leaves `rng.orders` unchanged.
- Each modifier changes its rule: `growthPct` on `plant`'s `readyAt` (and not on crops already growing), `yieldBonus` on harvest, `bumperChance` on harvest (one draw from `rng.harvest`, none without it), both per plot and crop for targeted copies, `coinsPerOrder` on deliver, `orderTimePct` on new orders, `lifePricePct` on `buyLife` and `canBuyLife`, `extraPlots` adding an empty plot (and none past its cap).

**Events** (see [events.md](events.md) for the full list)

- `createGame` copies `allowEvents` and sets `nextEventAt` to `firstEventTicks`.
- Events start before effects move clocks and before growth, so Rain shower readies crops on its start tick; they are announced after new orders, so announcing never shifts `rng.orders`.
- Crows refuse `harvest` and Generous customer adds to `deliver`'s coins, each only on their working ticks.

**Second batch** (see [upgrades.md](upgrades.md#shipped-with-the-second-batch) and [powerups.md](powerups.md) for the full lists)

- `createGame` seeds `rng.lives` and `rng.shrink` and starts with `secondWind` false.
- Bigger bumper, Small order, Sneak peek (`nextOrderPreview`), Early bird, Steady pace, Extra heart, Last stand, Second chance and Second wind each change their rule, and draw only from their own stream.
- Ready all, Clean slate, Finish one, Finish all, Gold rush and Good omen each fire their effect.

**Power-ups and effects** (see [powerups.md](powerups.md) and [effects.md](effects.md) for the full lists)

- `createGame` copies `allowPowerUps` from the config and starts with no power-ups or effects.
- Harvest drops: kept when a slot is free, lost when not, never with power-ups off; `rng.drops` moves by the draws `rollDrop` used.
- `usePowerUp` fires each shipped power-up's effect and removes its slot; it is refused in every case listed above.
- `step` runs effects before growth and failed orders: an Order freeze started on the order's `expiresAt` tick keeps it from failing on the next step, and a crop pulled to the current tick is ready on that same step.

`replay`, which rebuilds a run from its seed and action log, lives in `verification.ts` (see [verification.md](verification.md)).

## Open items

- [ ] Consider renaming to `game.ts` as it grows.
- [ ] Add the time bonus to `deliver`'s score once the scoring rule reads `GameState` (see [scoring.md](scoring.md)).
- [ ] Planting costs (seeds or coins), if the economy needs a coin sink besides lives.
- [x] Survival end condition: the run ends when lives reach 0, and a failed order costs a life.
- [ ] Puzzle end condition (the level's order filled or failed) once puzzle levels exist.
- [x] Open more orders at once as Survival difficulty rises (`orderRules`).
- [ ] Timed rush waves (Day 5), also through `orderRules`.
