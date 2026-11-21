import type { RNGSeed, RNGState } from "./types"

/** Turn a seed into the initial RNG state (the counter's starting position). */
function seedRNG(seed: RNGSeed): RNGState {
    return seed >>> 0 // normalize to uint32
}

/**
 * Starting state for a separate stream from the same run seed (see specs/mulberry.md).
 * Mixes the salt into the seed and takes the first output as a whole number, so each
 * stream starts at a scattered position on the generator's cycle.
 */
function seedStream(seed: RNGSeed, salt: number): RNGState {
    const mixed = (seed ^ Math.imul(salt, 0x9e3779b9)) >>> 0
    return Math.floor(nextValue(mixed)[0] * 4294967296) >>> 0
}

/**
 * Advance the mulberry32 RNG once (pure: no hidden state).
 * Returns a float in [0, 1) and the next state to store back into GameState.
 */
function nextValue(state: RNGState): [number, RNGState] {
    const t = (state + 0x6d2b79f5) >>> 0 // Weyl counter step: this is the next state
    let x = Math.imul(t ^ (t >>> 15), t | 1)
    x ^= x + Math.imul(x ^ (x >>> 7), x | 61)
    const value = ((x ^ (x >>> 14)) >>> 0) / 4294967296
    return [value, t]
}

/** Whole number from min to max inclusive, plus the next RNG state. Uses one draw. */
function randomInt(state: RNGState, min: number, max: number): [number, RNGState] {
    const [v, next] = nextValue(state)
    return [min + Math.floor(v * (max - min + 1)), next]
}

/**
 * One item from `list`, chosen uniformly, plus the next RNG state. Uses one draw.
 * Throws on an empty list, since there is nothing to pick.
 */
function pick<T>(state: RNGState, list: readonly T[]): [T, RNGState] {
    if (list.length === 0) throw new Error("pick: list is empty")
    const [index, next] = randomInt(state, 0, list.length - 1)
    return [list[index], next]
}

export { seedRNG, seedStream, nextValue, randomInt, pick }
