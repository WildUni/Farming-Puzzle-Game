import type { RNGSeed, RNGState } from "./types";

/** Turn a seed into the initial RNG state (the counter's starting position). */
function seedRNG(seed: RNGSeed): RNGState {
    return seed >>> 0; // normalize to uint32
}

/**
 * Advance the mulberry32 RNG once (pure: no hidden state).
 * Returns a float in [0, 1) and the next state to store back into GameState.
 */
function nextInt(state: RNGState): [number, RNGState] {
    const t = (state + 0x6D2B79F5) >>> 0; // Weyl counter step: this is the next state
    let x = Math.imul(t ^ (t >>> 15), t | 1);
    x ^= x + Math.imul(x ^ (x >>> 7), x | 61);
    const value = ((x ^ (x >>> 14)) >>> 0) / 4294967296;
    return [value, t];
}

export { seedRNG, nextInt };
