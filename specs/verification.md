# verification.ts

Rebuilds a run from its seed, config and action log, so a result can be checked without trusting the device that played it. The client and the server both use it: the server replays a submitted run and compares the result with the score the client claims.

`verification.ts` sits on top of `main.ts`. It only calls `createGame`, `step` and `applyAction`, and has no rules of its own about plots, orders or scoring. Nothing in the simulation imports it.

```
mulberry, plot, orders, scoring   <- rules for single pieces
            ^
          main                    <- createGame, applyAction, step
            ^
      verification                <- replays main from a seed and a log
```

## How a run is played (the order replay copies)

The game loop on the client must follow these steps, and `replay` does the same:

1. `state = createGame(seed, config)`. The state is on tick 0.
2. Apply the player's actions for the current tick with `applyAction`, in the order they were made. Only actions that return a new state are logged, as `{ tick: state.tick, action }`.
3. `state = step(state, crops)` to move to the next tick, then go back to 2.
4. The run stops on `finalTick`: when the run ends (`status` becomes `'ended'`), or when the player quits.

So actions on tick *t* always run **after** the `step` that reached tick *t*, and actions on tick 0 run before any `step`.

## Exports

### `replay(seed, config, log, finalTick, crops): ReplayResult`

| Argument | Type | Meaning |
| --- | --- | --- |
| `seed` | `RNGSeed` | The seed the run started from |
| `config` | `GameConfig` | The run's settings |
| `log` | `LogEntry[]` | Every accepted action, in the order it was made |
| `finalTick` | `number` | The tick the run stopped on |
| `crops` | `CropTable` | The crop table the run used |

```ts
type ReplayError =
  | 'bad-tick'        // an entry's tick is not a whole number from 0 to finalTick
  | 'out-of-order'    // an entry's tick is lower than the one before it
  | 'after-end'       // an entry is on a tick after the run ended
  | 'refused'         // applyAction rejected an entry
  | 'bad-final-tick'  // finalTick is not a whole number >= 0, or the run ended before it

type ReplayResult =
  | { ok: true,  state: GameState }
  | { ok: false, error: ReplayError, entry: number | null }   // entry: index in log, or null
```

Steps:

1. Check `finalTick` is a whole number `>= 0`, otherwise `bad-final-tick` with `entry: null`.
2. Start from `createGame(seed, config)`.
3. For each log entry, in log order:
   1. Its tick must be a whole number from `0` to `finalTick`, otherwise `bad-tick`.
   2. Its tick must not be lower than the current `state.tick`, otherwise `out-of-order`. Several entries may share a tick.
   3. `step` until `state.tick` equals the entry's tick. If the run ends before that tick is reached, `after-end`.
   4. Apply the action. If `applyAction` returns `null` (or anything that is not a state), `refused`.
4. `step` until `state.tick` equals `finalTick`. If the run ends before `finalTick`, `bad-final-tick` with `entry: null`.
5. Return `{ ok: true, state }`.

Rules:

- **Every logged action must be accepted.** A client only logs actions that worked, so a refused action means the log was edited or the client is out of sync. `replay` never skips one.
- **Fails on the first problem** and reports the index of the entry that caused it, so a bad log is easy to debug.
- **Deterministic:** the same arguments always give the same result. Replaying a run's log with its `finalTick` gives a state equal (`toEqual`) to the run's final state.
- **Never changes `log`.**
- Entries on an ended tick are not allowed. In Timed the run ends on tick `TIMED_MODE_TICKS`, so the last tick an action can be logged on is `TIMED_MODE_TICKS − 1`.

## Tests (`verification.test.ts`)

**Matches the original run**
- An empty log gives the same state as stepping `createGame` to `finalTick`.
- A scripted player (harvest every ready plot, deliver every order it can, plant every empty plot for the first open order) gives a final state equal to replaying its log, over several seeds and in both Survival and Timed.
- A weaker scripted player that only plants garlic lets orders fail, and its runs also replay equal.
- A full Timed run ends with `status: 'ended'` and replays equal.
- Actions on tick 0, and several actions on the same tick, replay correctly.
- The same arguments give equal results, and the log is not changed.

**Rejects bad logs**
- `refused`: an action that can't be applied (harvesting an empty plot), and an action that is fine on another tick but not on the logged one. The reported `entry` is the index of the bad entry.
- `refused`: an unknown action type.
- `out-of-order`: an entry with a lower tick than the one before.
- `bad-tick`: a negative tick, a fractional tick, and a tick after `finalTick`.
- `after-end`: an action logged on or after the tick a Timed run ends.
- `bad-final-tick`: a negative or fractional `finalTick`, and a `finalTick` after a Timed run ended.
- Changing the seed makes a valid log fail or give a different state.

## Open items

- [ ] `verifyRun(seed, config, log, finalTick, crops, claimedScore)` for the server: replay, then compare the score.
- [ ] Limits checked before replaying: maximum `finalTick` and maximum log length, so a huge log can't tie up the server.
- [ ] Check the shape of each logged action (field types, extra fields) when parsing JSON from the client, before it reaches `applyAction`.
- [ ] A rules version in the log, so the server rejects runs played with old crop data or constants.
- [ ] Record helper for the client game loop, so the scene can't log differently from how `replay` reads the log.
