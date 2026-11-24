// Events: definitions from src/data/events.json, choosing and announcing the next event, and
// starting one. See specs/events.md.
import type {
    CropTable,
    Effect,
    EventConfig,
    EventDef,
    EventKind,
    GameMode,
    GameState,
    Inventory,
    Modifiers,
    ModifierStat,
    OrderRules,
    Plot,
    RNGState,
    RunEvent
} from "./types"
import { TICKS_PER_SECOND } from "./game_constants"
import { pick, randomInt } from "./mulberry"
import {
    MODIFIER_STATS,
    modifiersAt,
    modifiersFor,
    plantCutTicks,
    plantGrowthPct,
    scalePct
} from "./upgrades"
import { eventGapTicks, runLevel } from "./difficulty"
import { POWER_UPS } from "./powerups"
import { cutGrowth, startEffect, stealCrop } from "./effects"
import { plant } from "./plot"
import { createOrder, isExpired, ordersBlocked } from "./orders"
import { storageFree } from "./economy"
import rawEvents from "../data/events.json"

const EVENT_MODES: readonly GameMode[] = ["survival", "timed"]
const EVENT_KINDS: readonly EventKind[] = ["good", "bad"]
const LASTING_KINDS: readonly string[] = [
    "growthRate",
    "orderRate",
    "blockHarvest",
    "deliverBonus",
    "harvestBonus",
    "fog",
    "drought"
]
const AMOUNT_KINDS: readonly string[] = [
    "cutGrowth",
    "deliverBonus",
    "harvestBonus",
    "seedPlots",
    "blockHarvest",
    "addOrder",
    "rotStorage",
    "tipOrder",
    "luckyClover",
    "scarecrow"
]

// ---------------------------------------------------------------------------------------------
// Validation

function isObject(v: unknown): v is Record<string, unknown> {
    return typeof v === "object" && v !== null && !Array.isArray(v)
}

function fail(field: string, rule: string): never {
    throw new Error(`events config: ${field} must be ${rule}`)
}

function has(obj: Record<string, unknown>, key: string): boolean {
    return Object.prototype.hasOwnProperty.call(obj, key)
}

function nonEmptyString(obj: Record<string, unknown>, key: string, at: string): string {
    const v = obj[key]
    if (typeof v !== "string" || v.length === 0) fail(`${at}.${key}`, "a non-empty string")
    return v
}

function wholeAtLeast(v: unknown, min: number, field: string): number {
    if (typeof v !== "number" || !Number.isInteger(v) || v < min) {
        fail(field, `a whole number >= ${min}`)
    }
    return v
}

// A whole number from min to max.
function wholeBetween(v: unknown, min: number, max: number, field: string): number {
    const n = wholeAtLeast(v, min, field)
    if (n > max) fail(field, `a whole number from ${min} to ${max}`)
    return n
}

// The effects an event may use. The power-up-only ones (finishGrowth, grantCoins, finishAll,
// clearField, fillOrder, fillAllOrders, goodEvent) are refused.
function validateEffect(raw: unknown, at: string): Effect {
    if (!isObject(raw)) fail(at, "an object")
    switch (raw.kind) {
        case "growthRate":
        case "orderRate": {
            const pct = wholeAtLeast(raw.pct, 0, `${at}.pct`)
            if (pct === 100) fail(`${at}.pct`, "other than 100")
            return { kind: raw.kind, pct }
        }
        case "cutGrowth":
            return { kind: "cutGrowth", ticks: wholeAtLeast(raw.ticks, 1, `${at}.ticks`) }
        case "blockHarvest":
            return { kind: "blockHarvest", plots: wholeAtLeast(raw.plots, 1, `${at}.plots`) }
        case "deliverBonus":
            return { kind: "deliverBonus", coins: wholeAtLeast(raw.coins, 1, `${at}.coins`) }
        case "stealCrop":
            return { kind: "stealCrop" }
        case "harvestBonus":
            return { kind: "harvestBonus", crops: wholeAtLeast(raw.crops, 1, `${at}.crops`) }
        case "fog":
            return { kind: "fog" }
        case "harvestAll":
            return { kind: "harvestAll" }
        case "seedPlots":
            return { kind: "seedPlots", plots: wholeAtLeast(raw.plots, 1, `${at}.plots`) }
        case "addOrder":
            return { kind: "addOrder", timePct: wholeBetween(raw.timePct, 1, 100, `${at}.timePct`) }
        case "rotStorage":
            return { kind: "rotStorage", pct: wholeBetween(raw.pct, 1, 100, `${at}.pct`) }
        case "tipOrder":
            return { kind: "tipOrder", coins: wholeAtLeast(raw.coins, 1, `${at}.coins`) }
        case "luckyClover":
            return { kind: "luckyClover", plots: wholeAtLeast(raw.plots, 1, `${at}.plots`) }
        case "scarecrow":
            return {
                kind: "scarecrow",
                seconds: wholeAtLeast(raw.seconds, 1, `${at}.seconds`)
            }
        case "drought":
            return {
                kind: "drought",
                waterSeconds: wholeAtLeast(raw.waterSeconds, 1, `${at}.waterSeconds`)
            }
        default:
            return fail(`${at}.kind`, "an effect kind events can use")
    }
}

// A stat field: absent (null), or a Modifiers stat whose name ends in `suffix`.
function statField(
    entry: Record<string, unknown>,
    key: string,
    suffix: string,
    at: string
): ModifierStat | null {
    if (!has(entry, key)) return null
    const v = entry[key]
    if (typeof v !== "string" || !(MODIFIER_STATS as string[]).includes(v) || !v.endsWith(suffix)) {
        fail(`${at}.${key}`, `a modifier stat ending in ${suffix}`)
    }
    return v as ModifierStat
}

function validateEvent(entry: unknown, at: string): EventDef {
    if (!isObject(entry)) fail(at, "an object")
    const id = nonEmptyString(entry, "id", at)
    if (has(POWER_UPS.powerUps, id)) fail(`${at}.id`, `different from every power-up id ("${id}")`)
    const name = nonEmptyString(entry, "name", at)

    if (!(EVENT_KINDS as unknown[]).includes(entry.kind)) fail(`${at}.kind`, `"good" or "bad"`)
    const kind = entry.kind as EventKind

    const modes = entry.modes
    if (!Array.isArray(modes) || modes.length === 0) fail(`${at}.modes`, "a non-empty list")
    for (const m of modes) {
        if (!(EVENT_MODES as unknown[]).includes(m)) {
            fail(`${at}.modes`, `made of ${EVENT_MODES.join(", ")}`)
        }
    }
    if (new Set(modes).size !== modes.length) fail(`${at}.modes`, "free of repeats")

    const weight = wholeAtLeast(entry.weight, 1, `${at}.weight`)
    const warnTicks = wholeAtLeast(entry.warnSeconds, 1, `${at}.warnSeconds`) * TICKS_PER_SECOND
    const effect = validateEffect(entry.effect, `${at}.effect`)
    const lasting = LASTING_KINDS.includes(effect.kind)

    let durationTicks: number | null = null
    if (lasting) {
        if (!has(entry, "seconds")) fail(`${at}.seconds`, "given for a lasting effect")
        durationTicks = wholeAtLeast(entry.seconds, 1, `${at}.seconds`) * TICKS_PER_SECOND
    } else if (has(entry, "seconds")) {
        fail(`${at}.seconds`, "left out for an instant effect")
    }

    let target: "plot" | null = null
    if (has(entry, "target")) {
        if (entry.target !== "plot") fail(`${at}.target`, `"plot"`)
        target = "plot"
    }
    if ((effect.kind === "stealCrop") !== (target === "plot")) {
        fail(`${at}.target`, `"plot" exactly when the effect is stealCrop`)
    }

    const durationStat = statField(entry, "durationStat", "Pct", at)
    const amountStat = statField(entry, "amountStat", "Pct", at)
    const blockStat = statField(entry, "blockStat", "Chance", at)
    const banStat = statField(entry, "banStat", "Ban", at)
    if (durationStat !== null && !lasting) fail(`${at}.durationStat`, "left out when instant")
    if (amountStat !== null && !AMOUNT_KINDS.includes(effect.kind)) {
        fail(`${at}.amountStat`, "left out for an effect with no amount")
    }

    let news: { leadTicks: number; headline: string } | null = null
    if (has(entry, "news")) {
        const raw = entry.news
        if (!isObject(raw)) fail(`${at}.news`, "an object")
        news = {
            leadTicks: wholeAtLeast(raw.seconds, 1, `${at}.news.seconds`) * TICKS_PER_SECOND,
            headline: nonEmptyString(raw, "headline", `${at}.news`)
        }
    }
    let scaredOff = false
    if (has(entry, "scaredOff")) {
        if (typeof entry.scaredOff !== "boolean") fail(`${at}.scaredOff`, "true or false")
        if (entry.scaredOff && kind !== "bad") fail(`${at}.scaredOff`, "left out on a good event")
        scaredOff = entry.scaredOff
    }

    return {
        id,
        name,
        kind,
        modes: [...(modes as GameMode[])],
        weight,
        warnTicks,
        durationTicks,
        effect,
        target,
        durationStat,
        amountStat,
        blockStat,
        banStat,
        news,
        scaredOff
    }
}

// Checks a parsed JSON value and returns it in the typed shape. Throws naming the bad entry.
function validateEvents(raw: unknown): EventConfig {
    if (!isObject(raw)) fail("the file", "an object")
    const firstEventTicks =
        wholeAtLeast(raw.firstEventSeconds, 1, "firstEventSeconds") * TICKS_PER_SECOND
    const timedGapTicks = wholeAtLeast(raw.timedGapSeconds, 1, "timedGapSeconds") * TICKS_PER_SECOND
    const list = raw.events
    if (!Array.isArray(list) || list.length === 0) fail("events", "a non-empty list")
    const events: Record<string, EventDef> = {}
    list.forEach((entry: unknown, i) => {
        const def = validateEvent(entry, `events[${i}]`)
        if (has(events, def.id)) fail(`events[${i}].id`, `unique ("${def.id}")`)
        events[def.id] = def
    })
    return { firstEventTicks, timedGapTicks, events }
}

const EVENTS: EventConfig = validateEvents(rawEvents)

// ---------------------------------------------------------------------------------------------
// Choosing

// A stat field's value, or 100 (no change) when the event has none.
function pctOf(m: Readonly<Modifiers>, stat: ModifierStat | null): number {
    return stat === null ? 100 : m[stat]
}

// The effect's own amount (cutGrowth ticks, deliverBonus coins, ...), or null.
function baseAmount(effect: Effect): number | null {
    switch (effect.kind) {
        case "cutGrowth":
            return effect.ticks
        case "deliverBonus":
            return effect.coins
        case "harvestBonus":
            return effect.crops
        case "seedPlots":
        case "blockHarvest":
            return effect.plots
        case "addOrder":
            return effect.timePct
        case "rotStorage":
            return effect.pct
        case "tipOrder":
            return effect.coins
        case "luckyClover":
            return effect.plots
        case "scarecrow":
            return effect.seconds
        default:
            return null
    }
}

// Ticks after an event ends until the next may be announced, with Calm skies applied.
function gapTicks(state: GameState, config: EventConfig = EVENTS): number {
    const gap = state.mode === "survival" ? eventGapTicks(runLevel(state)) : config.timedGapTicks
    return scalePct(gap, modifiersFor(state.upgrades).eventGapPct)
}

// Plots with a Greenhouse, ascending.
function shieldedPlots(state: GameState): number[] {
    return state.plots.flatMap((_, plot) =>
        modifiersAt(state.upgrades, { plot, cropId: null }).shielded > 0 ? [plot] : []
    )
}

// Plots a plot event can hit: ones with a crop, minus shielded plots for a bad event.
function eventTargets(state: GameState, def: EventDef): number[] {
    if (def.target !== "plot") return []
    const shielded = def.kind === "bad" ? shieldedPlots(state) : []
    return state.plots.flatMap((p, i) => (p.state !== "empty" && !shielded.includes(i) ? [i] : []))
}

// Ids of `kind` that can be announced now, sorted: in the run's mode, not banned (Pest control),
// not kept away by a running Scarecrow, and with a target if they need one.
function eligibleEvents(state: GameState, kind: EventKind, config: EventConfig = EVENTS): string[] {
    const m = modifiersFor(state.upgrades)
    return Object.values(config.events)
        .filter(
            (def) =>
                def.kind === kind &&
                def.modes.includes(state.mode) &&
                (def.banStat === null || m[def.banStat] <= 0) &&
                !(def.scaredOff && state.tick < state.scarecrowUntil) &&
                (def.target === null || eventTargets(state, def).length > 0)
        )
        .map((def) => def.id)
        .sort()
}

// Picks the next event from rng.events: a kind roll, a weighted event roll, and a plot pick for
// plot events. Every number the event uses is fixed here. With `kind` given (Good omen), there
// is no kind roll and only that kind is used.
function announceEvent(
    state: GameState,
    config: EventConfig = EVENTS,
    kind: EventKind | null = null
): [RunEvent | null, RNGState] {
    const good = eligibleEvents(state, "good", config)
    const bad = eligibleEvents(state, "bad", config)
    let rng = state.rng.events
    let ids: string[]
    if (kind !== null) {
        ids = kind === "good" ? good : bad
        if (ids.length === 0) return [null, rng]
    } else {
        if (good.length === 0 && bad.length === 0) return [null, rng]
        const m = modifiersFor(state.upgrades)
        const [kindRoll, afterKind] = randomInt(rng, 0, 99)
        rng = afterKind
        ids = kindRoll < m.goodEventPct ? good : bad
        if (ids.length === 0) ids = ids === good ? bad : good
    }

    const total = ids.reduce((sum, id) => sum + config.events[id].weight, 0)
    const [eventRoll, afterEvent] = randomInt(rng, 0, total - 1)
    rng = afterEvent
    let r = eventRoll
    let id = ids[ids.length - 1]
    for (const candidate of ids) {
        const w = config.events[candidate].weight
        if (r < w) {
            id = candidate
            break
        }
        r -= w
    }
    const def = config.events[id]

    let plot: number | null = null
    if (def.target === "plot") {
        const [chosen, afterPlot] = pick(rng, eventTargets(state, def))
        plot = chosen
        rng = afterPlot
    }

    return [buildEvent(state, def, plot), rng]
}

// The RunEvent for `def` announced now on `plot`: news lead, warning, length and amount with the
// run's modifiers applied. announceEvent and the debug menu both use it.
function buildEvent(state: GameState, def: EventDef, plot: number | null): RunEvent {
    const m = modifiersFor(state.upgrades)
    const warnAt = state.tick + (def.news === null ? 0 : def.news.leadTicks)
    const startsAt = warnAt + def.warnTicks + m.warnBonusSeconds * TICKS_PER_SECOND
    const length =
        def.durationTicks === null ? 0 : scalePct(def.durationTicks, pctOf(m, def.durationStat))
    const base = baseAmount(def.effect)
    let amount = base === null ? null : scalePct(base, pctOf(m, def.amountStat))
    // Four-leaf: Lucky clover marks more plots.
    if (amount !== null && def.effect.kind === "luckyClover") amount += m.cloverExtraPlots
    return {
        id: def.id,
        announcedAt: state.tick,
        warnAt,
        startsAt,
        endsAt: startsAt + length,
        plot,
        amount
    }
}

// ---------------------------------------------------------------------------------------------
// Starting

// Helpful neighbor: every ready crop is harvested into storage (yield + yieldBonus, doubled on a
// Lucky clover plot, no bumper roll or drop), and with Good neighbors replanted with the same
// crop. If the whole harvest doesn't fit in storage, nothing happens.
function harvestAll(state: GameState, crops: CropTable): GameState {
    const replant = modifiersFor(state.upgrades).neighborReplant > 0
    const crop = (plot: number, cropId: string) => {
        const { yieldBonus } = modifiersAt(state.upgrades, { plot, cropId })
        return (crops[cropId].yield + yieldBonus) * (state.cloverPlots.includes(plot) ? 2 : 1)
    }
    const total = state.plots.reduce(
        (sum, p, plot) => (p.state === "ready" ? sum + crop(plot, p.cropId) : sum),
        0
    )
    if (total > storageFree(state)) return state
    const inventory: Inventory = { ...state.inventory }
    let changed = false
    const plots = state.plots.map((p, plot): Plot => {
        if (p.state !== "ready") return p
        changed = true
        const { cropId } = p
        inventory[cropId] = (inventory[cropId] ?? 0) + crop(plot, cropId)
        const empty: Plot = { state: "empty" }
        if (!replant) return empty
        const pct = plantGrowthPct(state, plot, cropId)
        const cut = plantCutTicks(state, plot, cropId)
        return plant(empty, cropId, state.tick, crops, pct, cut) ?? empty
    })
    if (!changed) return state
    const cloverPlots = state.cloverPlots.filter((i) => state.plots[i].state !== "ready")
    return { ...state, plots, inventory, cloverPlots }
}

// Birds: up to `count` empty, unshielded plots get a random crop planted. Two draws per seeded
// plot from rng.events: which plot, then which crop.
function seedPlots(state: GameState, count: number, crops: CropTable): GameState {
    const shielded = shieldedPlots(state)
    let free = state.plots.flatMap((p, i) =>
        p.state === "empty" && !shielded.includes(i) ? [i] : []
    )
    const ids = Object.keys(crops).sort()
    if (free.length === 0 || ids.length === 0) return state
    let rng = state.rng.events
    let plots = state.plots
    for (let n = 0; n < count && free.length > 0; n++) {
        const [plot, afterPlot] = pick(rng, free)
        const [cropId, afterCrop] = pick(afterPlot, ids)
        rng = afterCrop
        free = free.filter((i) => i !== plot)
        const pct = plantGrowthPct(state, plot, cropId)
        const cut = plantCutTicks(state, plot, cropId)
        // Marked, so the player can dig it up while it grows.
        const seeded: Plot = {
            ...plant(plots[plot], cropId, state.tick, crops, pct, cut)!,
            seeded: true
        } as Plot
        plots = plots.map((p, i) => (i === plot ? seeded : p))
    }
    return { ...state, plots, rng: { ...state.rng, events: rng } }
}

// Crows: they land on up to `count` plots holding a crop and not in `exclude`, one pick each
// from rng.events, and block harvesting there until scared off or the effect ends. With no crop
// on the field nothing happens and nothing is drawn.
function landCrows(
    state: GameState,
    id: string,
    count: number,
    length: number,
    exclude: number[]
): GameState {
    let free = state.plots.flatMap((p, i) =>
        p.state !== "empty" && !exclude.includes(i) ? [i] : []
    )
    if (free.length === 0) return state
    let rng = state.rng.events
    const chosen: number[] = []
    for (let n = 0; n < count && free.length > 0; n++) {
        const [plot, next] = pick(rng, free)
        rng = next
        chosen.push(plot)
        free = free.filter((i) => i !== plot)
    }
    chosen.sort((a, b) => a - b)
    return {
        ...state,
        rng: { ...state.rng, events: rng },
        activeEffects: startEffect(
            state.activeEffects,
            id,
            { kind: "blockHarvest", plots: count },
            state.tick,
            length,
            exclude,
            chosen
        )
    }
}

// Lucky clover: up to `count` plots holding a crop and not yet marked are marked, one pick each
// from rng.events. With no such plot nothing happens and nothing is drawn.
function markClover(state: GameState, count: number): GameState {
    let free = state.plots.flatMap((p, i) =>
        p.state !== "empty" && !state.cloverPlots.includes(i) ? [i] : []
    )
    if (free.length === 0) return state
    let rng = state.rng.events
    const marked = [...state.cloverPlots]
    for (let n = 0; n < count && free.length > 0; n++) {
        const [plot, next] = pick(rng, free)
        rng = next
        marked.push(plot)
        free = free.filter((i) => i !== plot)
    }
    marked.sort((a, b) => a - b)
    return { ...state, cloverPlots: marked, rng: { ...state.rng, events: rng } }
}

// Emergency order: one extra order with `timePct`% of the usual time, from rng.events (two
// draws, as createOrder). It is added past maxOpenOrders.
function addOrder(
    state: GameState,
    timePct: number,
    crops: CropTable,
    rules: OrderRules
): GameState {
    // No new orders while a Giant order is open, or during Timed's Giant order penalty.
    if (ordersBlocked(state)) return state
    const short = { ...rules, orderTicks: scalePct(rules.orderTicks, timePct) }
    const [order, events] = createOrder(
        state.nextOrderId,
        state.tick,
        state.rng.events,
        crops,
        short
    )
    return {
        ...state,
        orders: [...state.orders, order],
        nextOrderId: state.nextOrderId + 1,
        rng: { ...state.rng, events }
    }
}

// Rot: each stored crop loses `pct`% of its amount, rounded down. Crops that reach 0 are removed.
function rotStorage(inventory: Inventory, pct: number): Inventory {
    const out: Inventory = {}
    for (const [cropId, amount] of Object.entries(inventory)) {
        const left = amount - Math.floor((amount * pct) / 100)
        if (left > 0) out[cropId] = left
    }
    return out
}

// Generous customer: one open order, picked from rng.events (one draw, in board order), pays
// `coins` more when it is filled. Orders failing on this tick are left out. With no open order
// nothing happens and nothing is drawn.
function tipOrder(state: GameState, coins: number): GameState {
    const open = state.orders.filter((o) => !isExpired(o, state.tick))
    if (open.length === 0) return state
    const [roll, events] = randomInt(state.rng.events, 0, open.length - 1)
    const id = open[roll].id
    return {
        ...state,
        rng: { ...state.rng, events },
        orders: state.orders.map((o) => (o.id === id ? { ...o, tip: o.tip + coins } : o))
    }
}

// Fires the announced event on its start tick: an optional block roll, then its effect.
// `crops` and `rules` (the current order rules) are for the effects that plant or make orders.
function startEvent(
    state: GameState,
    crops: CropTable,
    rules: OrderRules,
    config: EventConfig = EVENTS
): GameState {
    const event = state.event
    if (event === null || event.startsAt !== state.tick) return state
    const def = config.events[event.id]
    const now = state.tick

    // Moles find nothing on a plot the player emptied during the warning: no roll, no effect.
    if (def.effect.kind === "stealCrop" && stealCrop(state.plots[event.plot!]) === null) {
        return state
    }
    const exclude = def.kind === "bad" ? shieldedPlots(state) : []
    // Crows find nothing on a field with no crop to sit on: no roll, no effect.
    if (
        def.effect.kind === "blockHarvest" &&
        !state.plots.some((p, i) => p.state !== "empty" && !exclude.includes(i))
    ) {
        return state
    }

    let next = state
    const chance = def.blockStat === null ? 0 : modifiersFor(state.upgrades)[def.blockStat]
    if (chance > 0) {
        const [roll, events] = randomInt(state.rng.events, 0, 99)
        next = { ...state, rng: { ...state.rng, events } }
        if (roll < chance) return next
    }

    const length = event.endsAt - event.startsAt
    const effect = def.effect
    switch (effect.kind) {
        case "cutGrowth":
            return { ...next, plots: cutGrowth(next.plots, event.amount!, now) }
        case "stealCrop":
            return {
                ...next,
                plots: next.plots.map((p, i) => (i === event.plot ? stealCrop(p)! : p))
            }
        case "harvestAll":
            return harvestAll(next, crops)
        case "seedPlots":
            return seedPlots(next, event.amount!, crops)
        case "addOrder":
            return addOrder(next, event.amount!, crops, rules)
        case "rotStorage":
            return { ...next, inventory: rotStorage(next.inventory, event.amount!) }
        case "tipOrder":
            return tipOrder(next, event.amount!)
        case "luckyClover":
            return markClover(next, event.amount!)
        case "scarecrow":
            return {
                ...next,
                scarecrowUntil: Math.max(
                    next.scarecrowUntil,
                    now + event.amount! * TICKS_PER_SECOND
                )
            }
        case "deliverBonus":
            return {
                ...next,
                activeEffects: startEffect(
                    next.activeEffects,
                    def.id,
                    { kind: "deliverBonus", coins: event.amount! },
                    now,
                    length,
                    exclude
                )
            }
        case "harvestBonus":
            return {
                ...next,
                activeEffects: startEffect(
                    next.activeEffects,
                    def.id,
                    { kind: "harvestBonus", crops: event.amount! },
                    now,
                    length,
                    exclude
                )
            }
        case "blockHarvest":
            return landCrows(next, def.id, event.amount!, length, exclude)
        case "growthRate":
        case "orderRate":
        case "fog":
        case "drought":
            return {
                ...next,
                activeEffects: startEffect(next.activeEffects, def.id, effect, now, length, exclude)
            }
        default:
            return next // power-up-only effects are refused by validateEvents
    }
}

export {
    validateEvents,
    EVENTS,
    gapTicks,
    shieldedPlots,
    eventTargets,
    eligibleEvents,
    announceEvent,
    buildEvent,
    startEvent,
    rotStorage,
    tipOrder
}
