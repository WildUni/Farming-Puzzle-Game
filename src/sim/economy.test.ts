import { describe, it, expect } from "vitest"
import {
    validateEconomy,
    ECONOMY,
    storageCap,
    storageUsed,
    storageFree,
    sellValue,
    fertilizerAllowed,
    fertilizedReadyAt,
    rerollPrice
} from "./economy"
import type { EconomyConfig } from "./economy"
import { createGame } from "./main"
import { MODES } from "./modes"
import type { Crop, GameState } from "./types"
import shipped from "../data/economy.json"

const raw = {
    sellPricePct: 25,
    fertilizer: { unlock: "basic", cutPct: 50 },
    reroll: { base: 5, growth: 1.5 }
}

function broken(edit: (c: Record<string, Record<string, unknown>>) => void): unknown {
    const copy = structuredClone(raw) as unknown as Record<string, Record<string, unknown>>
    edit(copy)
    return copy
}

function survival(overrides: Partial<GameState> = {}): GameState {
    return {
        ...createGame(1, { mode: "survival", allowPowerUps: true, allowEvents: true }),
        ...overrides
    }
}

function timed(overrides: Partial<GameState> = {}): GameState {
    return {
        ...createGame(1, { mode: "timed", allowPowerUps: true, allowEvents: true }),
        ...overrides
    }
}

const garlic: Crop = { id: "garlic", growTicks: 80, yield: 2, value: 2, fertilizerCost: 4 }
const pumpkin: Crop = { id: "pumpkin", growTicks: 250, yield: 5, value: 12, fertilizerCost: 1 }

describe("validateEconomy", () => {
    it("accepts the shipped economy.json", () => {
        expect(validateEconomy(shipped)).toEqual(ECONOMY)
    })

    it("accepts a valid config", () => {
        expect(validateEconomy(raw)).toEqual(raw)
    })

    it.each<[string, unknown]>([
        ["not an object", null],
        ["sellPricePct 0", broken((c) => ((c as Record<string, unknown>).sellPricePct = 0))],
        [
            "sellPricePct above 100",
            broken((c) => ((c as Record<string, unknown>).sellPricePct = 101))
        ],
        [
            "sellPricePct fractional",
            broken((c) => ((c as Record<string, unknown>).sellPricePct = 2.5))
        ],
        ["fertilizer missing", broken((c) => delete c.fertilizer)],
        ["fertilizer.unlock unknown", broken((c) => (c.fertilizer.unlock = "shop"))],
        ["fertilizer.cutPct 0", broken((c) => (c.fertilizer.cutPct = 0))],
        ["fertilizer.cutPct above 100", broken((c) => (c.fertilizer.cutPct = 101))],
        ["reroll missing", broken((c) => delete c.reroll)],
        ["reroll.base 0", broken((c) => (c.reroll.base = 0))],
        ["reroll.base fractional", broken((c) => (c.reroll.base = 2.5))],
        ["reroll.growth below 1", broken((c) => (c.reroll.growth = 0.9))],
        ["reroll.growth text", broken((c) => (c.reroll.growth = "2"))]
    ])("throws for %s", (_, bad) => {
        expect(() => validateEconomy(bad)).toThrow(/economy config/)
    })
})

describe("storage", () => {
    it("Survival and Timed read their own caps", () => {
        expect(storageCap(survival())).toBe(MODES.survival.storageCap)
        expect(storageCap(timed())).toBe(MODES.timed.storageCap)
    })

    it("adds up every crop held, and frees what is left of the cap", () => {
        const state = survival({ inventory: { garlic: 3, pumpkin: 5 } })
        expect(storageUsed(state)).toBe(8)
        expect(storageFree(state)).toBe(MODES.survival.storageCap - 8)
    })

    it("never reports less than 0 free", () => {
        const state = survival({ inventory: { garlic: MODES.survival.storageCap + 3 } })
        expect(storageFree(state)).toBe(0)
    })

    it("held fertilizer does not count", () => {
        expect(storageUsed(survival({ fertilizer: 9 }))).toBe(0)
    })
})

describe("sellValue", () => {
    it("pays sellPricePct of the value, rounding the total down", () => {
        const config: EconomyConfig = { ...ECONOMY, sellPricePct: 25 }
        expect(sellValue(pumpkin, 1, config)).toBe(3)
        expect(sellValue(pumpkin, 3, config)).toBe(9)
        expect(sellValue(garlic, 1, config)).toBe(0)
        expect(sellValue(garlic, 2, config)).toBe(1)
        expect(sellValue(garlic, 3, config)).toBe(1)
    })
})

describe("fertilizer rules", () => {
    it("is allowed as a basic action, or only with fertilizerUnlocked when locked", () => {
        const basic: EconomyConfig = { ...ECONOMY, fertilizer: { unlock: "basic", cutPct: 50 } }
        const locked: EconomyConfig = { ...ECONOMY, fertilizer: { unlock: "upgrade", cutPct: 50 } }
        expect(fertilizerAllowed(survival(), basic)).toBe(true)
        expect(fertilizerAllowed(survival(), locked)).toBe(false)
    })

    it("cuts cutPct of the remaining growth time, rounded down", () => {
        const config: EconomyConfig = { ...ECONOMY, fertilizer: { unlock: "basic", cutPct: 50 } }
        const plot = { state: "growing" as const, cropId: "garlic", plantedAt: 0, readyAt: 100 }
        expect(fertilizedReadyAt(plot, 0, config)).toBe(50)
        expect(fertilizedReadyAt(plot, 41, config)).toBe(71) // 59 left, 29 cut
        expect(fertilizedReadyAt(plot, 100, config)).toBe(100)
        const all: EconomyConfig = { ...ECONOMY, fertilizer: { unlock: "basic", cutPct: 100 } }
        expect(fertilizedReadyAt(plot, 30, all)).toBe(30)
    })
})

describe("rerollPrice", () => {
    it("follows round(base x growth^n)", () => {
        const config: EconomyConfig = { ...ECONOMY, reroll: { base: 5, growth: 1.5 } }
        expect([0, 1, 2, 3].map((n) => rerollPrice(n, config))).toEqual([5, 8, 11, 17])
    })

    it("never goes down", () => {
        for (let n = 1; n < 20; n++)
            expect(rerollPrice(n)).toBeGreaterThanOrEqual(rerollPrice(n - 1))
    })
})

describe("a new run", () => {
    it("starts with 0 coins, 0 fertilizer and no rerolls bought", () => {
        for (const state of [survival(), timed()]) {
            expect(state.coins).toBe(0)
            expect(state.fertilizer).toBe(0)
            expect(state.rerollsThisOffer).toBe(0)
        }
    })
})
