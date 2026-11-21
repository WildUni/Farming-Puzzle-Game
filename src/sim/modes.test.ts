import { describe, it, expect } from "vitest"
import { validateModes, MODES } from "./modes"
import { TICKS_PER_SECOND } from "./game_constants"
import shipped from "../data/modes.json"

// A small valid config, as it appears in modes.json (seconds, not ticks).
const raw = {
    survival: { startLives: 2, maxLives: 4 },
    timed: { runSeconds: 60, openOrders: 2, combo: { stepPct: 50, capPct: 200, windowSeconds: 5 } }
}

// Deep copy of `raw` with one change made by `edit`.
function broken(edit: (c: Record<string, Record<string, unknown>>) => void): unknown {
    const copy = structuredClone(raw) as unknown as Record<string, Record<string, unknown>>
    edit(copy)
    return copy
}

describe("validateModes", () => {
    it("accepts the shipped modes.json and turns seconds into ticks", () => {
        expect(() => validateModes(shipped)).not.toThrow()
        expect(MODES).toEqual({
            survival: shipped.survival,
            timed: {
                runTicks: shipped.timed.runSeconds * TICKS_PER_SECOND,
                openOrders: shipped.timed.openOrders,
                combo: {
                    stepPct: shipped.timed.combo.stepPct,
                    capPct: shipped.timed.combo.capPct,
                    windowTicks: shipped.timed.combo.windowSeconds * TICKS_PER_SECOND
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
            survival: { startLives: 2, maxLives: 4 },
            timed: {
                runTicks: 60 * TICKS_PER_SECOND,
                openOrders: 2,
                combo: { stepPct: 50, capPct: 200, windowTicks: 5 * TICKS_PER_SECOND }
            }
        })
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
        ]
    ])("throws for %s", (_, bad) => {
        expect(() => validateModes(bad)).toThrow(/modes config/)
    })
})
