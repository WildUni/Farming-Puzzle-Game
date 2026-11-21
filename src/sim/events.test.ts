import { describe, it, expect } from "vitest"
import {
    validateEvents,
    EVENTS,
    gapTicks,
    shieldedPlots,
    eventTargets,
    eligibleEvents,
    announceEvent
} from "./events"
import { createGame, applyAction, step } from "./main"
import { buildCropTable } from "./plot"
import { nextValue } from "./mulberry"
import { TICKS_PER_SECOND } from "./game_constants"
import { DIFFICULTY } from "./difficulty"
import { UPGRADES, scalePct } from "./upgrades"
import rawEvents from "../data/events.json"
import type {
    EventConfig,
    GameConfig,
    GameState,
    OwnedUpgrade,
    Plot,
    RunEvent,
    Tier
} from "./types"

const crops = buildCropTable([
    { id: "garlic", growTicks: 80, yield: 2, value: 2 },
    { id: "pumpkin", growTicks: 250, yield: 5, value: 12 }
])

const on: GameConfig = { mode: "survival", allowPowerUps: false, allowEvents: true }
const off: GameConfig = { mode: "survival", allowPowerUps: false, allowEvents: false }
const timedOn: GameConfig = { mode: "timed", allowPowerUps: false, allowEvents: true }

const growing = (readyAt: number, plantedAt = 0): Plot => ({
    state: "growing",
    cropId: "pumpkin",
    plantedAt,
    readyAt
})
const ready: Plot = { state: "ready", cropId: "garlic" }
const empty: Plot = { state: "empty" }

function game(overrides: Partial<GameState> = {}, config: GameConfig = on): GameState {
    return { ...createGame(1, config), ...overrides }
}

function own(id: string, tier: Tier, target: number | string | null = null): OwnedUpgrade {
    return { id, tier, target }
}

function advance(rng: number, draws: number): number {
    let r = rng
    for (let i = 0; i < draws; i++) r = nextValue(r)[1]
    return r
}

// An event of a shipped id that starts on the next step.
function startsNext(state: GameState, id: string, extra: Partial<RunEvent> = {}): GameState {
    const def = EVENTS.events[id]
    const startsAt = state.tick + 1
    const event: RunEvent = {
        id,
        announcedAt: state.tick,
        startsAt,
        endsAt: startsAt + (def.durationTicks ?? 0),
        plot: null,
        amount:
            def.effect.kind === "cutGrowth"
                ? def.effect.ticks
                : def.effect.kind === "deliverBonus"
                  ? def.effect.coins
                  : null,
        ...extra
    }
    return { ...state, event, nextEventAt: Number.MAX_SAFE_INTEGER }
}

function stepN(state: GameState, n: number): GameState {
    let s = state
    for (let i = 0; i < n; i++) s = step(s, crops)
    return s
}

// A small config of our own, so these tests don't depend on the shipped numbers.
function rawConfig(): Record<string, unknown> {
    return {
        firstEventSeconds: 2,
        timedGapSeconds: 3,
        events: [
            {
                id: "rain",
                name: "Rain",
                kind: "good",
                modes: ["survival", "timed"],
                weight: 1,
                warnSeconds: 1,
                effect: { kind: "cutGrowth", ticks: 20 },
                amountStat: "rainCutPct"
            },
            {
                id: "frost",
                name: "Frost",
                kind: "bad",
                modes: ["survival", "timed"],
                weight: 3,
                warnSeconds: 2,
                seconds: 4,
                effect: { kind: "growthRate", pct: 0 },
                durationStat: "frostDurationPct"
            },
            {
                id: "moles",
                name: "Moles",
                kind: "bad",
                modes: ["survival"],
                weight: 1,
                warnSeconds: 2,
                target: "plot",
                effect: { kind: "stealCrop" },
                blockStat: "moleBlockChance"
            }
        ]
    }
}

const config: EventConfig = validateEvents(rawConfig())

describe("validateEvents", () => {
    it("accepts the shipped events.json", () => {
        expect(() => validateEvents(rawEvents)).not.toThrow()
        expect(Object.keys(EVENTS.events).sort()).toEqual([
            "crows",
            "frost",
            "generousCustomer",
            "moles",
            "rainShower",
            "sunnySpell"
        ])
    })

    it("turns seconds into ticks and missing optional fields into null", () => {
        expect(config.firstEventTicks).toBe(2 * TICKS_PER_SECOND)
        expect(config.timedGapTicks).toBe(3 * TICKS_PER_SECOND)
        expect(config.events.frost).toMatchObject({
            warnTicks: 2 * TICKS_PER_SECOND,
            durationTicks: 4 * TICKS_PER_SECOND,
            target: null,
            amountStat: null,
            blockStat: null
        })
        expect(config.events.rain.durationTicks).toBeNull()
        expect(config.events.moles.target).toBe("plot")
    })

    type Raw = { events: Record<string, unknown>[] } & Record<string, unknown>
    const bad: [string, (r: Raw) => void][] = [
        ["firstEventSeconds 0", (r) => (r.firstEventSeconds = 0)],
        ["a fractional timedGapSeconds", (r) => (r.timedGapSeconds = 1.5)],
        ["no events", (r) => (r.events = [])],
        ["an empty id", (r) => (r.events[0].id = "")],
        ["a repeated id", (r) => (r.events[1].id = "rain")],
        ["a power-up id", (r) => (r.events[0].id = "orderFreeze")],
        ["a missing name", (r) => delete r.events[0].name],
        ["an unknown kind", (r) => (r.events[0].kind = "neutral")],
        ["empty modes", (r) => (r.events[0].modes = [])],
        ["a repeated mode", (r) => (r.events[0].modes = ["timed", "timed"])],
        ["an unknown mode", (r) => (r.events[0].modes = ["puzzle"])],
        ["a weight of 0", (r) => (r.events[0].weight = 0)],
        ["warnSeconds 0", (r) => (r.events[0].warnSeconds = 0)],
        ["a power-up-only effect", (r) => (r.events[0].effect = { kind: "grantCoins", amount: 1 })],
        ["finishGrowth", (r) => (r.events[0].effect = { kind: "finishGrowth" })],
        ["a rate of 100", (r) => (r.events[1].effect = { kind: "growthRate", pct: 100 })],
        ["0 bonus coins", (r) => (r.events[1].effect = { kind: "deliverBonus", coins: 0 })],
        ["a lasting event without seconds", (r) => delete r.events[1].seconds],
        ["seconds on an instant event", (r) => (r.events[0].seconds = 3)],
        ["an unknown target", (r) => (r.events[2].target = "crop")],
        ["stealCrop without a target", (r) => delete r.events[2].target],
        ["a target on another effect", (r) => (r.events[1].target = "plot")],
        ["durationStat on an instant event", (r) => (r.events[0].durationStat = "rainCutPct")],
        ["amountStat on a rate effect", (r) => (r.events[1].amountStat = "rainCutPct")],
        ["an unknown stat", (r) => (r.events[1].durationStat = "speedPct")],
        ["a durationStat not ending in Pct", (r) => (r.events[1].durationStat = "yieldBonus")],
        ["a blockStat not ending in Chance", (r) => (r.events[2].blockStat = "rainCutPct")]
    ]
    for (const [name, change] of bad) {
        it(`throws for ${name}`, () => {
            const raw = rawConfig() as Raw
            change(raw)
            expect(() => validateEvents(raw)).toThrow()
        })
    }
})

describe("gapTicks", () => {
    it("follows the Survival level, uses the Timed constant, and Calm skies stretches both", () => {
        const level0 = DIFFICULTY.levels[0].eventGapSeconds * TICKS_PER_SECOND
        const last = DIFFICULTY.levels[DIFFICULTY.levels.length - 1].eventGapSeconds
        expect(gapTicks(game())).toBe(level0)
        expect(gapTicks(game({ ordersCompleted: 1000 }))).toBe(last * TICKS_PER_SECOND)
        expect(gapTicks(game({ ordersCompleted: 1000 }))).toBeLessThan(level0)
        const timed = createGame(1, timedOn)
        expect(gapTicks(timed)).toBe(EVENTS.timedGapTicks)
        const calm = [own("calmSkies", "legendary")]
        expect(gapTicks(game({ upgrades: calm }))).toBe(scalePct(level0, 125))
        expect(gapTicks({ ...timed, upgrades: calm })).toBe(scalePct(EVENTS.timedGapTicks, 125))
    })
})

describe("shieldedPlots / eventTargets / eligibleEvents", () => {
    it("a Greenhouse plot is shielded, and Moles never targets it or an empty plot", () => {
        const s = game({
            plots: [growing(100), ready, empty, growing(100)],
            upgrades: [own("greenhouse", "epic", 3)]
        })
        expect(shieldedPlots(s)).toEqual([3])
        expect(eventTargets(s, EVENTS.events.moles)).toEqual([0, 1])
        expect(eventTargets(s, EVENTS.events.frost)).toEqual([])
    })

    it("Generous customer is Survival only; Moles needs a plot with a crop", () => {
        expect(eligibleEvents(game(), "good")).toContain("generousCustomer")
        expect(eligibleEvents(createGame(1, timedOn), "good")).not.toContain("generousCustomer")
        expect(eligibleEvents(game(), "bad")).toEqual(["crows", "frost"])
        expect(eligibleEvents(game({ plots: [ready, empty, empty, empty] }), "bad")).toEqual([
            "crows",
            "frost",
            "moles"
        ])
    })
})

describe("announceEvent", () => {
    it("draws nothing when nothing is eligible", () => {
        const only: EventConfig = { ...config, events: { moles: config.events.moles } }
        const s = game()
        expect(announceEvent(s, only)).toEqual([null, s.rng.events])
    })

    it("uses two draws for an untargeted event and three for Moles, from rng.events only", () => {
        let sawMoles = false
        let sawOther = false
        for (let seed = 0; seed < 200; seed++) {
            const s = { ...createGame(seed, on), plots: [ready, ready, ready, ready] }
            const [event, rng] = announceEvent(s, config)
            const draws = event!.id === "moles" ? 3 : 2
            if (event!.id === "moles") sawMoles = true
            else sawOther = true
            expect(rng).toBe(advance(s.rng.events, draws))
        }
        expect(sawMoles && sawOther).toBe(true)
    })

    it("gives the same event for the same state", () => {
        const s = game({ plots: [ready, ready, empty, empty] })
        expect(announceEvent(s, config)).toEqual(announceEvent(s, config))
    })

    it("fixes startsAt, endsAt and amount from the warning, length and stats", () => {
        // Look for a seed that announces each event, with and without upgrades.
        const find = (id: string, upgrades: OwnedUpgrade[]) => {
            for (let seed = 0; seed < 500; seed++) {
                const s = { ...createGame(seed, on), tick: 100, upgrades, plots: [ready] }
                const [event] = announceEvent(s, config)
                if (event!.id === id) return event!
            }
            throw new Error(`no seed announces ${id}`)
        }
        expect(find("frost", [])).toMatchObject({ announcedAt: 100, startsAt: 120, endsAt: 160 })
        expect(find("rain", [])).toMatchObject({ startsAt: 110, endsAt: 110, amount: 20 })
        const upgrades = [
            own("earlyWarning", "rare"),
            own("frostCover", "legendary"),
            own("rainmaker", "legendary")
        ]
        expect(find("frost", upgrades)).toMatchObject({ startsAt: 150, endsAt: 170 })
        expect(find("rain", upgrades)).toMatchObject({ startsAt: 140, amount: 40 })
        expect(find("moles", [])).toMatchObject({ plot: 0, amount: null })
    })

    it("falls back to the other kind when the rolled kind has nothing eligible", () => {
        const goodOnly: EventConfig = { ...config, events: { rain: config.events.rain } }
        for (let seed = 0; seed < 50; seed++) {
            expect(announceEvent(createGame(seed, on), goodOnly)[0]!.id).toBe("rain")
        }
    })

    it("splits good and bad close to goodEventPct, and bad events close to their weights", () => {
        let good = 0
        let frost = 0
        const n = 3000
        for (let seed = 0; seed < n; seed++) {
            const [event] = announceEvent(createGame(seed, on), config)
            if (event!.id === "rain") good++
            if (event!.id === "frost") frost++
        }
        const pct = UPGRADES.stats.goodEventPct.base / 100
        expect(good / n).toBeGreaterThan(pct - 0.05)
        expect(good / n).toBeLessThan(pct + 0.05)
        expect(frost).toBe(n - good) // moles has no target with every plot empty
    })
})

describe("events in step", () => {
    it("with events off, nothing is ever announced and rng.events never moves", () => {
        const s = stepN(createGame(1, off), 2000)
        expect(s.event).toBeNull()
        expect(s.rng.events).toBe(createGame(1, off).rng.events)
    })

    it("announces the first event on firstEventTicks, and the next a gap after it ends", () => {
        let s = createGame(3, on)
        s = stepN(s, EVENTS.firstEventTicks - 1)
        expect(s.event).toBeNull()
        s = step(s, crops)
        expect(s.event).not.toBeNull()
        expect(s.event!.announcedAt).toBe(EVENTS.firstEventTicks)
        const first = s.event!
        s = stepN(s, first.endsAt - s.tick)
        expect(s.event).toBeNull()
        expect(s.nextEventAt).toBe(first.endsAt + gapTicks(s))
        s = stepN(s, s.nextEventAt - s.tick)
        expect(s.event).not.toBeNull()
        expect(s.event!.announcedAt).toBe(first.endsAt + gapTicks(s))
    })

    it("never runs two events at once over a long run", () => {
        let s = createGame(5, on)
        let current: RunEvent | null = null
        let seen = 0
        for (let i = 0; i < 6000 && s.status === "running"; i++) {
            s = step(s, crops)
            if (s.event !== null && s.event !== current) {
                expect(current === null || s.tick >= current.endsAt).toBe(true)
                current = s.event
                seen++
            }
        }
        expect(seen).toBeGreaterThan(3)
    })

    it("stops while an upgrade offer is open", () => {
        const s = startsNext(game(), "frost")
        const paused = { ...s, upgradeOffer: [{ id: "bigTips", tier: "common" as const }] }
        expect(step(paused, crops)).toBe(paused)
    })

    it("Rain shower cuts growth on its start tick and readies crops brought to it", () => {
        const s = startsNext(
            game({ plots: [growing(500), growing(30), empty, ready] }),
            "rainShower"
        )
        const next = step(s, crops)
        expect(next.plots[0]).toMatchObject({ state: "growing", readyAt: 450 })
        expect(next.plots[1]).toEqual({ state: "ready", cropId: "pumpkin" })
        expect(next.event).toBeNull()
    })

    it("Frost holds crops for exactly its length, and skips a Greenhouse plot", () => {
        const length = EVENTS.events.frost.durationTicks!
        const s = startsNext(
            game({
                plots: [growing(5000), growing(5000)],
                upgrades: [own("greenhouse", "epic", 1)]
            }),
            "frost"
        )
        const end = stepN(s, length + 5)
        expect(end.plots[0]).toMatchObject({ readyAt: 5000 + length })
        expect(end.plots[1]).toMatchObject({ readyAt: 5000 })
        expect(end.activeEffects).toEqual([])
    })

    it("Sunny spell speeds crops by the rate rule for its length", () => {
        const length = EVENTS.events.sunnySpell.durationTicks!
        const end = stepN(startsNext(game({ plots: [growing(5000)] }), "sunnySpell"), length + 5)
        expect(end.plots[0]).toMatchObject({ readyAt: 5000 - Math.trunc(length / 2) })
    })

    it("Crows refuse harvest while they're here, but not on a Greenhouse plot", () => {
        const length = EVENTS.events.crows.durationTicks!
        let s = startsNext(
            game({ plots: [ready, ready], upgrades: [own("greenhouse", "epic", 1)] }),
            "crows"
        )
        s = step(s, crops)
        const startsAt = s.tick
        expect(applyAction(s, { type: "harvest", plot: 0 }, crops)).toBeNull()
        expect(applyAction(s, { type: "harvest", plot: 1 }, crops)).not.toBeNull()
        s = stepN(s, length - 1)
        expect(s.tick).toBe(startsAt + length - 1)
        expect(applyAction(s, { type: "harvest", plot: 0 }, crops)).toBeNull()
        s = step(s, crops)
        expect(applyAction(s, { type: "harvest", plot: 0 }, crops)).not.toBeNull()
    })

    it("Generous customer adds its bonus to deliveries while it lasts", () => {
        const length = EVENTS.events.generousCustomer.durationTicks!
        const bonus = (EVENTS.events.generousCustomer.effect as { coins: number }).coins
        let s = step(startsNext(game(), "generousCustomer"), crops)
        const order = s.orders[0]
        const crop = Object.keys(order.required)[0]
        const stocked = { ...s, inventory: { [crop]: 99 } }
        const paid = (st: GameState) =>
            applyAction(st, { type: "deliver", orderId: order.id }, crops)!.coins - st.coins
        const normal = DIFFICULTY.coinsPerOrder
        expect(paid(stocked)).toBe(normal + bonus)
        s = stepN(stocked, length)
        expect(paid({ ...s, inventory: { [crop]: 99 } })).toBe(normal)
    })

    it("Moles empty their plot, fizzle on an emptied plot, and Mole traps can stop them", () => {
        const s = startsNext(game({ plots: [ready, growing(500)] }), "moles", { plot: 1 })
        expect(step(s, crops).plots[1]).toEqual(empty)

        const emptied = { ...s, plots: [ready, empty] }
        const fizzled = step(emptied, crops)
        expect(fizzled.plots[1]).toEqual(empty)
        expect(fizzled.rng.events).toBe(emptied.rng.events)

        const traps = [own("moleTraps", "legendary"), own("moleTraps", "legendary")]
        const outcomes = new Set<string>()
        for (let seed = 0; seed < 60; seed++) {
            const t = startsNext(
                { ...createGame(seed, on), plots: [ready, growing(500)], upgrades: traps },
                "moles",
                { plot: 1 }
            )
            const after = step(t, crops)
            expect(after.rng.events).toBe(advance(t.rng.events, 1))
            outcomes.add(after.plots[1].state)
        }
        expect(outcomes).toEqual(new Set(["empty", "growing"]))
    })

    it("events never change the orders a run creates", () => {
        const a = stepN(createGame(9, off), 3000)
        const b = stepN(createGame(9, on), 3000)
        expect(b.rng.orders).toBe(a.rng.orders)
        expect(b.nextOrderId).toBe(a.nextOrderId)
    })
})
