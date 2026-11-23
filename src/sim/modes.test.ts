import { describe, it, expect } from "vitest"
import { validateModes, MODES, rushWaveAt, upcomingRushWave } from "./modes"
import type { RushRules } from "./modes"
import { TICKS_PER_SECOND } from "./game_constants"
import shipped from "../data/modes.json"

// A small valid config, as it appears in modes.json (seconds, not ticks).
const raw = {
    survival: { startLives: 2, maxLives: 4, storageCap: 15 },
    timed: {
        runSeconds: 60,
        openOrders: 2,
        storageCap: 18,
        combo: { stepPct: 50, capPct: 200, windowSeconds: 5 },
        rush: { atSeconds: [10, 30], warnSeconds: 3, orders: 2, timePct: 40, valuePct: 200 }
    }
}

// Deep copy of `raw` with one change made by `edit`.
function broken(edit: (c: Record<string, Record<string, unknown>>) => void): unknown {
    const copy = structuredClone(raw) as unknown as Record<string, Record<string, unknown>>
    edit(copy)
    return copy
}

// The rush block of a copy made by `broken`.
function rushOf(c: Record<string, Record<string, unknown>>): Record<string, unknown> {
    return c.timed.rush as Record<string, unknown>
}

describe("validateModes", () => {
    it("accepts the shipped modes.json and turns seconds into ticks", () => {
        expect(() => validateModes(shipped)).not.toThrow()
        expect(MODES).toEqual({
            survival: shipped.survival,
            timed: {
                runTicks: shipped.timed.runSeconds * TICKS_PER_SECOND,
                openOrders: shipped.timed.openOrders,
                storageCap: shipped.timed.storageCap,
                combo: {
                    stepPct: shipped.timed.combo.stepPct,
                    capPct: shipped.timed.combo.capPct,
                    windowTicks: shipped.timed.combo.windowSeconds * TICKS_PER_SECOND
                },
                rush: {
                    atTicks: shipped.timed.rush.atSeconds.map((s) => s * TICKS_PER_SECOND),
                    warnTicks: shipped.timed.rush.warnSeconds * TICKS_PER_SECOND,
                    orders: shipped.timed.rush.orders,
                    timePct: shipped.timed.rush.timePct,
                    valuePct: shipped.timed.rush.valuePct
                }
            }
        })
    })

    it("ships the Build Plan numbers: 3 lives, a 5-minute Timed run with 3 open orders", () => {
        expect(MODES.survival.startLives).toBe(3)
        expect(MODES.timed.runTicks).toBe(300 * TICKS_PER_SECOND)
        expect(MODES.timed.openOrders).toBe(3)
    })

    it("accepts a valid config", () => {
        expect(validateModes(raw)).toEqual({
            survival: { startLives: 2, maxLives: 4, storageCap: 15 },
            timed: {
                runTicks: 60 * TICKS_PER_SECOND,
                openOrders: 2,
                storageCap: 18,
                combo: { stepPct: 50, capPct: 200, windowTicks: 5 * TICKS_PER_SECOND },
                rush: {
                    atTicks: [10 * TICKS_PER_SECOND, 30 * TICKS_PER_SECOND],
                    warnTicks: 3 * TICKS_PER_SECOND,
                    orders: 2,
                    timePct: 40,
                    valuePct: 200
                }
            }
        })
    })

    it("ships rush waves inside the run, and accepts no waves at all", () => {
        expect(MODES.timed.rush.atTicks.length).toBeGreaterThan(0)
        for (const at of MODES.timed.rush.atTicks) expect(at).toBeLessThan(MODES.timed.runTicks)
        const none = broken((c) => (rushOf(c).atSeconds = []))
        expect(validateModes(none).timed.rush.atTicks).toEqual([])
    })

    it.each<[string, unknown]>([
        ["not an object", null],
        ["survival missing", broken((c) => delete c.survival)],
        ["startLives 0", broken((c) => (c.survival.startLives = 0))],
        ["startLives fractional", broken((c) => (c.survival.startLives = 2.5))],
        ["startLives missing", broken((c) => delete c.survival.startLives)],
        ["maxLives below startLives", broken((c) => (c.survival.maxLives = 1))],
        ["maxLives missing", broken((c) => delete c.survival.maxLives)],
        ["timed missing", broken((c) => delete c.timed)],
        ["runSeconds 0", broken((c) => (c.timed.runSeconds = 0))],
        ["runSeconds text", broken((c) => (c.timed.runSeconds = "60"))],
        ["openOrders 0", broken((c) => (c.timed.openOrders = 0))],
        ["openOrders missing", broken((c) => delete c.timed.openOrders)],
        ["survival.storageCap missing", broken((c) => delete c.survival.storageCap)],
        ["survival.storageCap 0", broken((c) => (c.survival.storageCap = 0))],
        ["timed.storageCap missing", broken((c) => delete c.timed.storageCap)],
        ["timed.storageCap fractional", broken((c) => (c.timed.storageCap = 12.5))],
        ["combo missing", broken((c) => delete c.timed.combo)],
        [
            "combo.stepPct 0",
            broken((c) => ((c.timed.combo as Record<string, unknown>).stepPct = 0))
        ],
        [
            "combo.capPct below 100",
            broken((c) => ((c.timed.combo as Record<string, unknown>).capPct = 99))
        ],
        [
            "combo.windowSeconds fractional",
            broken((c) => ((c.timed.combo as Record<string, unknown>).windowSeconds = 2.5))
        ],
        ["rush missing", broken((c) => delete c.timed.rush)],
        ["rush.atSeconds not an array", broken((c) => (rushOf(c).atSeconds = 10))],
        ["rush.atSeconds 0", broken((c) => (rushOf(c).atSeconds = [0, 30]))],
        ["rush.atSeconds at runSeconds", broken((c) => (rushOf(c).atSeconds = [10, 60]))],
        ["rush.atSeconds fractional", broken((c) => (rushOf(c).atSeconds = [10.5, 30]))],
        ["rush.atSeconds out of order", broken((c) => (rushOf(c).atSeconds = [30, 10]))],
        ["rush.atSeconds repeated", broken((c) => (rushOf(c).atSeconds = [10, 10]))],
        ["rush.warnSeconds negative", broken((c) => (rushOf(c).warnSeconds = -1))],
        ["rush.warnSeconds >= first wave", broken((c) => (rushOf(c).warnSeconds = 10))],
        ["rush.warnSeconds >= a gap", broken((c) => (rushOf(c).atSeconds = [10, 13]))],
        ["rush.orders 0", broken((c) => (rushOf(c).orders = 0))],
        ["rush.timePct 0", broken((c) => (rushOf(c).timePct = 0))],
        ["rush.timePct above 100", broken((c) => (rushOf(c).timePct = 101))],
        ["rush.valuePct 0", broken((c) => (rushOf(c).valuePct = 0))]
    ])("throws for %s", (_, bad) => {
        expect(() => validateModes(bad)).toThrow(/modes config/)
    })
})

describe("rush wave timing", () => {
    const rules: RushRules = {
        atTicks: [100, 300],
        warnTicks: 30,
        orders: 2,
        timePct: 50,
        valuePct: 100
    }

    it("rushWaveAt gives the wave's index on its start tick only", () => {
        expect(rushWaveAt(100, rules)).toBe(0)
        expect(rushWaveAt(300, rules)).toBe(1)
        for (const tick of [0, 99, 101, 299, 301]) expect(rushWaveAt(tick, rules)).toBeNull()
    })

    it("upcomingRushWave covers startsAt - warnTicks to startsAt - 1", () => {
        expect(upcomingRushWave(69, rules)).toBeNull()
        expect(upcomingRushWave(70, rules)).toEqual({ index: 0, startsAt: 100 })
        expect(upcomingRushWave(99, rules)).toEqual({ index: 0, startsAt: 100 })
        expect(upcomingRushWave(100, rules)).toBeNull()
        expect(upcomingRushWave(270, rules)).toEqual({ index: 1, startsAt: 300 })
    })

    it("never warns with warnTicks 0", () => {
        const quiet = { ...rules, warnTicks: 0 }
        for (const tick of [99, 100, 299]) expect(upcomingRushWave(tick, quiet)).toBeNull()
    })
})
