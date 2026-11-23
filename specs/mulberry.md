# mulberry.ts

Seeded random number generator (mulberry32). Each state is a single number. `GameState.rng` holds one state per system (`orders`, `upgrades`, `harvest`, `drops`, `events`), so a run can be saved and replayed exactly, and one system's draws never shift another's.

## Exports

### `seedRNG(seed: RNGSeed): RNGState`

Turns a seed into the starting state by converting it to an unsigned 32-bit integer (`seed >>> 0`). For example, `-1` becomes `4294967295`.

### `seedStream(seed: RNGSeed, salt: number): RNGState`

Starting state for a separate stream from the same run seed. Mixes the salt into the seed, then takes the generator's first output as a whole number: with `s = (seed ^ Math.imul(salt, 0x9e3779b9)) >>> 0`, the result is `floor(nextValue(s)[0] × 2^32)`.

- The same seed and salt always give the same state; different salts give unrelated states.
- mulberry32's state is a counter, so every stream is a position on the same cycle of 2^32 values. Mixing puts each stream at a scattered position, so two streams only overlap if a run draws a large share of 2^32 numbers, which never happens.
- `GameState.rng.orders` uses `seedRNG(seed)` itself, so order sequences are the same as before streams existed. Other streams use `seedStream` with a fixed salt each: `upgrades` uses salt `1`, `harvest` uses salt `2`, `drops` (power-up drops) uses salt `3`, `events` uses salt `4`.

### `nextValue(state: RNGState): [number, RNGState]`

Advances the generator once.

- Returns `[value, nextState]`.
- `value` is a float in `[0, 1)`.
- `nextState` must be stored back (for example into `GameState.rng.orders`). Reusing an old state repeats the same number.
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
- `seedStream` is deterministic, gives different states for salts `1` to `4` and from `seedRNG(seed)`, and its first 1,000 values don't match the first 1,000 values of `seedRNG(seed)` position by position.

## Open items

- [x] Add `seedStream(seed, salt)` for separate streams (orders, upgrades, harvest).
- [x] Add the `drops` stream (salt 3) with power-ups.
- [x] Add an `events` stream (salt 4) with events.
- [x] Add `lives` (salt 5, Second chance) and `shrink` (salt 6, Small order) streams.
- [x] Add the `rush` stream (salt 7, Timed rush waves).
- [x] Add the `shop` stream (salt 8, shop stock and restocks; see [shop.md](shop.md)).

- [x] Rename the float generator to `nextValue` and add `randomInt(state, min, max)` on top of it.
- [x] Add `pick(state, list)` for choosing a random item, such as a crop for an order.
