import { describe, it, expect } from "vitest"
import { seedRNG, seedStream, nextValue, randomInt, pick } from "./mulberry"

describe("mulberry RNG", () => {
    //hand written tests
    it("same seed gives the same first 100 numbers", () => {
        let seed1 = seedRNG(42)
        let seed2 = seedRNG(42)
        for (let i = 0; i < 100; i++) {
            const [value1, newSeed1] = nextValue(seed1)
            const [value2, newSeed2] = nextValue(seed2)
            expect(value1).toBe(value2)
            expect(newSeed1).toBe(newSeed2)
            seed1 = newSeed1
            seed2 = newSeed2
        }
    })

    //

    it("is deterministic: same state gives same output", () => {
        const s = seedRNG(42)
        expect(nextValue(s)).toEqual(nextValue(s))
    })

    it("advances the state", () => {
        const s = seedRNG(42)
        const [, next] = nextValue(s)
        expect(next).not.toBe(s)
    })

    it("produces values in [0, 1)", () => {
        let state = seedRNG(123)
        for (let i = 0; i < 10_000; i++) {
            const [v, next] = nextValue(state)
            expect(v).toBeGreaterThanOrEqual(0)
            expect(v).toBeLessThan(1)
            state = next
        }
    })

    it("normalizes negative seeds to uint32", () => {
        expect(seedRNG(-1)).toBe(4294967295)
    })
})

describe("randomInt", () => {
    it("stays in [min, max] and hits every value", () => {
        let state = seedRNG(7)
        const seen = new Set<number>()
        for (let i = 0; i < 1000; i++) {
            const [n, next] = randomInt(state, 2, 6)
            expect(Number.isInteger(n)).toBe(true)
            expect(n).toBeGreaterThanOrEqual(2)
            expect(n).toBeLessThanOrEqual(6)
            seen.add(n)
            state = next
        }
        expect([...seen].sort()).toEqual([2, 3, 4, 5, 6])
    })

    it("uses exactly one draw", () => {
        const s = seedRNG(42)
        expect(randomInt(s, 0, 10)[1]).toBe(nextValue(s)[1])
    })

    it("returns min when min equals max", () => {
        expect(randomInt(seedRNG(1), 3, 3)[0]).toBe(3)
    })
})

describe("pick", () => {
    it("returns an item from the list and hits every item", () => {
        const list = ["a", "b", "c"]
        let state = seedRNG(9)
        const seen = new Set<string>()
        for (let i = 0; i < 300; i++) {
            const [item, next] = pick(state, list)
            expect(list).toContain(item)
            seen.add(item)
            state = next
        }
        expect(seen.size).toBe(3)
    })

    it("uses exactly one draw and is deterministic", () => {
        const s = seedRNG(42)
        expect(pick(s, [1, 2, 3])).toEqual(pick(s, [1, 2, 3]))
        expect(pick(s, [1, 2, 3])[1]).toBe(nextValue(s)[1])
    })

    it("never changes the list", () => {
        const list = [1, 2, 3]
        pick(seedRNG(1), list)
        expect(list).toEqual([1, 2, 3])
    })

    it("throws on an empty list", () => {
        expect(() => pick(seedRNG(1), [])).toThrow()
    })
})

describe("seedStream", () => {
    it("is deterministic", () => {
        expect(seedStream(42, 1)).toBe(seedStream(42, 1))
    })

    it("gives different states for different salts, and differs from seedRNG", () => {
        expect(seedStream(42, 1)).not.toBe(seedStream(42, 2))
        expect(seedStream(42, 1)).not.toBe(seedRNG(42))
        expect(seedStream(42, 3)).not.toBe(seedStream(42, 1))
        expect(seedStream(42, 3)).not.toBe(seedStream(42, 2))
        expect(seedStream(42, 3)).not.toBe(seedRNG(42))
        for (const salt of [4, 5, 6]) {
            for (let other = 1; other < salt; other++) {
                expect(seedStream(42, salt)).not.toBe(seedStream(42, other))
            }
            expect(seedStream(42, salt)).not.toBe(seedRNG(42))
        }
        expect(seedStream(42, 1)).not.toBe(seedStream(43, 1))
    })

    it("returns an unsigned 32-bit integer", () => {
        for (const seed of [0, 1, -1, 2 ** 32 - 1]) {
            const s = seedStream(seed, 1)
            expect(Number.isInteger(s)).toBe(true)
            expect(s).toBeGreaterThanOrEqual(0)
            expect(s).toBeLessThan(2 ** 32)
        }
    })

    it("doesn't line up with the seed's own stream", () => {
        let a = seedRNG(7)
        let b = seedStream(7, 1)
        let same = 0
        for (let i = 0; i < 1000; i++) {
            const [va, na] = nextValue(a)
            const [vb, nb] = nextValue(b)
            if (va === vb) same += 1
            a = na
            b = nb
        }
        expect(same).toBe(0)
    })
})
