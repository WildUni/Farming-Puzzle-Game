# mulberry.ts

Seeded random number generator (mulberry32). Its state is a single number stored in `GameState.rngState`, so a run can be saved and replayed exactly.

## Exports

### `seedRNG(seed: RNGSeed): RNGState`

Turns a seed into the starting state by converting it to an unsigned 32-bit integer (`seed >>> 0`). For example, `-1` becomes `4294967295`.

### `nextValue(state: RNGState): [number, RNGState]`

Advances the generator once.

- Returns `[value, nextState]`.
- `value` is a float in `[0, 1)`.
- `nextState` must be stored back (for example into `GameState.rngState`). Reusing an old state repeats the same number.
- Pure: the same `state` always gives the same result. It never calls `Math.random`.

### `randomInt(state: RNGState, min: number, max: number): [number, RNGState]`

- Returns a whole number from `min` to `max` inclusive: `min + floor(v × (max − min + 1))`, where `v` comes from `nextValue`.
- Uses exactly one draw.

### `pick<T>(state: RNGState, list: readonly T[]): [T, RNGState]`

- Returns one item of `list`, chosen uniformly with `randomInt(state, 0, list.length − 1)`, and the next state.
- Uses exactly one draw and never changes `list`.
- Throws an `Error` on an empty list.
- Callers that need a result independent of input order (such as crop ids) should sort the list first.

## Rules

- All randomness in the simulation goes through this module.
- Every function that draws a random number takes the RNG state as an argument and returns the new state along with its result.

## Tested

- The same seed gives the same first 100 numbers and states.
- The same state gives the same output.
- The state changes after each call.
- 10,000 values all fall in `[0, 1)`.
- Negative seeds are converted to unsigned 32-bit integers.
- `randomInt` stays in range, reaches every value, uses one draw, and returns `min` when `min === max`.
- `pick` returns items from the list, reaches every item, uses one draw, is deterministic, never changes the list, and throws on an empty list.

## Open items

- [x] Rename the float generator to `nextValue` and add `randomInt(state, min, max)` on top of it.
- [x] Add `pick(state, list)` for choosing a random item, such as a crop for an order.
