import { describe, it, expect } from "vitest"
import {
    validateDifficulty,
    DIFFICULTY,
    levelFor,
    orderRulesFor,
    eventGapTicks,
    lifePrice
} from "./difficulty"
import type { DifficultyConfig } from "./difficulty"
import { ORDER_TICKS, TICKS_PER_SECOND } from "./game_constants"
import shipped from "../data/difficulty.json"

// A small valid config, so tests don't depend on the tuned numbers.
const config: DifficultyConfig = {
    startLives: 3,
    coinsPerOrder: 4,
    lifePrice: { base: 10, growth: 1.5 },
    ordersPerLevel: 3,
    levels: [
        {
            orderTimeMultiplier: 1.5,
            maxOpenOrders: 1,
            minAmount: 2,
            maxAmount: 4,
            eventGapSeconds: 30
        },
        {
            orderTimeMultiplier: 1,
            maxOpenOrders: 2,
            minAmount: 3,
            maxAmount: 6,
            eventGapSeconds: 20
        },
        {
            orderTimeMultiplier: 0.5,
            maxOpenOrders: 3,
            minAmount: 5,
            maxAmount: 9,
            eventGapSeconds: 10
        }
    ]
}

// Deep copy of `config` with one change made by `edit`.
function broken(edit: (c: Record<string, unknown> & DifficultyConfig) => void): unknown {
    const copy = structuredClone(config) as Record<string, unknown> & DifficultyConfig
    edit(copy)
    return copy
}

describe("validateDifficulty", () => {
    it("accepts the shipped difficulty.json", () => {
        expect(() => validateDifficulty(shipped)).not.toThrow()
        expect(DIFFICULTY).toEqual(shipped)
    })

    it("accepts a valid config and returns it", () => {
        expect(validateDifficulty(config)).toEqual(config)
    })

    it.each<[string, unknown]>([
        ["not an object", null],
        ["startLives 0", broken((c) => (c.startLives = 0))],
        ["startLives fractional", broken((c) => (c.startLives = 2.5))],
        ["startLives missing", broken((c) => delete (c as Partial<DifficultyConfig>).startLives)],
        ["coinsPerOrder negative", broken((c) => (c.coinsPerOrder = -1))],
        ["coinsPerOrder text", broken((c) => (c.coinsPerOrder = "4" as unknown as number))],
        ["lifePrice missing", broken((c) => delete (c as Partial<DifficultyConfig>).lifePrice)],
        ["lifePrice.base 0", broken((c) => (c.lifePrice.base = 0))],
        ["lifePrice.base fractional", broken((c) => (c.lifePrice.base = 2.5))],
        ["lifePrice.growth below 1", broken((c) => (c.lifePrice.growth = 0.9))],
        ["ordersPerLevel 0", broken((c) => (c.ordersPerLevel = 0))],
        ["levels empty", broken((c) => (c.levels = []))],
        ["levels not a list", broken((c) => (c.levels = {} as unknown as []))],
        ["multiplier 0", broken((c) => (c.levels[1].orderTimeMultiplier = 0))],
        ["multiplier rounds to 0 ticks", broken((c) => (c.levels[1].orderTimeMultiplier = 0.0001))],
        ["maxOpenOrders 0", broken((c) => (c.levels[0].maxOpenOrders = 0))],
        ["minAmount 0", broken((c) => (c.levels[0].minAmount = 0))],
        ["maxAmount below minAmount", broken((c) => (c.levels[2].maxAmount = 4))],
        ["maxAmount fractional", broken((c) => (c.levels[2].maxAmount = 9.5))],
        ["eventGapSeconds 0", broken((c) => (c.levels[0].eventGapSeconds = 0))],
        [
            "eventGapSeconds missing",
            broken((c) => delete (c.levels[0] as Partial<(typeof c.levels)[0]>).eventGapSeconds)
        ]
    ])("throws for %s", (_, raw) => {
        expect(() => validateDifficulty(raw)).toThrow(Error)
    })

    it("names the bad field in the error", () => {
        expect(() => validateDifficulty(broken((c) => (c.levels[2].minAmount = 0)))).toThrow(
            /levels\[2\]\.minAmount/
        )
    })
})

describe("levelFor", () => {
    it("starts at 0 and goes up every ordersPerLevel filled orders", () => {
        expect(levelFor(0, config)).toBe(0)
        expect(levelFor(2, config)).toBe(0)
        expect(levelFor(3, config)).toBe(1)
        expect(levelFor(5, config)).toBe(1)
        expect(levelFor(6, config)).toBe(2)
    })

    it("stops at the last level", () => {
        expect(levelFor(9, config)).toBe(2)
        expect(levelFor(1000, config)).toBe(2)
    })

    it("uses the shipped config by default", () => {
        const last = DIFFICULTY.levels.length - 1
        expect(levelFor(0)).toBe(0)
        expect(levelFor(DIFFICULTY.ordersPerLevel)).toBe(Math.min(1, last))
        expect(levelFor(1_000_000)).toBe(last)
    })
})

describe("orderRulesFor", () => {
    it("matches each row, with orderTicks rounded from ORDER_TICKS", () => {
        config.levels.forEach((row, level) => {
            expect(orderRulesFor(level, config)).toEqual({
                maxOpenOrders: row.maxOpenOrders,
                orderTicks: Math.round(ORDER_TICKS * row.orderTimeMultiplier),
                minAmount: row.minAmount,
                maxAmount: row.maxAmount
            })
        })
        expect(orderRulesFor(0, config).orderTicks).toBe(900)
    })

    it("uses the last row for levels past the end", () => {
        expect(orderRulesFor(3, config)).toEqual(orderRulesFor(2, config))
        expect(orderRulesFor(50, config)).toEqual(orderRulesFor(2, config))
    })
})

describe("lifePrice", () => {
    it("follows round(base x growth^n) from the config", () => {
        const { base, growth } = DIFFICULTY.lifePrice
        for (let n = 0; n < 10; n++) {
            expect(lifePrice(n)).toBe(Math.round(base * growth ** n))
        }
    })

    it("gives 10, 15, 23, 34, 51 for base 10 and growth 1.5", () => {
        expect([0, 1, 2, 3, 4].map((n) => lifePrice(n, config))).toEqual([10, 15, 23, 34, 51])
    })

    it("never goes down", () => {
        for (let n = 1; n < 20; n++) expect(lifePrice(n)).toBeGreaterThanOrEqual(lifePrice(n - 1))
    })
})

describe("shipped curve", () => {
    it("never gets easier from one level to the next", () => {
        for (let level = 1; level < DIFFICULTY.levels.length; level++) {
            const prev = orderRulesFor(level - 1)
            const cur = orderRulesFor(level)
            expect(cur.orderTicks).toBeLessThanOrEqual(prev.orderTicks)
            expect(cur.maxOpenOrders).toBeGreaterThanOrEqual(prev.maxOpenOrders)
            expect(cur.minAmount).toBeGreaterThanOrEqual(prev.minAmount)
            expect(cur.maxAmount).toBeGreaterThanOrEqual(prev.maxAmount)
        }
    })

    it("allows two or more open orders by the last level", () => {
        expect(orderRulesFor(DIFFICULTY.levels.length - 1).maxOpenOrders).toBeGreaterThanOrEqual(2)
    })
})

describe("eventGapTicks", () => {
    it("follows each row, and uses the last row past the end", () => {
        expect(eventGapTicks(0, config)).toBe(30 * TICKS_PER_SECOND)
        expect(eventGapTicks(2, config)).toBe(10 * TICKS_PER_SECOND)
        expect(eventGapTicks(9, config)).toBe(10 * TICKS_PER_SECOND)
    })

    it("never goes up from one shipped level to the next", () => {
        const gaps = DIFFICULTY.levels.map((_, i) => eventGapTicks(i))
        for (let i = 1; i < gaps.length; i++) expect(gaps[i]).toBeLessThanOrEqual(gaps[i - 1])
    })
})
