// Events: definitions from src/data/events.json, choosing and announcing the next event, and
// starting one. See specs/events.md.
import type {
    Effect,
    EventConfig,
    EventDef,
    EventKind,
    GameMode,
    GameState,
    Modifiers,
    ModifierStat,
    RNGState,
    RunEvent
} from "./types"
import { TICKS_PER_SECOND } from "./game_constants"
import { pick, randomInt } from "./mulberry"
import { MODIFIER_STATS, modifiersAt, modifiersFor, scalePct } from "./upgrades"
import { eventGapTicks, levelFor } from "./difficulty"
import { POWER_UPS } from "./powerups"
import { cutGrowth, startEffect, stealCrop } from "./effects"
import rawEvents from "../data/events.json"

const EVENT_MODES: readonly GameMode[] = ["survival", "timed"]
const EVENT_KINDS: readonly EventKind[] = ["good", "bad"]
const LASTING_KINDS: readonly string[] = ["growthRate", "orderRate", "blockHarvest", "deliverBonus"]
const AMOUNT_KINDS: readonly string[] = ["cutGrowth", "deliverBonus"]

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

// The effects an event may use: everything but the power-up-only finishGrowth and grantCoins.
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
            return { kind: "blockHarvest" }
        case "deliverBonus":
            return { kind: "deliverBonus", coins: wholeAtLeast(raw.coins, 1, `${at}.coins`) }
        case "stealCrop":
            return { kind: "stealCrop" }
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
    if (durationStat !== null && !lasting) fail(`${at}.durationStat`, "left out when instant")
    if (amountStat !== null && !AMOUNT_KINDS.includes(effect.kind)) {
        fail(`${at}.amountStat`, "left out for an effect with no amount")
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
        blockStat
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

// The effect's own amount (cutGrowth ticks, deliverBonus coins), or null.
function baseAmount(effect: Effect): number | null {
    if (effect.kind === "cutGrowth") return effect.ticks
    if (effect.kind === "deliverBonus") return effect.coins
    return null
}

// Ticks after an event ends until the next may be announced, with Calm skies applied.
function gapTicks(state: GameState, config: EventConfig = EVENTS): number {
    const gap =
        state.mode === "survival"
            ? eventGapTicks(levelFor(state.ordersCompleted))
            : config.timedGapTicks
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

// Ids of `kind` that can be announced now, sorted.
function eligibleEvents(state: GameState, kind: EventKind, config: EventConfig = EVENTS): string[] {
    return Object.values(config.events)
        .filter(
            (def) =>
                def.kind === kind &&
                def.modes.includes(state.mode) &&
                (def.target === null || eventTargets(state, def).length > 0)
        )
        .map((def) => def.id)
        .sort()
}

// Picks the next event from rng.events: a kind roll, a weighted event roll, and a plot pick for
// plot events. Every number the event uses is fixed here.
function announceEvent(
    state: GameState,
    config: EventConfig = EVENTS
): [RunEvent | null, RNGState] {
    const good = eligibleEvents(state, "good", config)
    const bad = eligibleEvents(state, "bad", config)
    let rng = state.rng.events
    if (good.length === 0 && bad.length === 0) return [null, rng]
    const m = modifiersFor(state.upgrades)

    const [kindRoll, afterKind] = randomInt(rng, 0, 99)
    let ids = kindRoll < m.goodEventPct ? good : bad
    if (ids.length === 0) ids = ids === good ? bad : good

    const total = ids.reduce((sum, id) => sum + config.events[id].weight, 0)
    const [eventRoll, afterEvent] = randomInt(afterKind, 0, total - 1)
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

    const startsAt = state.tick + def.warnTicks + m.warnBonusSeconds * TICKS_PER_SECOND
    const length =
        def.durationTicks === null ? 0 : scalePct(def.durationTicks, pctOf(m, def.durationStat))
    const amount = baseAmount(def.effect)
    return [
        {
            id,
            announcedAt: state.tick,
            startsAt,
            endsAt: startsAt + length,
            plot,
            amount: amount === null ? null : scalePct(amount, pctOf(m, def.amountStat))
        },
        rng
    ]
}

// ---------------------------------------------------------------------------------------------
// Starting

// Fires the announced event on its start tick: an optional block roll, then its effect.
function startEvent(state: GameState, config: EventConfig = EVENTS): GameState {
    const event = state.event
    if (event === null || event.startsAt !== state.tick) return state
    const def = config.events[event.id]
    const now = state.tick

    // Moles find nothing on a plot the player emptied during the warning: no roll, no effect.
    if (def.effect.kind === "stealCrop" && stealCrop(state.plots[event.plot!]) === null) {
        return state
    }

    let next = state
    const chance = def.blockStat === null ? 0 : modifiersFor(state.upgrades)[def.blockStat]
    if (chance > 0) {
        const [roll, events] = randomInt(state.rng.events, 0, 99)
        next = { ...state, rng: { ...state.rng, events } }
        if (roll < chance) return next
    }

    const exclude = def.kind === "bad" ? shieldedPlots(state) : []
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
        case "growthRate":
        case "orderRate":
        case "blockHarvest":
            return {
                ...next,
                activeEffects: startEffect(next.activeEffects, def.id, effect, now, length, exclude)
            }
        default:
            return next // finishGrowth and grantCoins are refused by validateEvents
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
    startEvent
}
