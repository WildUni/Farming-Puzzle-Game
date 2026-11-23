import { describe, it, expect } from "vitest"
import {
    validateScoring,
    SCORING,
    NO_SCORING,
    scoringRules,
    orderPoints,
    scoreBreakdown,
    finalScore
} from "./scoring"
import type { ScoringRules } from "./scoring"
import { createGame } from "./main"
import { comboPct } from "./modes"
import { DIFFICULTY } from "./difficulty"
import shipped from "../data/scoring.json"
import type { GameMode, GameState, Order } from "./types"

// A fresh game in `mode` with some fields changed.
function game(mode: GameMode, overrides: Partial<GameState> = {}): GameState {
    return { ...createGame(1, { mode, allowPowerUps: false, allowEvents: false }), ...overrides }
}

// An order worth `value`, with `left` of its 600 ticks left on tick 100.
function order(value: number, left = 0): Order {
    return {
        id: 0,
        required: { garlic: 1 },
        value,
        expiresAt: 100 + left,
        timeLimit: 600,
        small: false,
        rush: false
    }
}

const rules = (overrides: Partial<ScoringRules>): ScoringRules => ({ ...NO_SCORING, ...overrides })

const valid = {
    survival: {
        levelBonusPct: 10,
        speedBonusPct: 0,
        bestComboPoints: 0,
        failedOrderPoints: 0,
        coinsPerPoint: 2
    },
    timed: {
        levelBonusPct: 0,
        speedBonusPct: 50,
        bestComboPoints: 20,
        failedOrderPoints: 5,
        coinsPerPoint: 4
    }
}

// Deep copy of `valid` with one change made by `edit`.
function broken(edit: (c: Record<string, Record<string, unknown>>) => void): unknown {
    const copy = structuredClone(valid) as unknown as Record<string, Record<string, unknown>>
    edit(copy)
    return copy
}

describe("validateScoring", () => {
    it("accepts the shipped scoring.json", () => {
        expect(validateScoring(shipped)).toEqual(shipped)
        expect(SCORING).toEqual(shipped)
    })

    it("accepts a valid config", () => {
        expect(validateScoring(valid)).toEqual(valid)
    })

    it.each<[string, unknown]>([
        ["not an object", null],
        ["survival missing", broken((c) => delete c.survival)],
        ["timed not an object", broken((c) => ((c as Record<string, unknown>).timed = []))],
        ["levelBonusPct missing", broken((c) => delete c.survival.levelBonusPct)],
        ["speedBonusPct negative", broken((c) => (c.timed.speedBonusPct = -1))],
        ["bestComboPoints fractional", broken((c) => (c.timed.bestComboPoints = 2.5))],
        ["failedOrderPoints text", broken((c) => (c.timed.failedOrderPoints = "5"))],
        ["coinsPerPoint missing", broken((c) => delete c.survival.coinsPerPoint)]
    ])("throws for %s", (_, bad) => {
        expect(() => validateScoring(bad)).toThrow(/scoring config/)
    })
})

describe("scoringRules", () => {
    it("gives each mode's entry, and no scoring for Puzzle", () => {
        expect(scoringRules("survival")).toEqual(SCORING.survival)
        expect(scoringRules("timed")).toEqual(SCORING.timed)
        expect(scoringRules("puzzle")).toEqual(NO_SCORING)
    })
})

describe("orderPoints", () => {
    it("is the order's value with every rate 0 and no combo", () => {
        for (const mode of ["survival", "timed", "puzzle"] as const) {
            expect(orderPoints(game(mode, { tick: 100 }), order(37, 300), NO_SCORING)).toBe(37)
        }
    })

    it("Survival: level 1 adds nothing; each level past it adds levelBonusPct, rounding down", () => {
        const r = rules({ levelBonusPct: 10 })
        const at = (level: number) =>
            game("survival", { tick: 100, ordersCompleted: level * DIFFICULTY.ordersPerLevel })
        expect(orderPoints(at(0), order(37), r)).toBe(37)
        expect(orderPoints(at(1), order(37), r)).toBe(Math.floor(37 * 1.1)) // 40
        expect(orderPoints(at(2), order(37), r)).toBe(Math.floor((37 * 120) / 100)) // 44
    })

    it("Timed: the combo multiplies the value and the level is ignored", () => {
        const r = rules({ levelBonusPct: 50 })
        const s = game("timed", { tick: 100, combo: 3, ordersCompleted: 999 })
        expect(orderPoints(s, order(37), r)).toBe(Math.floor((37 * comboPct(3)) / 100))
    })

    it("Survival ignores the combo field", () => {
        const s = game("survival", { tick: 100, combo: 5 })
        expect(orderPoints(s, order(37), NO_SCORING)).toBe(37)
    })

    it("speed bonus: full with all the time left, half at half, 0 when due", () => {
        const r = rules({ speedBonusPct: 50 })
        const s = game("timed", { tick: 100 })
        expect(orderPoints(s, order(40, 600), r)).toBe(40 + 20)
        expect(orderPoints(s, order(40, 300), r)).toBe(40 + 10)
        expect(orderPoints(s, order(40, 0), r)).toBe(40)
        expect(orderPoints(s, order(40, 599), r)).toBe(40 + Math.floor((40 * 50 * 599) / 60_000))
    })

    it("speed bonus stops at full when an effect pushed the deadline past the time limit", () => {
        const r = rules({ speedBonusPct: 50 })
        expect(orderPoints(game("timed", { tick: 100 }), order(40, 900), r)).toBe(60)
    })
})

describe("scoreBreakdown", () => {
    const end = { score: 300, bestCombo: 7, ordersFailed: 3, coins: 13 }

    it("lists only parts whose rate is above 0, in order, with counts and points", () => {
        const all = rules({ bestComboPoints: 20, failedOrderPoints: 5, coinsPerPoint: 2 })
        expect(scoreBreakdown(game("timed", end), all)).toEqual({
            orderPoints: 300,
            lines: [
                { kind: "bestCombo", count: 7, points: 140 },
                { kind: "failedOrders", count: 3, points: -15 },
                { kind: "coins", count: 13, points: 6 }
            ],
            total: 431
        })
        const coinsOnly = rules({ coinsPerPoint: 2 })
        expect(scoreBreakdown(game("survival", end), coinsOnly).lines).toEqual([
            { kind: "coins", count: 13, points: 6 }
        ])
    })

    it("uses the shipped rules for the mode by default", () => {
        const timed = scoreBreakdown(game("timed", end))
        expect(timed.lines.map((l) => l.kind)).toEqual(["bestCombo", "failedOrders", "coins"])
        expect(timed.total).toBe(
            300 +
                7 * SCORING.timed.bestComboPoints -
                3 * SCORING.timed.failedOrderPoints +
                Math.floor(13 / SCORING.timed.coinsPerPoint)
        )
        const survival = scoreBreakdown(game("survival", end))
        expect(survival.lines).toEqual([
            { kind: "coins", count: 13, points: Math.floor(13 / SCORING.survival.coinsPerPoint) }
        ])
    })

    it("never goes below 0", () => {
        const harsh = rules({ failedOrderPoints: 100 })
        const s = game("timed", { score: 50, ordersFailed: 4 })
        expect(scoreBreakdown(s, harsh).total).toBe(0)
    })

    it("Puzzle: no lines, and the total is the score", () => {
        expect(scoreBreakdown(game("puzzle", end))).toEqual({
            orderPoints: 300,
            lines: [],
            total: 300
        })
    })

    it("finalScore is the breakdown's total", () => {
        for (const mode of ["survival", "timed", "puzzle"] as const) {
            const s = game(mode, end)
            expect(finalScore(s)).toBe(scoreBreakdown(s).total)
        }
    })
})
