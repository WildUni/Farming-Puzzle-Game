# Specs

One spec per module in `src/sim/`. Each spec says what the module is for, what it exports, the rules each function must follow, and what is still missing.

| Module | Spec | Purpose |
| --- | --- | --- |
| `src/sim/types.ts` | [types.md](types.md) | Shared types for the simulation |
| `src/sim/game_constants.ts` | [game_constants.md](game_constants.md) | Tuning numbers (tick rate, time limits, starting plots) |
| `src/sim/main.ts` | [main.md](main.md) | Whole-game functions: `createGame`, `applyAction`, `step` (later `replay`) |
| `src/sim/mulberry.ts` | [mulberry.md](mulberry.md) | Seeded random number generator |
| `src/sim/plot.ts` | [plot.md](plot.md) | Rules for a single plot, plus the crop table |
| `src/sim/orders.ts` | [orders.md](orders.md) | Rules for a single order: creating, filling, expiring |
| `src/sim/scoring.ts` | [scoring.md](scoring.md) | Score calculation |

## Rules for every sim module

- **No Phaser or browser imports.** `src/sim/` must run in plain Node so the tests and a server-side replay can use it.
- **Pure functions.** Functions take what they need as arguments and return new values. They never change their inputs, read the clock or call `Math.random`.
- **Plain data.** Everything in `GameState` is plain objects, arrays, strings and numbers, so it survives `JSON.stringify` and can be compared with `toEqual`.
- **Time is in ticks.** All times are tick numbers (`TICKS_PER_SECOND` per second), never milliseconds.
- **Bad moves return `null`.** A function that can reject a move returns `null` instead of throwing.
