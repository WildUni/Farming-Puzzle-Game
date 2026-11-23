// The in-run economy: the storage cap, sell prices, fertilizer and paid upgrade rerolls.
// Numbers come from src/data/economy.json, crops.json and modes.json. See specs/economy.md.
import type { Crop, GameState, Plot } from "./types"
import { MODES } from "./modes"
import { modifiersFor } from "./upgrades"
import rawEconomy from "../data/economy.json"

type FertilizerUnlock = "basic" | "upgrade"

type EconomyConfig = {
    sellPricePct: number // a crop sells for this % of its value
    fertilizer: { unlock: FertilizerUnlock; cutPct: number } // cutPct: % of remaining growth removed
    reroll: { base: number; growth: number } // price of an offer's nth reroll: base x growth^n
}

function isObject(v: unknown): v is Record<string, unknown> {
    return typeof v === "object" && v !== null && !Array.isArray(v)
}

function fail(field: string, rule: string): never {
    throw new Error(`economy config: ${field} must be ${rule}`)
}

function wholeBetween(v: unknown, min: number, max: number, field: string): number {
    if (typeof v !== "number" || !Number.isInteger(v) || v < min || v > max) {
        fail(field, max === Infinity ? `a whole number >= ${min}` : `a whole number ${min}-${max}`)
    }
    return v
}

// Checks a parsed JSON value and returns it typed. Throws naming the bad field.
function validateEconomy(raw: unknown): EconomyConfig {
    if (!isObject(raw)) fail("config", "an object")
    const sellPricePct = wholeBetween(raw.sellPricePct, 1, 100, "sellPricePct")

    const fertilizer = raw.fertilizer
    if (!isObject(fertilizer)) fail("fertilizer", "an object")
    const unlock = fertilizer.unlock
    if (unlock !== "basic" && unlock !== "upgrade")
        fail("fertilizer.unlock", '"basic" or "upgrade"')
    const cutPct = wholeBetween(fertilizer.cutPct, 1, 100, "fertilizer.cutPct")

    const reroll = raw.reroll
    if (!isObject(reroll)) fail("reroll", "an object")
    const base = wholeBetween(reroll.base, 1, Infinity, "reroll.base")
    const growth = reroll.growth
    if (typeof growth !== "number" || !Number.isFinite(growth) || growth < 1) {
        fail("reroll.growth", "a number >= 1")
    }

    return { sellPricePct, fertilizer: { unlock, cutPct }, reroll: { base, growth } }
}

const ECONOMY: EconomyConfig = validateEconomy(rawEconomy)

// Most crops the run can hold: the mode's cap plus Bigger barn. Puzzle has no cap yet.
function storageCap(state: GameState): number {
    const bonus = modifiersFor(state.upgrades).storageBonus
    switch (state.mode) {
        case "survival":
            return MODES.survival.storageCap + bonus
        case "timed":
            return MODES.timed.storageCap + bonus
        case "puzzle":
            return Infinity
    }
}

// Crops held, every kind added up. Held fertilizer doesn't count.
function storageUsed(state: GameState): number {
    return Object.values(state.inventory).reduce((sum, n) => sum + n, 0)
}

// Crops that still fit, never below 0.
function storageFree(state: GameState): number {
    return Math.max(0, storageCap(state) - storageUsed(state))
}

// Coins for selling `amount` of `crop`. The total is rounded down, not each crop.
function sellValue(crop: Crop, amount: number, config: EconomyConfig = ECONOMY): number {
    return Math.floor((amount * crop.value * config.sellPricePct) / 100)
}

// True when fertilizer can be made and used in this run.
function fertilizerAllowed(state: GameState, config: EconomyConfig = ECONOMY): boolean {
    if (config.fertilizer.unlock === "basic") return true
    return modifiersFor(state.upgrades).fertilizerUnlocked > 0
}

// The ready tick fertilizer gives a growing plot at `now`: cutPct of the remaining growth time
// removed, rounded down.
function fertilizedReadyAt(
    plot: Extract<Plot, { state: "growing" }>,
    now: number,
    config: EconomyConfig = ECONOMY
): number {
    const left = Math.max(0, plot.readyAt - now)
    return plot.readyAt - Math.floor((left * config.fertilizer.cutPct) / 100)
}

// Plots fertilizer can go on now: growing and not yet fertilized. The screen highlights them.
function fertilizerTargets(state: GameState): number[] {
    return state.plots.flatMap((p, i) =>
        p.state === "growing" && p.fertilized !== true ? [i] : []
    )
}

// Price of the next reroll when `rerolls` have already been bought for the open offer.
function rerollPrice(rerolls: number, config: EconomyConfig = ECONOMY): number {
    return Math.round(config.reroll.base * config.reroll.growth ** rerolls)
}

export {
    validateEconomy,
    ECONOMY,
    storageCap,
    storageUsed,
    storageFree,
    sellValue,
    fertilizerAllowed,
    fertilizedReadyAt,
    fertilizerTargets,
    rerollPrice
}
export type { EconomyConfig, FertilizerUnlock }
