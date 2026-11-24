// Per-mode rules: how a run starts and when it ends. Every number comes from
// src/data/modes.json. See specs/modes.md.
import { TICKS_PER_SECOND } from "./game_constants"
import rawModes from "../data/modes.json"

type SurvivalMode = {
    startLives: number
    maxLives: number // Survival lives can't go above this, plus Extra heart
    storageCap: number // most crops storage holds, before Bigger barn
    giantPenalty: { ticks: number; extraOrders: number } // a failed Giant order: more orders
}

// Timed combo: each order filled in a row adds stepPct to the score multiplier, up to capPct.
// The streak breaks when an order fails or windowTicks pass with no order filled.
type ComboRules = {
    stepPct: number
    capPct: number
    windowTicks: number
}

// Timed rush waves: at each of atTicks, step adds `orders` short orders past the open-order
// count. The screen warns warnTicks before each one.
type RushRules = {
    atTicks: number[] // ascending, each inside the run
    warnTicks: number
    orders: number // rush orders a wave adds
    timePct: number // % of the usual order time
    valuePct: number // % of the order's usual value
}

type TimedMode = {
    runTicks: number // a Timed run ends on this tick
    openOrders: number // step keeps this many orders open in Timed
    storageCap: number // most crops storage holds, before Bigger barn
    finaleTicks: number // Grand finale: the run's last finaleTicks score more
    pairTicks: number // Double delivery: a fill within pairTicks of an unpaired one pairs with it
    giantPenalty: { ticks: number } // a failed Giant order: no new orders for this long
    combo: ComboRules
    rush: RushRules
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
    const survivalCap = wholeAtLeast(survival, "storageCap", 1, "survival.storageCap")
    const survivalPenalty = survival.giantPenalty
    if (!isObject(survivalPenalty)) fail("survival.giantPenalty", "an object")
    const survivalPenaltySeconds = wholeAtLeast(
        survivalPenalty,
        "seconds",
        1,
        "survival.giantPenalty.seconds"
    )
    const extraOrders = wholeAtLeast(
        survivalPenalty,
        "extraOrders",
        1,
        "survival.giantPenalty.extraOrders"
    )

    const timed = raw.timed
    if (!isObject(timed)) fail("timed", "an object")
    const runSeconds = wholeAtLeast(timed, "runSeconds", 1, "timed.runSeconds")
    const openOrders = wholeAtLeast(timed, "openOrders", 1, "timed.openOrders")
    const timedCap = wholeAtLeast(timed, "storageCap", 1, "timed.storageCap")
    const finaleSeconds = wholeAtLeast(timed, "finaleSeconds", 1, "timed.finaleSeconds")
    if (finaleSeconds > runSeconds) fail("timed.finaleSeconds", "at most timed.runSeconds")
    const pairSeconds = wholeAtLeast(timed, "pairSeconds", 1, "timed.pairSeconds")
    const timedPenalty = timed.giantPenalty
    if (!isObject(timedPenalty)) fail("timed.giantPenalty", "an object")
    const timedPenaltySeconds = wholeAtLeast(
        timedPenalty,
        "seconds",
        1,
        "timed.giantPenalty.seconds"
    )

    const combo = timed.combo
    if (!isObject(combo)) fail("timed.combo", "an object")
    const stepPct = wholeAtLeast(combo, "stepPct", 1, "timed.combo.stepPct")
    const capPct = wholeAtLeast(combo, "capPct", 100, "timed.combo.capPct")
    const windowSeconds = wholeAtLeast(combo, "windowSeconds", 1, "timed.combo.windowSeconds")

    return {
        survival: {
            startLives,
            maxLives,
            storageCap: survivalCap,
            giantPenalty: { ticks: survivalPenaltySeconds * TICKS_PER_SECOND, extraOrders }
        },
        timed: {
            runTicks: runSeconds * TICKS_PER_SECOND,
            openOrders,
            storageCap: timedCap,
            finaleTicks: finaleSeconds * TICKS_PER_SECOND,
            pairTicks: pairSeconds * TICKS_PER_SECOND,
            giantPenalty: { ticks: timedPenaltySeconds * TICKS_PER_SECOND },
            combo: { stepPct, capPct, windowTicks: windowSeconds * TICKS_PER_SECOND },
            rush: validateRush(timed.rush, runSeconds)
        }
    }
}

function validateRush(rush: unknown, runSeconds: number): RushRules {
    if (!isObject(rush)) fail("timed.rush", "an object")
    const at = rush.atSeconds
    if (!Array.isArray(at)) fail("timed.rush.atSeconds", "an array")
    const atSeconds = at.map((v: unknown, i) => {
        const path = `timed.rush.atSeconds[${i}]`
        if (typeof v !== "number" || !Number.isInteger(v) || v < 1 || v >= runSeconds) {
            fail(path, `a whole number from 1 to ${runSeconds - 1}`)
        }
        if (i > 0 && v <= at[i - 1]) fail(path, "above the time before it")
        return v
    })
    const warnSeconds = wholeAtLeast(rush, "warnSeconds", 0, "timed.rush.warnSeconds")
    atSeconds.forEach((t, i) => {
        const gap = t - (i === 0 ? 0 : atSeconds[i - 1])
        if (warnSeconds >= gap) {
            fail("timed.rush.warnSeconds", `shorter than the gap before every wave (${gap})`)
        }
    })
    const orders = wholeAtLeast(rush, "orders", 1, "timed.rush.orders")
    const timePct = wholeAtLeast(rush, "timePct", 1, "timed.rush.timePct")
    if (timePct > 100) fail("timed.rush.timePct", "at most 100")
    const valuePct = wholeAtLeast(rush, "valuePct", 1, "timed.rush.valuePct")
    return {
        atTicks: atSeconds.map((t) => t * TICKS_PER_SECOND),
        warnTicks: warnSeconds * TICKS_PER_SECOND,
        orders,
        timePct,
        valuePct
    }
}

const MODES: ModesConfig = validateModes(rawModes)

// Score multiplier, in percent, for the next order filled with `combo` orders already filled
// in a row: 100 + startPct + combo x (stepPct + stepBonusPct), capped at capPct. The two
// bonuses come from Head start and Combo builder.
function comboPct(
    combo: number,
    rules: ComboRules = MODES.timed.combo,
    stepBonusPct = 0,
    startPct = 0
): number {
    return Math.min(100 + startPct + combo * (rules.stepPct + stepBonusPct), rules.capPct)
}

// Index of the rush wave starting on `tick`, or null when none does.
function rushWaveAt(tick: number, rules: RushRules = MODES.timed.rush): number | null {
    const i = rules.atTicks.indexOf(tick)
    return i === -1 ? null : i
}

// The rush wave whose warning is showing on `tick`, or null outside every warning.
function upcomingRushWave(
    tick: number,
    rules: RushRules = MODES.timed.rush
): { index: number; startsAt: number } | null {
    const index = rules.atTicks.findIndex((at) => at - rules.warnTicks <= tick && tick < at)
    return index === -1 ? null : { index, startsAt: rules.atTicks[index] }
}

export { validateModes, MODES, comboPct, rushWaveAt, upcomingRushWave }
export type { ModesConfig, SurvivalMode, TimedMode, ComboRules, RushRules }
