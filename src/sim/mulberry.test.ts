import { describe, it, expect } from "vitest";
import { seedRNG, nextInt } from "./mulberry";

describe("mulberry RNG", () => {
    it("is deterministic: same state gives same output", () => {
        const s = seedRNG(42);
        expect(nextInt(s)).toEqual(nextInt(s));
    });

    it("advances the state", () => {
        const s = seedRNG(42);
        const [, next] = nextInt(s);
        expect(next).not.toBe(s);
    });

    it("produces values in [0, 1)", () => {
        let state = seedRNG(123);
        for (let i = 0; i < 10_000; i++) {
            const [v, next] = nextInt(state);
            expect(v).toBeGreaterThanOrEqual(0);
            expect(v).toBeLessThan(1);
            state = next;
        }
    });

    it("normalizes negative seeds to uint32", () => {
        expect(seedRNG(-1)).toBe(4294967295);
    });

    it("same seed gives the same first 100 numbers", () => {
        let seed1 = seedRNG(42);
        let seed2 = seedRNG(42);
        for (let i = 0; i < 100; i++) {
            let [value1, newSeed1] = nextInt(seed1)
            let [value2, newSeed2] = nextInt(seed2)
            expect(value1).toBe(value2)
            expect(newSeed1).toBe(newSeed2)
            seed1 = newSeed1
            seed2 = newSeed2
        }

    })
});
