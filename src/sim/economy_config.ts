// economy.json, loaded and checked. Kept apart from economy.ts so upgrades.ts can read it
// without importing economy.ts, which imports upgrades.ts. See specs/economy.md.
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

// True when fertilizer is locked behind the Compost upgrade.
function fertilizerLocked(config: EconomyConfig = ECONOMY): boolean {
    return config.fertilizer.unlock === "upgrade"
}

export { validateEconomy, ECONOMY, fertilizerLocked }
export type { EconomyConfig, FertilizerUnlock }
