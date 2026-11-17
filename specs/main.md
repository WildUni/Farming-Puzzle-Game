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

## Planned

### `applyAction(state, action, crops): GameState | null`

- Handles `plant`, `harvest` and `deliver`.
- Returns `null` for a bad move: plot busy, crop not ready, unknown crop, not enough crops, unknown order id.
- Every player input goes through this function, so it is recorded in the action log.

### `step(state, crops): GameState`

Moves the game forward one tick:
1. Increase `tick` by 1.
2. Call `updateGrowth` on every plot.
3. Fail orders where `tick >= expiresAt` and increase `ordersFailed`.
4. Create the next order when one closes, using `nextOrderId` and `rngState`.
5. Set `status` to `'ended'` when the mode's end condition is met (time up in Timed, no lives in Survival).

Does nothing once `status` is `'ended'`.

### `replay(seed, config, log, crops): GameState`

Runs `createGame`, then applies each logged action on its tick while stepping forward. Replaying a run's log must give a state equal to the original run's final state.

## Open items

- [ ] Consider renaming to `game.ts` as it grows.
