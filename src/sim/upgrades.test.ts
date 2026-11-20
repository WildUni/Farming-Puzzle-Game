import { describe, it, expect } from "vitest"
import {
    validateUpgrades,
    UPGRADES,
    BASE_MODIFIERS,
    modifiersFor,
    scalePct,
    stackCount,
    eligibleUpgrades,
    rollOffer
} from "./upgrades"
import { MIN_MODIFIER_PCT, UPGRADE_CHOICES } from "./game_constants"
import { seedRNG, nextValue } from "./mulberry"
import rawUpgrades from "../data/upgrades.json"
import type { UpgradeDef, UpgradeTable } from "./types"

function def(overrides: Partial<UpgradeDef> & { id: string }): UpgradeDef {
    return { name: "Name", text: "Text", stat: "yieldBonus", amount: 1, maxStacks: 3, ...overrides }
}

// A small table of our own, so these tests don't depend on the shipped numbers.
const table: UpgradeTable = validateUpgrades([
    def({ id: "grow", stat: "growthPct", amount: -30, maxStacks: 5 }),
    def({ id: "yield", stat: "yieldBonus", amount: 1, maxStacks: 2 }),
    def({ id: "coins", stat: "coinsPerOrder", amount: 3, maxStacks: 1 }),
    def({ id: "plot", stat: "extraPlots", amount: 1, maxStacks: 2 }),
    def({ id: "slow", stat: "yieldBonus", amount: -5, maxStacks: 1 })
])

describe("validateUpgrades", () => {
    it("accepts the shipped upgrades.json", () => {
        expect(Object.keys(UPGRADES).length).toBe(rawUpgrades.length)
        for (const u of rawUpgrades) expect(UPGRADES[u.id]).toEqual(u)
    })

    const good = { id: "a", name: "A", text: "Does a", stat: "yieldBonus", amount: 1, maxStacks: 1 }
    const bad: [string, unknown][] = [
        ["not a list", { a: good }],
        ["an empty list", []],
        ["a duplicate id", [good, { ...good, name: "Other" }]],
        ["a missing name", [{ ...good, name: undefined }]],
        ["an empty id", [{ ...good, id: "" }]],
        ["an unknown stat", [{ ...good, stat: "speed" }]],
        ["an amount of 0", [{ ...good, amount: 0 }]],
        ["a fractional amount", [{ ...good, amount: 1.5 }]],
        ["maxStacks 0", [{ ...good, maxStacks: 0 }]]
    ]
    it.each(bad)("throws for %s", (_, raw) => {
        expect(() => validateUpgrades(raw)).toThrow(/upgrades config/)
    })
})

describe("modifiersFor", () => {
    it("gives the base modifiers with no upgrades", () => {
        expect(modifiersFor([], table)).toEqual(BASE_MODIFIERS)
    })

    it("changes only the picked upgrade's stat", () => {
        expect(modifiersFor(["yield"], table)).toEqual({ ...BASE_MODIFIERS, yieldBonus: 1 })
    })

    it("stacks repeats by adding", () => {
        expect(modifiersFor(["grow", "grow"], table).growthPct).toBe(40)
        expect(modifiersFor(["yield", "coins", "yield"], table)).toEqual({
            ...BASE_MODIFIERS,
            yieldBonus: 2,
            coinsPerOrder: 3
        })
    })

    it("stops percentages at MIN_MODIFIER_PCT and other fields at 0", () => {
        expect(modifiersFor(["grow", "grow", "grow", "grow"], table).growthPct).toBe(
            MIN_MODIFIER_PCT
        )
        expect(modifiersFor(["slow"], table).yieldBonus).toBe(0)
    })

    it("throws for an unknown id", () => {
        expect(() => modifiersFor(["nope"], table)).toThrow(/unknown upgrade/)
    })

    it("returns the same object for the same array, and recalculates for a new one", () => {
        const picks = ["yield"]
        const first = modifiersFor(picks, table)
        expect(modifiersFor(picks, table)).toBe(first)

        const copy = ["yield"]
        expect(modifiersFor(copy, table)).toEqual(first)

        const more = [...picks, "coins"]
        expect(modifiersFor(more, table)).toEqual({ ...first, coinsPerOrder: 3 })
    })

    it("recalculates when the table changes", () => {
        const picks: string[] = []
        modifiersFor(picks, table)
        const other = validateUpgrades([def({ id: "x" })])
        expect(() => modifiersFor(["grow"], other)).toThrow()
        expect(modifiersFor(picks, other)).toEqual(BASE_MODIFIERS)
    })

    it("returns a frozen object", () => {
        expect(Object.isFrozen(modifiersFor(["yield"], table))).toBe(true)
    })
})

describe("scalePct", () => {
    it("returns the base at 100%", () => {
        expect(scalePct(80, 100)).toBe(80)
    })

    it("rounds to the nearest whole number", () => {
        expect(scalePct(80, 85)).toBe(68)
        expect(scalePct(10, 85)).toBe(9) // 8.5 rounds up
        expect(scalePct(10, 84)).toBe(8)
    })

    it("never goes below 1", () => {
        expect(scalePct(1, 25)).toBe(1)
        expect(scalePct(0, 100)).toBe(1)
    })
})

describe("stackCount and eligibleUpgrades", () => {
    it("counts repeats", () => {
        expect(stackCount(["yield", "grow", "yield"], "yield")).toBe(2)
        expect(stackCount([], "yield")).toBe(0)
    })

    it("lists every id, sorted, with no picks", () => {
        expect(eligibleUpgrades([], table)).toEqual(["coins", "grow", "plot", "slow", "yield"])
    })

    it("drops an id once it reaches maxStacks", () => {
        expect(eligibleUpgrades(["coins", "yield"], table)).toContain("yield")
        expect(eligibleUpgrades(["coins", "yield", "yield"], table)).toEqual([
            "grow",
            "plot",
            "slow"
        ])
    })
})

describe("rollOffer", () => {
    const rng = seedRNG(42)

    it("offers UPGRADE_CHOICES different eligible ids, one draw each", () => {
        const [offer, after] = rollOffer([], rng, table)
        expect(offer).toHaveLength(UPGRADE_CHOICES)
        expect(new Set(offer).size).toBe(UPGRADE_CHOICES)
        for (const id of offer) expect(eligibleUpgrades([], table)).toContain(id)

        let expected = rng
        for (let i = 0; i < UPGRADE_CHOICES; i++) expected = nextValue(expected)[1]
        expect(after).toBe(expected)
    })

    it("gives the same offer from the same RNG state", () => {
        expect(rollOffer([], rng, table)).toEqual(rollOffer([], rng, table))
    })

    it("varies with the RNG state", () => {
        const offers = new Set(
            [1, 2, 3, 4, 5, 6, 7, 8].map((s) => rollOffer([], seedRNG(s), table)[0].join())
        )
        expect(offers.size).toBeGreaterThan(1)
    })

    it("offers fewer when fewer are eligible", () => {
        const small = validateUpgrades([def({ id: "a" }), def({ id: "b", maxStacks: 1 })])
        const [offer, after] = rollOffer(["b"], rng, small)
        expect(offer).toEqual(["a"])
        expect(after).toBe(nextValue(rng)[1])
    })

    it("offers nothing and leaves the RNG alone when nothing is eligible", () => {
        const one = validateUpgrades([def({ id: "a", maxStacks: 1 })])
        expect(rollOffer(["a"], rng, one)).toEqual([[], rng])
    })

    it("never offers an upgrade at maxStacks", () => {
        const picks = ["coins", "slow", "yield", "yield"]
        for (let s = 0; s < 50; s++) {
            const [offer] = rollOffer(picks, seedRNG(s), table)
            expect(offer.sort()).toEqual(["grow", "plot"])
        }
    })
})
