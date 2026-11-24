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
// the growthRate shifts that apply to its plot (and Drought's, unless the plot is watered on this
// tick), and every open order by the orderRate shifts.
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

    const growth: { shift: number; effect: ActiveEffect; drought: boolean }[] = []
    let order = 0
    for (const a of kept) {
        const { effect } = a
        if (effect.kind === "drought") {
            const shift = rateShift(0, a.startedAt, now)
            if (shift !== 0) growth.push({ shift, effect: a, drought: true })
            continue
        }
        if (effect.kind !== "growthRate" && effect.kind !== "orderRate") continue
        const shift = rateShift(effect.pct, a.startedAt, now)
        if (shift === 0) continue
        if (effect.kind === "growthRate") growth.push({ shift, effect: a, drought: false })
        else order += shift
    }

    const plotShift = (i: number) =>
        growth.reduce(
            (sum, g) =>
                appliesTo(g.effect, i) && !(g.drought && isWatered(kept, i, now))
                    ? sum + g.shift
                    : sum,
            0
        )

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

// True when `a` works on `plot`: `only` is null or lists it, and `exclude` doesn't.
function appliesTo(a: ActiveEffect, plot: number): boolean {
    return (a.only === null || a.only.includes(plot)) && !a.exclude.includes(plot)
}

// Both `only` lists merged, ascending and without repeats; null (every plot) wins.
function unionOnly(a: number[] | null, b: number[] | null): number[] | null {
    if (a === null || b === null) return null
    return [...new Set([...a, ...b])].sort((x, y) => x - y)
}

// Starts a lasting effect from `source`, or adds `durationTicks` to the one already running.
// `exclude` lists plots the effect leaves out (Greenhouse plots under a bad event); `only`, when
// given, the plots it works on (the plots Crows landed on).
function startEffect(
    active: ActiveEffect[],
    source: string,
    effect: LastingEffect,
    now: number,
    durationTicks: number,
    exclude: number[] = [],
    only: number[] | null = null
): ActiveEffect[] {
    const i = active.findIndex((a) => a.source === source)
    if (i === -1) {
        return [
            ...active,
            {
                source,
                effect,
                startedAt: now,
                endsAt: now + durationTicks,
                exclude: [...exclude],
                only: only === null ? null : [...only]
            }
        ]
    }
    return active.map((a, j) =>
        j === i ? { ...a, endsAt: a.endsAt + durationTicks, only: unionOnly(a.only, only) } : a
    )
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

// True when a working blockHarvest effect applies to `plot`.
function harvestBlocked(active: ActiveEffect[], plot: number, now: number): boolean {
    return active.some(
        (a) => a.effect.kind === "blockHarvest" && working(a, now) && appliesTo(a, plot)
    )
}

// The player scares the crows off `plot`: every working blockHarvest effect whose `only` lists
// it drops it, and one left with no plots ends. null when no crows are on `plot` right now.
function scareCrows(active: ActiveEffect[], plot: number, now: number): ActiveEffect[] | null {
    const onPlot = (a: ActiveEffect) =>
        a.effect.kind === "blockHarvest" &&
        working(a, now) &&
        a.only !== null &&
        a.only.includes(plot)
    if (!active.some(onPlot)) return null
    return active.flatMap((a) => {
        if (!onPlot(a)) return [a]
        const only = a.only!.filter((i) => i !== plot)
        return only.length === 0 ? [] : [{ ...a, only }]
    })
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
            a.effect.kind === "harvestBonus" && working(a, now) && appliesTo(a, plot)
                ? sum + a.effect.crops
                : sum,
        0
    )
}

// How far comboRate effects move the Timed combo window (comboEndsAt) on tick `now`: the rate
// rule, on the same ticks a rate effect moves clocks (startedAt + 1 … endsAt). Combo freeze.
function comboShiftAt(active: ActiveEffect[], now: number): number {
    return active.reduce(
        (sum, a) =>
            a.effect.kind === "comboRate" && a.endsAt >= now
                ? sum + rateShift(a.effect.pct, a.startedAt, now)
                : sum,
        0
    )
}

// True when a working autoHarvest effect applies to `plot` (Auto harvest).
function autoHarvestAt(active: ActiveEffect[], plot: number, now: number): boolean {
    return active.some(
        (a) => a.effect.kind === "autoHarvest" && working(a, now) && appliesTo(a, plot)
    )
}

// True when a water effect covers `plot` on tick `now`: the ticks a rate effect moves clocks on
// (startedAt + 1 … endsAt). A watered plot ignores Drought.
function isWatered(active: ActiveEffect[], plot: number, now: number): boolean {
    return active.some(
        (a) =>
            a.effect.kind === "water" && a.startedAt < now && now <= a.endsAt && appliesTo(a, plot)
    )
}

// The working Drought effect over `plot` on tick `now`, or null. waterPlot reads its
// waterSeconds.
function droughtOn(active: ActiveEffect[], plot: number, now: number): ActiveEffect | null {
    return (
        active.find((a) => a.effect.kind === "drought" && working(a, now) && appliesTo(a, plot)) ??
        null
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
    appliesTo,
    harvestBlocked,
    scareCrows,
    deliverBonusAt,
    harvestBonusAt,
    fogged,
    comboShiftAt,
    autoHarvestAt,
    isWatered,
    droughtOn,
    finishAll,
    clearField
}
