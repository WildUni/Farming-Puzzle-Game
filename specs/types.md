# types.ts

Shared types for the simulation. Contains only types, so it is exported with `export type` and adds no code at runtime.

## Types

### Basic values

| Type         | Definition                                                                        | Meaning                                                         |
| ------------ | --------------------------------------------------------------------------------- | --------------------------------------------------------------- |
| `RNGSeed`    | `number`                                                                          | The seed a run starts from                                      |
| `RNGState`   | `number`                                                                          | One generator's current position, stored in `GameState.rng`     |
| `RNGStreams` | `{ orders; upgrades; harvest; drops; events; lives; shrink }`, each an `RNGState` | One generator per system, so their draws don't shift each other |
| `GameMode`   | `'survival' \| 'timed' \| 'puzzle'`                                               | Which mode the run is in                                        |
| `GameStatus` | `'running' \| 'ended'`                                                            | Whether `step` should keep advancing the game                   |

### `Crop` and `CropTable`

```ts
type Crop = { id: string; growTicks: number; yield: number; value: number }
type CropTable = Record<string, Crop> // cropId -> Crop
```

- `growTicks`: ticks from planting until the crop is ready.
- `yield`: how many crops one harvest adds to the inventory.
- `value`: worth of one crop, used when pricing orders.
- The list in `src/data/crops.json` is turned into a `CropTable` with `buildCropTable` (see [plot.md](plot.md)).
- Crop stats are fixed data and are **not** stored in `GameState`. The state refers to crops only by id.

### `Plot`

```ts
type Plot =
    | { state: "empty" }
    | { state: "growing"; cropId: string; plantedAt: number; readyAt: number }
    | { state: "ready"; cropId: string }
```

- `plantedAt` is the tick the crop was planted on, moved by the same amount as `readyAt` whenever an effect moves the crop's clock (see [effects.md](effects.md)). It is only used to draw progress.
- `readyAt` is the tick the crop becomes ready on. `plant` sets it to `plantedAt + growTicks`, and it is stored rather than worked out so later changes to growth speed don't affect crops already in the ground.
- `cropId` can only be read after checking `state`, so an empty plot can never have a crop.

### `Order`

```ts
type Order = {
    id: number
    required: Record<string, number>
    value: number
    expiresAt: number
    timeLimit: number
    small: boolean
}
```

- `id`: unique within a run, taken from `GameState.nextOrderId`. Actions name orders by id, not by position in the list.
- `required`: crop id → amount needed.
- `value`: score awarded when the order is filled.
- `expiresAt`: the last tick the order can be filled. It fails on tick `expiresAt + 1`.
- `small`: `true` when Small order halved its amounts (see [upgrades.md](upgrades.md)), so the order card can say so. `false` for every other order.
- `timeLimit`: the ticks the order was given when created (`expiresAt − createdTick`). Time limits change with the Survival level, so the countdown bar reads this instead of `ORDER_TICKS`.

### `OrderRules`

```ts
type OrderRules = {
    maxOpenOrders: number
    orderTicks: number
    minAmount: number
    maxAmount: number
}
```

How `step` creates orders at the current difficulty: how many it keeps open, each new order's time limit, and the range for its amount. Timed uses the fixed `DEFAULT_ORDER_RULES` with `MODES.timed.openOrders` open; Survival reads them from the current level (see [difficulty.md](difficulty.md)).

### `GameState`

Everything that changes during a run. If `step` or `replay` would give a different result without a value, it belongs here.

| Field                             | Meaning                                                                             |
| --------------------------------- | ----------------------------------------------------------------------------------- |
| `mode`                            | The run's `GameMode`                                                                |
| `status`                          | `'running'` until the run ends                                                      |
| `tick`                            | Current tick, starting at 0                                                         |
| `rng`                             | `RNGStreams`. Each random draw reads its system's stream and stores it back         |
| `plots`                           | One `Plot` per plot                                                                 |
| `inventory`                       | Crop id → amount held. Missing ids mean 0                                           |
| `orders`                          | Open orders                                                                         |
| `nextOrderId`                     | Id for the next order created                                                       |
| `score`                           | Points so far                                                                       |
| `ordersCompleted`, `ordersFailed` | Run counters                                                                        |
| `lives`                           | Lives left (Survival). The run ends at 0. Always 0 in other modes                   |
| `coins`                           | In-run coins, earned by filling orders in Survival. Reset every run                 |
| `livesBought`                     | Lives bought this run. Sets the next life's price                                   |
| `upgrades`                        | `OwnedUpgrade` copies picked this run (id, tier, target), in pick order             |
| `upgradeOffer`                    | `OfferCard`s (id, tier) while the player chooses, else `null`. Time stops while set |
| `offersMade`                      | Upgrade offers made this run. Sets when the next one is due                         |
| `allowPowerUps`                   | Copied from `GameConfig.allowPowerUps`, so the rules can read it                    |
| `powerUps`                        | Held power-up ids, one per slot, in the order they dropped                          |
| `activeEffects`                   | `ActiveEffect`s working right now (see [effects.md](effects.md))                    |
| `allowEvents`                     | Copied from `GameConfig.allowEvents`, so the rules can read it                      |
| `event`                           | The announced or running `RunEvent`, else `null` (see [events.md](events.md))       |
| `nextEventAt`                     | First tick a new event may be announced on                                          |
| `secondWind`                      | Survival: a life was lost and the next new order hasn't been made yet (Second wind) |
| `combo`                           | Timed: orders filled in a row; sets the score multiplier (`comboPct`)               |
| `comboEndsAt`                     | Timed: last tick the streak survives without another fill; `0` with no streak       |
| `bestCombo`                       | Timed: longest streak this run, for the summary                                     |

The Survival level and the next life's price are worked out from `ordersCompleted` and `livesBought` (see [difficulty.md](difficulty.md)), so they are not stored. The same goes for the upgrade `Modifiers`, which are added up from `upgrades` (see [upgrades.md](upgrades.md)).

**Not in `GameState`:** crop stats, constants, `GameConfig`, the action log, anything that can be worked out (time left, growth progress), and anything only the screen needs (open menus, animations, pause).

### `Inventory`

```ts
type Inventory = Record<string, number> // cropId -> amount held
```

Used for `GameState.inventory` and by `orders.ts`. Missing ids mean 0, and amounts that drop to 0 are removed.

### `Action`

```ts
type Action =
    | { type: "plant"; plot: number; cropId: string }
    | { type: "harvest"; plot: number }
    | { type: "deliver"; orderId: number }
    | { type: "buyLife" }
    | { type: "chooseUpgrade"; upgradeId: string; target?: number | string }
    | { type: "usePowerUp"; slot: number; target?: number }
```

One player move, passed to `applyAction` (see [main.md](main.md)).

- `plot` is an index into `GameState.plots`.
- `orderId` is an `Order.id`, not a position in the list, so it stays correct when other orders are removed.
- `upgradeId` must be the id of one of the cards in `GameState.upgradeOffer`.
- `target` is a plot index or crop id, required for targeted upgrades and left out for the rest (see [upgrades.md](upgrades.md)).
- `slot` is an index into `GameState.powerUps`. `usePowerUp`'s `target` is a plot index for power-ups with `target: "plot"`, an order id for ones with `target: "order"`, and left out for the rest (see [powerups.md](powerups.md)).
- Plain data only, so actions can be stored in the log and saved as JSON.

### Upgrade types

`Tier`, `Pool`, `Modifiers`, `ModifierStat`, `StatDef`, `TierDef`, `UpgradeEffect`, `UpgradeDef`, `UpgradeConfig`, `UpgradeTarget`, `OwnedUpgrade` and `OfferCard`, described in [upgrades.md](upgrades.md). `Modifiers` is never stored in `GameState`; it is worked out from `GameState.upgrades`. `UpgradeTable` is replaced by `UpgradeConfig`.

### Effect, power-up and event types

`LastingEffect`, `InstantEffect`, `Effect` and `ActiveEffect`, described in [effects.md](effects.md). `PowerUpDef` and `PowerUpConfig`, described in [powerups.md](powerups.md). `EventKind`, `EventDef`, `EventConfig` and `RunEvent`, described in [events.md](events.md); event definitions are fixed data, and the state holds only the one `RunEvent`. Power-up definitions are fixed data and are not stored in `GameState`; the state holds only ids (`powerUps`) and running effects (`activeEffects`).

### `LogEntry`

```ts
type LogEntry = { tick: number; action: Action }
```

One line of the action log: the move and the tick it was made on. Used by `replay` (see [verification.md](verification.md)).

### `GameConfig`

```ts
type GameConfig = { mode: GameMode; allowPowerUps: boolean; allowEvents: boolean }
```

Settings chosen before a run. Fixed for the whole run.

### `RunData`

```ts
type RunData = { time_left: number; orders_completed: number; points: number }
```

Input to `calcScore` (see [scoring.md](scoring.md)).

## Open items

- [ ] `RunData` repeats information already in `GameState` (`ordersCompleted`, `tick`, `score`) and uses snake_case while the rest uses camelCase. Decide whether scoring should read `GameState` directly.
- [x] Add Survival fields (`lives`, `coins`, `livesBought`). The life price is derived from `livesBought` instead of stored.
- [x] Store the ready tick on growing plots (`readyAt`).
- [ ] Add plot modifiers (fertilizer, weeds, blocked) as a `modifiers` list when needed.
- [ ] Replace `rngState` with `rng: RNGStreams`, and the upgrade fields with `OwnedUpgrade[]` / `OfferCard[]` (upgrades phase 1).
