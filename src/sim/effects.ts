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
function mapSame<T>(list: T[], f: (item: T, i: number) => T): T[] {
    let changed = false
    const out = list.map((item, i) => {
        const next = f(item, i)
        if (next !== item) changed = true
        return next
    })
    return changed ? out : list
}

// What lasting effects do on one tick: drop the ones that ended, then move each growing crop by
// the growthRate shifts that don't exclude its plot, and every open order by the orderRate shifts.
// Action effects (blockHarvest, deliverBonus, harvestBonus, fog) move nothing.
function tickEffects(
    active: ActiveEffect[],
    plots: Plot[],
    orders: Order[],
    now: number
): { active: ActiveEffect[]; plots: Plot[]; orders: Order[] } {
    if (active.length === 0) return { active, plots, orders }
    const running = active.filter((a) => a.endsAt >= now)
    const kept = running.length === active.length ? active : running

    const growth: { shift: number; exclude: number[] }[] = []
    let order = 0
    for (const a of kept) {
        const { effect } = a
        if (effect.kind !== "growthRate" && effect.kind !== "orderRate") continue
        const shift = rateShift(effect.pct, a.startedAt, now)
        if (shift === 0) continue
        if (effect.kind === "growthRate") growth.push({ shift, exclude: a.exclude })
        else order += shift
    }

    const plotShift = (i: number) =>
        growth.reduce((sum, g) => (g.exclude.includes(i) ? sum : sum + g.shift), 0)

    return {
        active: kept,
        plots:
            growth.length === 0
                ? plots
                : mapSame(plots, (p, i) => {
                      const shift = plotShift(i)
                      return shift === 0 ? p : shiftPlot(p, shift, now)
                  }),
        orders: order === 0 ? orders : mapSame(orders, (o) => shiftOrder(o, order, now))
    }
}

// Starts a lasting effect from `source`, or adds `durationTicks` to the one already running.
// `exclude` lists plots the effect leaves out (Greenhouse plots under a bad event).
function startEffect(
    active: ActiveEffect[],
    source: string,
    effect: LastingEffect,
    now: number,
    durationTicks: number,
    exclude: number[] = []
): ActiveEffect[] {
    const i = active.findIndex((a) => a.source === source)
    if (i === -1) {
        return [
            ...active,
            { source, effect, startedAt: now, endsAt: now + durationTicks, exclude: [...exclude] }
        ]
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

// Every growing crop becomes ready now. Returns `plots` itself when nothing was growing.
function finishAll(plots: Plot[]): Plot[] {
    return mapSame(plots, (p) => finishGrowth(p) ?? p)
}

// Every plot becomes empty. Returns `plots` itself when every plot already was.
function clearField(plots: Plot[]): Plot[] {
    return mapSame(plots, (p) => (p.state === "empty" ? p : { state: "empty" }))
}

// A growing or ready crop is lost. null for an empty plot, so the caller knows nothing happened.
function stealCrop(plot: Plot): Plot | null {
    if (plot.state === "empty") return null
    return { state: "empty" }
}

// True when an action effect is working on tick `now`: from startedAt to endsAt - 1.
function working(a: ActiveEffect, now: number): boolean {
    return a.startedAt <= now && now < a.endsAt
}

// True when a working blockHarvest effect doesn't leave `plot` out.
function harvestBlocked(active: ActiveEffect[], plot: number, now: number): boolean {
    return active.some(
        (a) => a.effect.kind === "blockHarvest" && working(a, now) && !a.exclude.includes(plot)
    )
}

// Extra coins a delivery on tick `now` earns from working deliverBonus effects.
function deliverBonusAt(active: ActiveEffect[], now: number): number {
    return active.reduce(
        (sum, a) =>
            a.effect.kind === "deliverBonus" && working(a, now) ? sum + a.effect.coins : sum,
        0
    )
}

// Extra crops a harvest of `plot` on tick `now` gets from working harvestBonus effects (Worms).
function harvestBonusAt(active: ActiveEffect[], plot: number, now: number): number {
    return active.reduce(
        (sum, a) =>
            a.effect.kind === "harvestBonus" && working(a, now) && !a.exclude.includes(plot)
                ? sum + a.effect.crops
                : sum,
        0
    )
}

// True while a fog effect works: the screen hides growth and order timers.
function fogged(active: ActiveEffect[], now: number): boolean {
    return active.some((a) => a.effect.kind === "fog" && working(a, now))
}

export {
    rateShift,
    shiftPlot,
    shiftOrder,
    tickEffects,
    startEffect,
    cutGrowth,
    finishGrowth,
    stealCrop,
    harvestBlocked,
    deliverBonusAt,
    harvestBonusAt,
    fogged,
    finishAll,
    clearField
}
