// Per-mode rules: how a run starts and when it ends. Every number comes from
// src/data/modes.json. See specs/modes.md.
import { TICKS_PER_SECOND } from "./game_constants"
import rawModes from "../data/modes.json"

type SurvivalMode = {
    startLives: number
    maxLives: number // Survival lives can't go above this, plus Extra heart
}

// Timed combo: each order filled in a row adds stepPct to the score multiplier, up to capPct.
// The streak breaks when an order fails or windowTicks pass with no order filled.
type ComboRules = {
    stepPct: number
    capPct: number
    windowTicks: number
}

type TimedMode = {
    runTicks: number // a Timed run ends on this tick
    openOrders: number // step keeps this many orders open in Timed
    combo: ComboRules
}

type ModesConfig = {
    survival: SurvivalMode
    timed: TimedMode
}

function isObject(v: unknown): v is Record<string, unknown> {
    return typeof v === "object" && v !== null && !Array.isArray(v)
}

function fail(field: string, rule: string): never {
    throw new Error(`modes config: ${field} must be ${rule}`)
}

function wholeAtLeast(
    obj: Record<string, unknown>,
    key: string,
    min: number,
    path: string
): number {
    const v = obj[key]
    if (typeof v !== "number" || !Number.isInteger(v) || v < min) {
        fail(path, `a whole number >= ${min}`)
    }
    return v
}

// Checks a parsed JSON value and returns it typed, with seconds turned into ticks.
// Throws naming the bad field.
function validateModes(raw: unknown): ModesConfig {
    if (!isObject(raw)) fail("config", "an object")

    const survival = raw.survival
    if (!isObject(survival)) fail("survival", "an object")
    const startLives = wholeAtLeast(survival, "startLives", 1, "survival.startLives")
    const maxLives = wholeAtLeast(survival, "maxLives", startLives, "survival.maxLives")

    const timed = raw.timed
    if (!isObject(timed)) fail("timed", "an object")
    const runSeconds = wholeAtLeast(timed, "runSeconds", 1, "timed.runSeconds")
    const openOrders = wholeAtLeast(timed, "openOrders", 1, "timed.openOrders")

    const combo = timed.combo
    if (!isObject(combo)) fail("timed.combo", "an object")
    const stepPct = wholeAtLeast(combo, "stepPct", 1, "timed.combo.stepPct")
    const capPct = wholeAtLeast(combo, "capPct", 100, "timed.combo.capPct")
    const windowSeconds = wholeAtLeast(combo, "windowSeconds", 1, "timed.combo.windowSeconds")

    return {
        survival: { startLives, maxLives },
        timed: {
            runTicks: runSeconds * TICKS_PER_SECOND,
            openOrders,
            combo: { stepPct, capPct, windowTicks: windowSeconds * TICKS_PER_SECOND }
        }
    }
}

const MODES: ModesConfig = validateModes(rawModes)

// Score multiplier, in percent, for the next order filled with `combo` orders already filled
// in a row: 100 + combo x stepPct, capped at capPct.
function comboPct(combo: number, rules: ComboRules = MODES.timed.combo): number {
    return Math.min(100 + combo * rules.stepPct, rules.capPct)
}

export { validateModes, MODES, comboPct }
export type { ModesConfig, SurvivalMode, TimedMode, ComboRules }
