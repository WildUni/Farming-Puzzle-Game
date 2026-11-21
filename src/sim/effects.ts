// Effects that move a run's clocks: crops' readyAt and orders' expiresAt. Shared by power-ups
// now and events later. See specs/effects.md.
import type { ActiveEffect, LastingEffect, Order, Plot } from "./types"
import { updateGrowth } from "./plot"

// Total shift after n ticks at rate pct: trunc(n × (100 − pct) / 100).
function totalShift(pct: number, n: number): number {
    return Math.trunc((n * (100 - pct)) / 100) + 0 // + 0 turns -0 into 0
}

// How far an effect at rate `pct`, started on `startedAt`, moves its clocks on tick `now`.
// Positive pushes deadlines later, negative pulls them earlier. 0 before the effect has run.
function rateShift(pct: number, startedAt: number, now: number): number {
    const n = now - startedAt
    if (n <= 0) return 0
    return totalShift(pct, n) - totalShift(pct, n - 1)
}

// Moves a growing crop's clock: readyAt and plantedAt together, so progress() stays right.
// readyAt never goes below now. Other plots, and a zero move, come back as the same object.
function shiftPlot(plot: Plot, shift: number, now: number): Plot {
    if (plot.state !== "growing") return plot
    const applied = Math.max(shift, now - plot.readyAt)
    if (applied === 0) return plot
    return { ...plot, plantedAt: plot.plantedAt + applied, readyAt: plot.readyAt + applied }
}

// Moves an open order's timer. timeLimit stays, so the countdown bar stands still while frozen.
function shiftOrder(order: Order, shift: number, now: number): Order {
    const applied = Math.max(shift, now - order.expiresAt)
    if (applied === 0) return order
    return { ...order, expiresAt: order.expiresAt + applied }
}

// Maps `list` with `f`, returning `list` itself when no item changed.
function mapSame<T>(list: T[], f: (item: T) => T): T[] {
    let changed = false
    const out = list.map((item) => {
        const next = f(item)
        if (next !== item) changed = true
        return next
    })
    return changed ? out : list
}

// What lasting effects do on one tick: drop the ones that ended, then move every growing crop
// and open order by the sum of the remaining shifts of their kind.
function tickEffects(
    active: ActiveEffect[],
    plots: Plot[],
    orders: Order[],
    now: number
): { active: ActiveEffect[]; plots: Plot[]; orders: Order[] } {
    if (active.length === 0) return { active, plots, orders }
    const running = active.filter((a) => a.endsAt >= now)
    const kept = running.length === active.length ? active : running

    let growth = 0
    let order = 0
    for (const a of kept) {
        const shift = rateShift(a.effect.pct, a.startedAt, now)
        if (a.effect.kind === "growthRate") growth += shift
        else order += shift
    }

    return {
        active: kept,
        plots: growth === 0 ? plots : mapSame(plots, (p) => shiftPlot(p, growth, now)),
        orders: order === 0 ? orders : mapSame(orders, (o) => shiftOrder(o, order, now))
    }
}

// Starts a lasting effect from `source`, or adds `durationTicks` to the one already running.
function startEffect(
    active: ActiveEffect[],
    source: string,
    effect: LastingEffect,
    now: number,
    durationTicks: number
): ActiveEffect[] {
    const i = active.findIndex((a) => a.source === source)
    if (i === -1) {
        return [...active, { source, effect, startedAt: now, endsAt: now + durationTicks }]
    }
    return active.map((a, j) => (j === i ? { ...a, endsAt: a.endsAt + durationTicks } : a))
}

// Every growing crop gets `ticks` closer to ready; crops brought to `now` turn ready at once.
function cutGrowth(plots: Plot[], ticks: number, now: number): Plot[] {
    return mapSame(plots, (p) => {
        const moved = shiftPlot(p, -ticks, now)
        return moved === p ? p : updateGrowth(moved, now)
    })
}

// A growing crop becomes ready now. null for an empty or ready plot.
function finishGrowth(plot: Plot): Plot | null {
    if (plot.state !== "growing") return null
    return { state: "ready", cropId: plot.cropId }
}

export { rateShift, shiftPlot, shiftOrder, tickEffects, startEffect, cutGrowth, finishGrowth }
