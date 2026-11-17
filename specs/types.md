# types.ts

Shared types for the simulation. Contains only types, so it is exported with `export type` and adds no code at runtime.

## Types

### Basic values

| Type | Definition | Meaning |
| --- | --- | --- |
| `RNGSeed` | `number` | The seed a run starts from |
| `RNGState` | `number` | The generator's current position, stored in `GameState` |
| `GameMode` | `'survival' \| 'timed' \| 'puzzle'` | Which mode the run is in |
| `GameStatus` | `'running' \| 'ended'` | Whether `step` should keep advancing the game |

### `Crop` and `CropTable`

```ts
type Crop = { id: string, growTicks: number, yield: number, value: number }
type CropTable = Record<string, Crop>   // cropId -> Crop
```

- `growTicks`: ticks from planting until the crop is ready.
- `yield`: how many crops one harvest adds to the inventory.
- `value`: worth of one crop, used when pricing orders.
- The list in `src/data/crops.json` is turned into a `CropTable` with `buildCropTable` (see [plot.md](plot.md)).
- Crop stats are fixed data and are **not** stored in `GameState`. The state refers to crops only by id.

### `Plot`

```ts
type Plot =
  | { state: 'empty' }
  | { state: 'growing', cropId: string, plantedAt: number }
  | { state: 'ready',   cropId: string }
```

- `plantedAt` is the tick the crop was planted on. The ready tick is worked out as `plantedAt + growTicks`, not stored.
- `cropId` can only be read after checking `state`, so an empty plot can never have a crop.

### `Order`

```ts
type Order = { id: number, required: Record<string, number>, value: number, expiresAt: number }
```

- `id`: unique within a run, taken from `GameState.nextOrderId`. Actions name orders by id, not by position in the list.
- `required`: crop id → amount needed.
- `value`: score awarded when the order is filled.
- `expiresAt`: the tick the order fails on.

### `GameState`

Everything that changes during a run. If `step` or `replay` would give a different result without a value, it belongs here.

| Field | Meaning |
| --- | --- |
| `mode` | The run's `GameMode` |
| `status` | `'running'` until the run ends |
| `tick` | Current tick, starting at 0 |
| `rngState` | Generator state. Every random draw reads it and stores the new state back |
| `plots` | One `Plot` per plot |
| `inventory` | Crop id → amount held. Missing ids mean 0 |
| `orders` | Open orders |
| `nextOrderId` | Id for the next order created |
| `score` | Points so far |
| `ordersCompleted`, `ordersFailed` | Run counters |

**Not in `GameState`:** crop stats, constants, `GameConfig`, the action log, anything that can be worked out (time left, growth progress), and anything only the screen needs (open menus, animations, pause).

### `GameConfig`

```ts
type GameConfig = { mode: GameMode, allowPowerUps: boolean }
```

Settings chosen before a run. Fixed for the whole run.

### `RunData`

```ts
type RunData = { time_left: number, orders_completed: number, points: number }
```

Input to `calcScore` (see [scoring.md](scoring.md)).

## Open items

- [ ] `RunData` repeats information already in `GameState` (`ordersCompleted`, `tick`, `score`) and uses snake_case while the rest uses camelCase. Decide whether scoring should read `GameState` directly.
- [ ] Add an `Action` type: plant (plot, crop), harvest (plot), deliver (order).
- [ ] Add Survival fields (`lives`, `coins`, `lifePrice`) when Survival rules are built.
- [ ] Add plot modifiers (fertilizer, weeds, blocked) as a `modifiers` list when needed. Growth would then need a stored `progress` field instead of `plantedAt`.
