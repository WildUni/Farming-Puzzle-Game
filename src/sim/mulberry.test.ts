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
});
