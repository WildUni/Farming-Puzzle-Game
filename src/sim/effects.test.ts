import { describe, it, expect } from "vitest"
import {
    rateShift,
    shiftPlot,
    shiftOrder,
    tickEffects,
    startEffect,
    cutGrowth,
    finishGrowth,
    stealCrop,
    appliesTo,
    harvestBlocked,
    scareCrows,
    deliverBonusAt,
    harvestBonusAt,
    fogged,
    finishAll,
    clearField
} from "./effects"
import { progress, updateGrowth } from "./plot"
import { isExpired, timeLeft } from "./orders"
import type { ActiveEffect, Order, Plot } from "./types"

function growing(plantedAt: number, readyAt: number): Plot {
    return { state: "growing", cropId: "garlic", plantedAt, readyAt }
}

function order(expiresAt: number, timeLimit = 100): Order {
    return {
        id: 0,
        required: { garlic: 2 },
        value: 4,
        expiresAt,
        timeLimit,
        small: false,
        rush: false
    }
}

function effect(
    kind: "growthRate" | "orderRate",
    pct: number,
    startedAt = 0,
    endsAt = 100
): ActiveEffect {
    return { source: kind, effect: { kind, pct }, startedAt, endsAt, exclude: [], only: null }
}

// Shifts on ticks startedAt+1 ... startedAt+n.
function shifts(pct: number, n: number): number[] {
    return Array.from({ length: n }, (_, i) => rateShift(pct, 0, i + 1))
}

// Runs tickEffects from tick `from + 1` to `to`, then growth, like step does.
function run(active: ActiveEffect[], plots: Plot[], orders: Order[], from: number, to: number) {
    let state = { active, plots, orders }
    for (let t = from + 1; t <= to; t++) {
        state = tickEffects(state.active, state.plots, state.orders, t)
        state = { ...state, plots: state.plots.map((p) => updateGrowth(p, t)) }
    }
    return state
}

describe("rateShift", () => {
    it("pct 0 gives +1 every tick and pct 200 gives -1 every tick", () => {
        expect(shifts(0, 5)).toEqual([1, 1, 1, 1, 1])
        expect(shifts(200, 5)).toEqual([-1, -1, -1, -1, -1])
    })

    it("pct 50 gives +1 every 2nd tick and pct 150 gives -1 every 2nd tick", () => {
        expect(shifts(50, 6)).toEqual([0, 1, 0, 1, 0, 1])
        expect(shifts(150, 6)).toEqual([0, -1, 0, -1, 0, -1])
    })

    it("adds up to trunc(n × (100 − pct) / 100)", () => {
        for (const pct of [0, 25, 50, 75, 130, 150, 200, 300]) {
            for (const n of [1, 7, 33, 100]) {
                const sum = shifts(pct, n).reduce((a, b) => a + b, 0)
                expect(sum).toBe(Math.trunc((n * (100 - pct)) / 100) + 0)
            }
        }
    })

    it("is 0 when now <= startedAt", () => {
        expect(rateShift(0, 10, 10)).toBe(0)
        expect(rateShift(0, 10, 5)).toBe(0)
    })
})

describe("shiftPlot", () => {
    it("moves readyAt and plantedAt together, so progress holds after a +1 shift", () => {
        const plot = growing(0, 100)
        const before = progress(plot, 40)
        const moved = shiftPlot(plot, 1, 41)
        expect(moved).toEqual(growing(1, 101))
        expect(progress(moved, 41)).toBeCloseTo(before)
    })

    it("never pulls readyAt below now, and moves plantedAt by the clamped amount", () => {
        expect(shiftPlot(growing(10, 50), -30, 40)).toEqual(growing(0, 40))
    })

    it("returns the same object for empty and ready plots and for a 0 shift", () => {
        const empty: Plot = { state: "empty" }
        const ready: Plot = { state: "ready", cropId: "garlic" }
        const plot = growing(0, 100)
        expect(shiftPlot(empty, 5, 1)).toBe(empty)
        expect(shiftPlot(ready, 5, 1)).toBe(ready)
        expect(shiftPlot(plot, 0, 1)).toBe(plot)
    })
})

describe("shiftOrder", () => {
    it("moves expiresAt, keeps timeLimit, never below now; 0 returns the same object", () => {
        const o = order(50)
        expect(shiftOrder(o, 3, 10)).toEqual({ ...o, expiresAt: 53 })
        expect(shiftOrder(o, -60, 10)).toEqual({ ...o, expiresAt: 10 })
        expect(shiftOrder(o, 0, 10)).toBe(o)
    })
})

describe("tickEffects", () => {
    it("orderRate 0 holds timeLeft for its whole length; the order fails that much later", () => {
        const freeze = effect("orderRate", 0, 10, 40)
        let state = { active: [freeze], plots: [] as Plot[], orders: [order(60)] }
        for (let t = 11; t <= 40; t++) {
            state = tickEffects(state.active, state.plots, state.orders, t)
            expect(timeLeft(state.orders[0], t)).toBe(50)
        }
        expect(state.orders[0].expiresAt).toBe(90)
        expect(isExpired(state.orders[0], 90)).toBe(false)
        expect(isExpired(state.orders[0], 91)).toBe(true)
    })

    it("growthRate 0 holds a crop for its whole length; it is ready that many ticks late", () => {
        const end = run([effect("growthRate", 0, 0, 30)], [growing(0, 50)], [], 0, 80)
        expect(end.plots[0]).toEqual({ state: "ready", cropId: "garlic" })
        const before = run([effect("growthRate", 0, 0, 30)], [growing(0, 50)], [], 0, 79)
        expect(before.plots[0].state).toBe("growing")
    })

    it("growthRate 200 makes a crop ready in half its time", () => {
        const at = (t: number) =>
            run([effect("growthRate", 200, 0, 1000)], [growing(0, 100)], [], 0, t).plots[0].state
        expect(at(49)).toBe("growing")
        expect(at(50)).toBe("ready")
    })

    it("drops an effect on tick endsAt + 1 without moving anything that tick", () => {
        const freeze = effect("orderRate", 0, 0, 5)
        const o = order(50)
        const last = tickEffects([freeze], [], [o], 5)
        expect(last.active).toEqual([freeze])
        expect(last.orders[0].expiresAt).toBe(51)
        const after = tickEffects([freeze], [], [o], 6)
        expect(after.active).toEqual([])
        expect(after.orders[0]).toBe(o)
    })

    it("adds the shifts of two effects on the same clock", () => {
        const a = { ...effect("orderRate", 0), source: "a" }
        const b = { ...effect("orderRate", 0), source: "b" }
        expect(tickEffects([a, b], [], [order(50)], 1).orders[0].expiresAt).toBe(52)
    })

    it("a crop effect never moves orders, and an order effect never moves plots", () => {
        const plots = [growing(0, 100)]
        const orders = [order(50)]
        const g = tickEffects([effect("growthRate", 0)], plots, orders, 1)
        expect(g.orders).toBe(orders)
        expect(g.plots[0]).toEqual(growing(1, 101))
        const o = tickEffects([effect("orderRate", 0)], plots, orders, 1)
        expect(o.plots).toBe(plots)
        expect(o.orders[0].expiresAt).toBe(51)
    })

    it("returns the same arrays with nothing active", () => {
        const active: ActiveEffect[] = []
        const plots = [growing(0, 100)]
        const orders = [order(50)]
        const out = tickEffects(active, plots, orders, 3)
        expect(out.active).toBe(active)
        expect(out.plots).toBe(plots)
        expect(out.orders).toBe(orders)
    })

    it("never changes its inputs", () => {
        const active = [effect("growthRate", 0), effect("orderRate", 0)]
        const plots = [growing(0, 100), { state: "empty" } as Plot]
        const orders = [order(50)]
        const copy = structuredClone({ active, plots, orders })
        tickEffects(active, plots, orders, 1)
        expect({ active, plots, orders }).toEqual(copy)
    })
})

describe("startEffect", () => {
    const freeze = { kind: "orderRate", pct: 0 } as const

    it("appends a new source with endsAt = now + durationTicks", () => {
        expect(startEffect([], "orderFreeze", freeze, 10, 100)).toEqual([
            {
                source: "orderFreeze",
                effect: freeze,
                startedAt: 10,
                endsAt: 110,
                exclude: [],
                only: null
            }
        ])
    })

    it("adds time to a running effect from the same source and keeps startedAt", () => {
        const once = startEffect([], "orderFreeze", freeze, 10, 100)
        const twice = startEffect(once, "orderFreeze", freeze, 50, 100)
        expect(twice).toEqual([
            {
                source: "orderFreeze",
                effect: freeze,
                startedAt: 10,
                endsAt: 210,
                exclude: [],
                only: null
            }
        ])
        expect(once[0].endsAt).toBe(110)
    })

    it("a 100-tick effect moves clocks on exactly 100 steps", () => {
        let state = {
            active: startEffect([], "f", freeze, 0, 100),
            plots: [] as Plot[],
            orders: [order(500)]
        }
        for (let t = 1; t <= 150; t++)
            state = tickEffects(state.active, state.plots, state.orders, t)
        expect(state.orders[0].expiresAt).toBe(600)
        expect(state.active).toEqual([])
    })
})

describe("cutGrowth / finishGrowth", () => {
    it("cutGrowth brings growing crops closer, clamped at now, and readies crops at now", () => {
        const plots: Plot[] = [
            growing(0, 100),
            growing(0, 30),
            { state: "empty" },
            { state: "ready", cropId: "carrot" }
        ]
        const out = cutGrowth(plots, 50, 10)
        expect(out[0]).toEqual(growing(-50, 50))
        expect(out[1]).toEqual({ state: "ready", cropId: "garlic" })
        expect(out[2]).toBe(plots[2])
        expect(out[3]).toBe(plots[3])
    })

    it("cutGrowth returns the same array when nothing grows", () => {
        const plots: Plot[] = [{ state: "empty" }]
        expect(cutGrowth(plots, 50, 10)).toBe(plots)
    })

    it("finishGrowth readies a growing plot and refuses empty and ready plots", () => {
        expect(finishGrowth(growing(0, 100))).toEqual({ state: "ready", cropId: "garlic" })
        expect(finishGrowth({ state: "empty" })).toBeNull()
        expect(finishGrowth({ state: "ready", cropId: "garlic" })).toBeNull()
    })
})

describe("plot exclusion and action effects", () => {
    function action(
        effect: ActiveEffect["effect"],
        startedAt: number,
        endsAt: number,
        exclude: number[] = []
    ): ActiveEffect {
        return { source: effect.kind, effect, startedAt, endsAt, exclude, only: null }
    }

    it("a growthRate 0 effect with exclude [1] holds plot 0 and leaves plot 1 growing", () => {
        const frost = { ...effect("growthRate", 0), exclude: [1] }
        const plots = [growing(0, 100), growing(0, 100)]
        const out = tickEffects([frost], plots, [], 1)
        expect(out.plots[0]).toEqual(growing(1, 101))
        expect(out.plots[1]).toBe(plots[1])
    })

    it("a growthRate 0 effect with only [0] holds plot 0 and leaves plot 1 growing", () => {
        const frost = { ...effect("growthRate", 0), only: [0] }
        const plots = [growing(0, 100), growing(0, 100)]
        const out = tickEffects([frost], plots, [], 1)
        expect(out.plots[0]).toEqual(growing(1, 101))
        expect(out.plots[1]).toBe(plots[1])
    })

    it("startEffect stores only (null by default) and unions it when time is added", () => {
        const crows = { kind: "blockHarvest", plots: 2 } as const
        expect(startEffect([], "x", crows, 0, 10)[0].only).toBeNull()
        const once = startEffect([], "crows", crows, 0, 10, [], [3, 1])
        expect(once[0].only).toEqual([3, 1])
        expect(startEffect(once, "crows", crows, 5, 10, [], [2, 3])[0].only).toEqual([1, 2, 3])
        expect(startEffect(once, "crows", crows, 5, 10)[0].only).toBeNull()
    })

    it("appliesTo reads only and exclude", () => {
        const every = effect("growthRate", 0)
        expect(appliesTo(every, 0)).toBe(true)
        expect(appliesTo({ ...every, exclude: [0] }, 0)).toBe(false)
        expect(appliesTo({ ...every, only: [1, 2] }, 1)).toBe(true)
        expect(appliesTo({ ...every, only: [1, 2] }, 0)).toBe(false)
        expect(appliesTo({ ...every, only: [1, 2], exclude: [1] }, 1)).toBe(false)
    })

    it("startEffect stores exclude and keeps it when time is added", () => {
        const frost = { kind: "growthRate", pct: 0 } as const
        const once = startEffect([], "frost", frost, 0, 10, [2])
        expect(once[0].exclude).toEqual([2])
        expect(startEffect(once, "frost", frost, 5, 10)[0].exclude).toEqual([2])
    })

    it("action effects move nothing and are dropped on endsAt + 1", () => {
        const crows = action({ kind: "blockHarvest", plots: 2 }, 0, 5)
        const plots = [growing(0, 100)]
        const orders = [order(50)]
        const during = tickEffects([crows], plots, orders, 3)
        expect(during.plots).toBe(plots)
        expect(during.orders).toBe(orders)
        expect(during.active).toEqual([crows])
        expect(tickEffects([crows], plots, orders, 6).active).toEqual([])
    })

    it("stealCrop empties growing and ready plots and returns null for an empty one", () => {
        expect(stealCrop(growing(0, 100))).toEqual({ state: "empty" })
        expect(stealCrop({ state: "ready", cropId: "garlic" })).toEqual({ state: "empty" })
        expect(stealCrop({ state: "empty" })).toBeNull()
    })

    it("harvestBlocked works from startedAt to endsAt - 1, and never on an excluded plot", () => {
        const crows = [action({ kind: "blockHarvest", plots: 2 }, 10, 16, [2])]
        expect(harvestBlocked(crows, 0, 9)).toBe(false)
        expect(harvestBlocked(crows, 0, 10)).toBe(true)
        expect(harvestBlocked(crows, 0, 15)).toBe(true)
        expect(harvestBlocked(crows, 0, 16)).toBe(false)
        expect(harvestBlocked(crows, 2, 12)).toBe(false)
        expect(harvestBlocked([], 0, 12)).toBe(false)
    })

    it("harvestBlocked is false on a plot missing from only", () => {
        const crows = [{ ...action({ kind: "blockHarvest", plots: 2 }, 10, 16), only: [1, 3] }]
        expect(harvestBlocked(crows, 1, 12)).toBe(true)
        expect(harvestBlocked(crows, 0, 12)).toBe(false)
    })

    describe("scareCrows", () => {
        const crows = { ...action({ kind: "blockHarvest", plots: 2 }, 10, 16), only: [1, 3] }
        const frost = action({ kind: "growthRate", pct: 0 }, 10, 16)

        it("removes the plot and keeps the effect while plots are left", () => {
            const input = [frost, crows]
            const out = scareCrows(input, 1, 12)!
            expect(out).toEqual([frost, { ...crows, only: [3] }])
            expect(out[0]).toBe(frost)
            expect(input[1].only).toEqual([1, 3])
        })

        it("removes the effect when its last plot is scared", () => {
            const out = scareCrows(scareCrows([crows], 1, 12)!, 3, 12)
            expect(out).toEqual([])
        })

        it("returns null with no crows on the plot, outside working ticks, or for only: null", () => {
            expect(scareCrows([crows], 0, 12)).toBeNull()
            expect(scareCrows([crows], 1, 9)).toBeNull()
            expect(scareCrows([crows], 1, 16)).toBeNull()
            expect(scareCrows([{ ...crows, only: null }], 1, 12)).toBeNull()
            expect(scareCrows([], 1, 12)).toBeNull()
        })
    })

    it("deliverBonusAt sums working bonuses and is 0 on endsAt or with none", () => {
        const a = action({ kind: "deliverBonus", coins: 3 }, 0, 10)
        const b = { ...action({ kind: "deliverBonus", coins: 2 }, 5, 20), source: "b" }
        expect(deliverBonusAt([a, b], 7)).toBe(5)
        expect(deliverBonusAt([a, b], 10)).toBe(2)
        expect(deliverBonusAt([a], 10)).toBe(0)
        expect(deliverBonusAt([], 3)).toBe(0)
    })
})

describe("finishAll / clearField / harvestBonusAt / fogged", () => {
    const ready: Plot = { state: "ready", cropId: "garlic" }
    const empty: Plot = { state: "empty" }

    it("finishAll readies every growing crop and keeps the rest", () => {
        const plots = [growing(0, 50), empty, ready]
        expect(finishAll(plots)).toEqual([{ state: "ready", cropId: "garlic" }, empty, ready])
        const none = [empty, ready]
        expect(finishAll(none)).toBe(none)
    })

    it("clearField empties every plot, and returns the same array when all are empty", () => {
        expect(clearField([growing(0, 50), ready, empty])).toEqual([empty, empty, empty])
        const none = [empty, empty]
        expect(clearField(none)).toBe(none)
    })

    const worms = (startedAt: number, endsAt: number, exclude: number[] = []): ActiveEffect => ({
        source: "worms",
        effect: { kind: "harvestBonus", crops: 2 },
        startedAt,
        endsAt,
        exclude,
        only: null
    })

    it("harvestBonusAt sums working bonuses, skipping excluded plots", () => {
        expect(harvestBonusAt([worms(10, 20)], 0, 10)).toBe(2)
        expect(harvestBonusAt([worms(10, 20)], 0, 19)).toBe(2)
        expect(harvestBonusAt([worms(10, 20)], 0, 20)).toBe(0)
        expect(harvestBonusAt([worms(10, 20)], 0, 9)).toBe(0)
        expect(harvestBonusAt([worms(10, 20, [1])], 1, 15)).toBe(0)
        expect(harvestBonusAt([], 0, 15)).toBe(0)
    })

    it("fogged is true only while a fog effect works", () => {
        const fog: ActiveEffect = {
            source: "fog",
            effect: { kind: "fog" },
            startedAt: 5,
            endsAt: 8,
            exclude: [],
            only: null
        }
        expect(fogged([fog], 5)).toBe(true)
        expect(fogged([fog], 8)).toBe(false)
        expect(fogged([worms(0, 99)], 5)).toBe(false)
    })

    it("tickEffects moves nothing for harvestBonus and fog, and drops them once ended", () => {
        const plots = [growing(0, 50)]
        const fog: ActiveEffect = { ...worms(0, 3), source: "fog", effect: { kind: "fog" } }
        const r = tickEffects([worms(0, 3), fog], plots, [], 2)
        expect(r.plots).toBe(plots)
        expect(tickEffects([worms(0, 3), fog], plots, [], 4).active).toEqual([])
    })
})
