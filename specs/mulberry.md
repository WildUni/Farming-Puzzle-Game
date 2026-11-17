# mulberry.ts

Seeded random number generator (mulberry32). Its state is a single number stored in `GameState.rngState`, so a run can be saved and replayed exactly.

## Exports

### `seedRNG(seed: RNGSeed): RNGState`

Turns a seed into the starting state by converting it to an unsigned 32-bit integer (`seed >>> 0`). For example, `-1` becomes `4294967295`.

### `nextInt(state: RNGState): [number, RNGState]`

Advances the generator once.

- Returns `[value, nextState]`.
- `value` is a float in `[0, 1)`.
- `nextState` must be stored back (for example into `GameState.rngState`). Reusing an old state repeats the same number.
- Pure: the same `state` always gives the same result. It never calls `Math.random`.

## Rules

- All randomness in the simulation goes through this module.
- Every function that draws a random number takes the RNG state as an argument and returns the new state along with its result.

## Tested

- The same seed gives the same first 100 numbers and states.
- The same state gives the same output.
- The state changes after each call.
- 10,000 values all fall in `[0, 1)`.
- Negative seeds are converted to unsigned 32-bit integers.

## Open items

- [ ] **`nextInt` returns a float, not an integer.** Rename it to `nextFloat` (or `next`) and add a real `nextInt(state, min, max)` on top of it.
- [ ] Add `pick(state, list)` for choosing a random item, such as a crop for an order.
