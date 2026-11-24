import { describe, it, expect } from "vitest"
import {
    validateEvents,
    EVENTS,
    gapTicks,
    shieldedPlots,
    eventTargets,
    eligibleEvents,
    announceEvent,
    buildEvent,
    rotStorage
} from "./events"
import { debugEvent } from "./debug"
import { replay } from "./verification"
import { harvestBlocked } from "./effects"
import { createGame, applyAction, step, orderRules } from "./main"
import { buildCropTable } from "./plot"
import { nextValue } from "./mulberry"
import { TICKS_PER_SECOND } from "./game_constants"
import { DIFFICULTY } from "./difficulty"
import { MODES } from "./modes"
import { UPGRADES, modifiersFor, scalePct } from "./upgrades"
import { storageCap } from "./economy"
import rawEvents from "../data/events.json"
import type {
    Action,
    EventConfig,
    GameConfig,
    GameState,
    OwnedUpgrade,
    LogEntry,
    Plot,
    RunEvent,
    Tier
} from "./types"

const crops = buildCropTable([
    { id: "garlic", growTicks: 80, yield: 2, value: 2, fertilizerCost: 4 },
    { id: "pumpkin", growTicks: 250, yield: 5, value: 12, fertilizerCost: 1 }
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
        warnAt: state.tick,
        startsAt,
        endsAt: startsAt + (def.durationTicks ?? 0),
        plot: null,
        amount:
            def.effect.kind === "cutGrowth"
                ? def.effect.ticks
                : def.effect.kind === "deliverBonus" || def.effect.kind === "tipOrder"
                  ? def.effect.coins
                  : def.effect.kind === "blockHarvest"
                    ? def.effect.plots
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
            "birds",
            "crows",
            "drought",
            "emergencyOrder",
            "fog",
            "frost",
            "generousCustomer",
            "helpfulNeighbor",
            "luckyClover",
            "moles",
            "rainShower",
            "rot",
            "scarecrow",
            "slowDay",
            "sunnySpell",
            "worms"
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
        ["the Merchant call effect", (r) => (r.events[0].effect = { kind: "grantRestock" })],
        ["the Combo freeze effect", (r) => (r.events[1].effect = { kind: "comboRate", pct: 0 })],
        ["the Auto harvest effect", (r) => (r.events[1].effect = { kind: "autoHarvest" })],
        [
            "the Giant order effect",
            (r) => (r.events[0].effect = { kind: "giantOrder", coinsPct: 150, timePct: 150 })
        ],
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

    it("Generous customer is in both modes; Moles needs a plot with a crop", () => {
        expect(eligibleEvents(game(), "good")).toContain("generousCustomer")
        expect(eligibleEvents(createGame(1, timedOn), "good")).toContain("generousCustomer")
        const always = ["birds", "crows", "drought", "emergencyOrder", "fog", "frost", "rot"]
        expect(eligibleEvents(game(), "bad")).toEqual(always)
        expect(eligibleEvents(game({ plots: [ready, empty, empty, empty] }), "bad")).toEqual(
            [...always, "moles"].sort()
        )
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
        // Plenty of lives, so Emergency orders and unfilled orders don't end the run early.
        let s: GameState = { ...createGame(5, on), lives: 1000 }
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

    it("Crows land on up to 2 crop plots, never an empty or Greenhouse one", () => {
        const length = EVENTS.events.crows.durationTicks!
        let s = startsNext(
            game({
                plots: [ready, growing(5000), empty, ready],
                upgrades: [own("greenhouse", "epic", 3)]
            }),
            "crows"
        )
        const rngBefore = s.rng.events
        s = step(s, crops)
        const startsAt = s.tick
        const crows = s.activeEffects.find((a) => a.source === "crows")!
        expect(crows.only).toEqual([0, 1])
        expect(s.rng.events).toBe(advance(rngBefore, 2))
        expect(applyAction(s, { type: "harvest", plot: 0 }, crops)).toBeNull()
        expect(applyAction(s, { type: "harvest", plot: 3 }, crops)).not.toBeNull()
        s = stepN(s, length - 1)
        expect(s.tick).toBe(startsAt + length - 1)
        expect(applyAction(s, { type: "harvest", plot: 0 }, crops)).toBeNull()
        s = step(s, crops)
        expect(applyAction(s, { type: "harvest", plot: 0 }, crops)).not.toBeNull()
    })

    it("Crows pick 2 of many crop plots from rng.events, the same way every time", () => {
        const s = startsNext(game({ plots: [ready, ready, ready, ready] }), "crows")
        const a = step(s, crops)
        const only = a.activeEffects.find((e) => e.source === "crows")!.only!
        expect(only).toHaveLength(2)
        expect([...only].sort()).toEqual(only)
        for (let plot = 0; plot < 4; plot++) {
            expect(harvestBlocked(a.activeEffects, plot, a.tick)).toBe(only.includes(plot))
        }
        expect(step(s, crops)).toEqual(a)
    })

    it("Crows do nothing and draw nothing on a field with no crop", () => {
        const s = startsNext(
            game({ plots: [empty, empty, empty, ready], upgrades: [own("greenhouse", "epic", 3)] }),
            "crows"
        )
        const after = step(s, crops)
        expect(after.activeEffects).toEqual([])
        expect(after.rng.events).toBe(s.rng.events)
    })

    it("scareCrows clears one plot at a time, and the last one ends the effect", () => {
        const before = startsNext(game({ plots: [ready, ready, empty, empty] }), "crows")
        expect(applyAction(before, { type: "scareCrows", plot: 0 }, crops)).toBeNull()
        const s = step(before, crops)
        expect(applyAction(s, { type: "scareCrows", plot: 2 }, crops)).toBeNull()
        expect(applyAction(s, { type: "scareCrows", plot: 9 }, crops)).toBeNull()

        const one = applyAction(s, { type: "scareCrows", plot: 0 }, crops)!
        expect(one.rng).toEqual(s.rng)
        expect(one.activeEffects.find((a) => a.source === "crows")!.only).toEqual([1])
        expect(applyAction(one, { type: "harvest", plot: 0 }, crops)).not.toBeNull()
        expect(applyAction(one, { type: "harvest", plot: 1 }, crops)).toBeNull()
        expect(applyAction(one, { type: "scareCrows", plot: 0 }, crops)).toBeNull()

        const both = applyAction(one, { type: "scareCrows", plot: 1 }, crops)!
        expect(both.activeEffects).toEqual([])
        expect(applyAction(both, { type: "harvest", plot: 1 }, crops)).not.toBeNull()
    })

    it("a run that scares crows replays equal", () => {
        // A scripted player: scare crows, harvest, plant garlic, deliver whatever it can.
        let found = false
        for (let seed = 1; seed <= 40 && !found; seed++) {
            let s = createGame(seed, on)
            const log: LogEntry[] = []
            const act = (action: LogEntry["action"]) => {
                const next = applyAction(s, action, crops)
                if (next !== null) {
                    s = next
                    log.push({ tick: s.tick, action })
                }
                return next !== null
            }
            let scared = false
            while (s.tick < 3000 && s.status === "running") {
                if (s.upgradeOffer !== null) {
                    act({ type: "chooseUpgrade", upgradeId: s.upgradeOffer[0].id })
                }
                for (let plot = 0; plot < s.plots.length; plot++) {
                    if (act({ type: "scareCrows", plot })) scared = true
                    if (s.plots[plot].state === "ready") act({ type: "harvest", plot })
                    if (s.plots[plot].state === "empty") {
                        act({ type: "plant", plot, cropId: "garlic" })
                    }
                }
                for (const o of [...s.orders]) act({ type: "deliver", orderId: o.id })
                if (scared || s.status !== "running" || s.upgradeOffer !== null) break
                s = step(s, crops)
            }
            if (!scared) continue
            found = true
            const result = replay(seed, on, log, s.tick, crops)
            expect(result.ok).toBe(true)
            if (result.ok) expect(result.state).toEqual(s)
        }
        expect(found).toBe(true)
    })

    it("Generous customer tips one random open order, which pays the tip when filled", () => {
        const tip = (EVENTS.events.generousCustomer.effect as { coins: number }).coins
        expect(EVENTS.events.generousCustomer.durationTicks).toBeNull()
        const two = stepN(game({ nextEventAt: Number.MAX_SAFE_INTEGER }), 1)
        const withOrders = { ...two, orders: [two.orders[0], { ...two.orders[0], id: 99 }] }
        expect(withOrders.orders.every((o) => o.tip === 0)).toBe(true)
        const s = step(startsNext(withOrders, "generousCustomer"), crops)
        const tipped = s.orders.filter((o) => o.tip === tip)
        expect(tipped).toHaveLength(1)
        expect(s.orders.filter((o) => o.tip === 0)).toHaveLength(s.orders.length - 1)
        expect(s.rng.events).toBe(advance(withOrders.rng.events, 1))

        const crop = Object.keys(tipped[0].required)[0]
        const stocked = { ...s, inventory: { [crop]: 99 } }
        const paid = (orderId: number) =>
            applyAction(stocked, { type: "deliver", orderId }, crops)!.coins - stocked.coins
        const normal = DIFFICULTY.coinsPerOrder
        const other = s.orders.find((o) => o.tip === 0)!
        expect(paid(tipped[0].id)).toBe(normal + tip)
        expect(paid(other.id)).toBe(normal)
    })

    it("Generous customer with no open order does nothing and draws nothing", () => {
        const s = startsNext(game(), "generousCustomer")
        const next = step(s, crops)
        expect(next.rng.events).toBe(s.rng.events)
        expect(next.coins).toBe(s.coins)
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

// The shipped event `id` built with the run's modifiers (as announceEvent would) and moved to
// start on the next step.
function builtNext(state: GameState, id: string, plot: number | null = null): GameState {
    const s = debugEvent(state, id, { plot, skipWarning: true })!
    return { ...s, nextEventAt: Number.MAX_SAFE_INTEGER }
}

describe("validateEvents: new effect kinds and banStat", () => {
    // The small config plus one instant event made of `fields`.
    function withEvent(fields: Record<string, unknown>): Record<string, unknown> {
        const raw = rawConfig()
        const events = raw.events as Record<string, unknown>[]
        const extra = {
            id: "extra",
            name: "Extra",
            kind: "bad",
            modes: ["survival"],
            weight: 1,
            warnSeconds: 1,
            ...fields
        }
        return { ...raw, events: [...events, extra] }
    }

    it("accepts each new kind", () => {
        const kinds: Record<string, unknown>[] = [
            { effect: { kind: "harvestBonus", crops: 1 }, seconds: 3, amountStat: "wormBonusPct" },
            { effect: { kind: "fog" }, seconds: 3, durationStat: "fogDurationPct" },
            { effect: { kind: "harvestAll" } },
            { effect: { kind: "seedPlots", plots: 2 }, amountStat: "birdPlotsPct" },
            { effect: { kind: "addOrder", timePct: 50 }, amountStat: "emergencyTimePct" },
            { effect: { kind: "rotStorage", pct: 30 }, amountStat: "rotPct" },
            { effect: { kind: "tipOrder", coins: 5 }, amountStat: "deliverBonusPct" },
            { effect: { kind: "blockHarvest", plots: 2 }, seconds: 2, banStat: "pestBan" }
        ]
        for (const k of kinds) expect(() => validateEvents(withEvent(k))).not.toThrow()
    })

    const bad: [string, Record<string, unknown>][] = [
        ["harvestBonus of 0 crops", { effect: { kind: "harvestBonus", crops: 0 }, seconds: 3 }],
        ["seedPlots of 0 plots", { effect: { kind: "seedPlots", plots: 0 } }],
        ["blockHarvest of 0 plots", { effect: { kind: "blockHarvest", plots: 0 }, seconds: 2 }],
        ["addOrder over 100%", { effect: { kind: "addOrder", timePct: 101 } }],
        ["rotStorage of 0%", { effect: { kind: "rotStorage", pct: 0 } }],
        ["rotStorage over 100%", { effect: { kind: "rotStorage", pct: 101 } }],
        ["tipOrder of 0 coins", { effect: { kind: "tipOrder", coins: 0 } }],
        ["tipOrder with seconds", { effect: { kind: "tipOrder", coins: 5 }, seconds: 3 }],
        ["a power-up-only kind", { effect: { kind: "fillOrder" } }],
        ["fog without seconds", { effect: { kind: "fog" } }],
        ["an amountStat on fog", { effect: { kind: "fog" }, seconds: 2, amountStat: "rotPct" }],
        ["a banStat not ending in Ban", { effect: { kind: "fog" }, seconds: 2, banStat: "rotPct" }],
        ["a banStat that isn't a stat", { effect: { kind: "fog" }, seconds: 2, banStat: "xBan" }]
    ]
    for (const [name, fields] of bad) {
        it(`throws for ${name}`, () => {
            expect(() => validateEvents(withEvent(fields))).toThrow()
        })
    }

    it("reads banStat, and null when it is left out", () => {
        expect(EVENTS.events.crows.banStat).toBe("pestBan")
        expect(EVENTS.events.frost.banStat).toBeNull()
    })
})

describe("Pest control and a forced kind", () => {
    it("Pest control stops Crows from being announced", () => {
        expect(eligibleEvents(game(), "bad")).toContain("crows")
        const banned = game({ upgrades: [own("pestControl", "epic")] })
        expect(eligibleEvents(banned, "bad")).not.toContain("crows")
    })

    it("a forced kind skips the kind roll and only uses that kind", () => {
        for (let seed = 0; seed < 30; seed++) {
            const s = createGame(seed, on)
            const [event, rng] = announceEvent(s, EVENTS, "good")
            expect(EVENTS.events[event!.id].kind).toBe("good")
            expect(rng).toBe(advance(s.rng.events, 1))
        }
    })

    it("a forced kind with nothing eligible gives null and draws nothing", () => {
        const s = game()
        const onlyBad: EventConfig = { ...config, events: { frost: config.events.frost } }
        expect(announceEvent(s, onlyBad, "good")).toEqual([null, s.rng.events])
    })
})

describe("new events in step", () => {
    it("Slow day runs order timers at half speed for its length", () => {
        const length = EVENTS.events.slowDay.durationTicks!
        let s = step(game(), crops)
        const order = s.orders[0]
        s = builtNext(s, "slowDay")
        const end = stepN(s, length + 5)
        const o = end.orders.find((x) => x.id === order.id)!
        expect(o.expiresAt).toBe(order.expiresAt + Math.trunc(length / 2))
    })

    it("Worms add crops to harvests while they work, scaled by Worm farm", () => {
        const plain = step(builtNext(game({ plots: [ready, ready] }), "worms"), crops)
        const got = applyAction(plain, { type: "harvest", plot: 0 }, crops)!
        expect(got.inventory.garlic).toBe(crops.garlic.yield + 1)

        const farm = [own("wormFarm", "legendary")] // +200%: 3 crops
        const big = step(builtNext(game({ plots: [ready], upgrades: farm }), "worms"), crops)
        expect(applyAction(big, { type: "harvest", plot: 0 }, crops)!.inventory.garlic).toBe(
            crops.garlic.yield + 3
        )

        const after = stepN(plain, EVENTS.events.worms.durationTicks!)
        expect(applyAction(after, { type: "harvest", plot: 0 }, crops)!.inventory.garlic).toBe(
            crops.garlic.yield
        )
    })

    it("Helpful neighbor harvests every ready crop, and Good neighbors replant them", () => {
        const s = builtNext(
            game({ plots: [ready, growing(500), ready, empty], inventory: { garlic: 1 } }),
            "helpfulNeighbor"
        )
        const next = step(s, crops)
        expect(next.inventory.garlic).toBe(1 + 2 * crops.garlic.yield)
        expect(next.plots.map((p) => p.state)).toEqual(["empty", "growing", "empty", "empty"])
        expect(next.rng.harvest).toBe(s.rng.harvest)
        expect(next.rng.drops).toBe(s.rng.drops)

        const good = step(
            builtNext(
                game({ plots: [ready, empty], upgrades: [own("goodNeighbors", "rare")] }),
                "helpfulNeighbor"
            ),
            crops
        )
        expect(good.plots[0]).toEqual({
            state: "growing",
            cropId: "garlic",
            plantedAt: good.tick,
            readyAt: good.tick + crops.garlic.growTicks
        })
    })

    it("Helpful neighbor does nothing when its harvest would overflow storage", () => {
        const cap = MODES.survival.storageCap
        const plots = [ready, ready]
        const needed = 2 * crops.garlic.yield
        // One crop short of fitting: nothing is harvested.
        const short = builtNext(
            game({ plots, inventory: { garlic: cap - needed + 1 } }),
            "helpfulNeighbor"
        )
        const after = step(short, crops)
        expect(after.inventory).toEqual(short.inventory)
        expect(after.plots.map((p) => p.state)).toEqual(["ready", "ready"])
        // Exactly fits: everything is harvested.
        const exact = builtNext(
            game({ plots, inventory: { garlic: cap - needed } }),
            "helpfulNeighbor"
        )
        expect(step(exact, crops).inventory.garlic).toBe(cap)
    })

    it("Birds seed empty, unshielded plots, two draws each", () => {
        const s = builtNext(
            game({
                plots: [empty, empty, ready, empty, empty],
                upgrades: [own("greenhouse", "epic", 4)]
            }),
            "birds"
        )
        const next = step(s, crops)
        const seeded = next.plots.flatMap((p, i) => (p.state === "growing" ? [i] : []))
        expect(seeded).toHaveLength(3)
        expect(seeded).not.toContain(4)
        expect(next.plots[2]).toEqual(ready)
        expect(next.rng.events).toBe(advance(s.rng.events, 6))
    })

    it("Birds seed fewer plots with Bird net, and never more than are free", () => {
        const net = [own("birdNet", "legendary"), own("birdNet", "legendary")] // 34%: 1 plot
        const s = builtNext(game({ plots: [empty, empty, empty, empty], upgrades: net }), "birds")
        expect(step(s, crops).plots.filter((p) => p.state === "growing")).toHaveLength(1)
        const one = builtNext(game({ plots: [empty, ready, ready, ready] }), "birds")
        const after = step(one, crops)
        expect(after.plots[0].state).toBe("growing")
        expect(after.rng.events).toBe(advance(one.rng.events, 2))
    })

    it("Emergency order adds an order past the limit, with a shorter timer", () => {
        let s = step(game(), crops)
        const open = s.orders.length
        s = builtNext(s, "emergencyOrder")
        const next = step(s, crops)
        expect(next.orders).toHaveLength(open + 1)
        const extra = next.orders[next.orders.length - 1]
        const full = orderRules(next).orderTicks
        expect(extra.id).toBe(s.nextOrderId)
        expect(extra.timeLimit).toBe(scalePct(full, 50))
        expect(next.rng.orders).toBe(s.rng.orders)

        const calm = builtNext(
            { ...step(game(), crops), upgrades: [own("calmNerves", "legendary")] },
            "emergencyOrder"
        )
        const longer = step(calm, crops)
        expect(longer.orders[longer.orders.length - 1].timeLimit).toBe(scalePct(full, 75))
    })

    it("Emergency order adds nothing, and draws nothing, while a Giant order is open", () => {
        const s = step(game(), crops)
        const giant = { ...s.orders[0], giant: { orders: s.orders.length, coinsPct: 150 } }
        const held = builtNext({ ...s, orders: [giant] }, "emergencyOrder")
        const next = step(held, crops)
        expect(next.orders).toEqual([giant])
        expect(next.nextOrderId).toBe(held.nextOrderId)
    })

    it("Rot removes a share of each stored crop, rounding down; Root cellar saves some", () => {
        expect(rotStorage({ garlic: 10, pumpkin: 3, carrot: 1 }, 30)).toEqual({
            garlic: 7,
            pumpkin: 3,
            carrot: 1
        })
        expect(rotStorage({ garlic: 2 }, 100)).toEqual({})
        const s = builtNext(game({ inventory: { garlic: 10 } }), "rot")
        expect(step(s, crops).inventory).toEqual({ garlic: 7 })
        const cellar = builtNext(
            game({ inventory: { garlic: 10 }, upgrades: [own("rootCellar", "legendary")] }),
            "rot"
        )
        expect(step(cellar, crops).inventory).toEqual({ garlic: 9 })
    })

    it("Fog works for its length, shortened by Lantern", () => {
        const length = EVENTS.events.fog.durationTicks!
        const s = step(builtNext(game(), "fog"), crops)
        expect(s.activeEffects.map((a) => a.effect.kind)).toEqual(["fog"])
        expect(s.activeEffects[0].endsAt - s.tick).toBe(length)
        const lit = step(builtNext(game({ upgrades: [own("lantern", "legendary")] }), "fog"), crops)
        expect(lit.activeEffects[0].endsAt - lit.tick).toBe(scalePct(length, 50))
    })
})

describe("news, Lucky clover and Scarecrow (Day 10)", () => {
    describe("validateEvents", () => {
        type Raw = { events: Record<string, unknown>[] }
        const withChange = (change: (r: Raw) => void): Raw => {
            const raw = rawConfig() as Raw
            change(raw)
            return raw
        }

        it("reads news and scaredOff, and leaves them null and false when missing", () => {
            const read = validateEvents(
                withChange((r) => {
                    r.events[1].news = { seconds: 4, headline: "Cold tonight" }
                    r.events[2].scaredOff = true
                })
            )
            expect(read.events.frost.news).toEqual({
                leadTicks: 4 * TICKS_PER_SECOND,
                headline: "Cold tonight"
            })
            expect(read.events.moles.scaredOff).toBe(true)
            expect(config.events.rain.news).toBeNull()
            expect(config.events.rain.scaredOff).toBe(false)
        })

        it("accepts luckyClover and scarecrow effects", () => {
            const read = validateEvents(
                withChange((r) => {
                    r.events[0].effect = { kind: "luckyClover", plots: 2 }
                    delete r.events[0].amountStat
                })
            )
            expect(read.events.rain.effect).toEqual({ kind: "luckyClover", plots: 2 })
            const crow = validateEvents(
                withChange((r) => {
                    r.events[0].effect = { kind: "scarecrow", seconds: 30 }
                    delete r.events[0].amountStat
                })
            )
            expect(crow.events.rain.effect).toEqual({ kind: "scarecrow", seconds: 30 })
        })

        const bad: [string, (r: Raw) => void][] = [
            ["news with 0 seconds", (r) => (r.events[1].news = { seconds: 0, headline: "x" })],
            [
                "news with an empty headline",
                (r) => (r.events[1].news = { seconds: 2, headline: "" })
            ],
            ["news that isn't an object", (r) => (r.events[1].news = "soon")],
            ["scaredOff that isn't a boolean", (r) => (r.events[1].scaredOff = 1)],
            ["scaredOff on a good event", (r) => (r.events[0].scaredOff = true)],
            [
                "Lucky clover with 0 plots",
                (r) => (r.events[0].effect = { kind: "luckyClover", plots: 0 })
            ],
            [
                "Scarecrow with 0 seconds",
                (r) => (r.events[0].effect = { kind: "scarecrow", seconds: 0 })
            ]
        ]
        for (const [name, change] of bad) {
            it(`throws for ${name}`, () => {
                expect(() => validateEvents(withChange(change))).toThrow()
            })
        }

        it("ships news on the weather, and Crows and Birds scared off", () => {
            for (const id of ["frost", "fog", "rainShower", "sunnySpell"]) {
                expect(EVENTS.events[id].news).not.toBeNull()
            }
            expect(EVENTS.events.moles.news).toBeNull()
            const scared = Object.values(EVENTS.events).filter((d) => d.scaredOff)
            expect(scared.map((d) => d.id).sort()).toEqual(["birds", "crows"])
        })
    })

    describe("news", () => {
        it("announces an event with news its lead before the warning", () => {
            const def = EVENTS.events.frost
            const s = game({ tick: 100 })
            const event = buildEvent(s, def, null)
            expect(event.announcedAt).toBe(100)
            expect(event.warnAt).toBe(100 + def.news!.leadTicks)
            expect(event.startsAt).toBe(event.warnAt + def.warnTicks)
        })

        it("gives an event without news warnAt = announcedAt", () => {
            const event = buildEvent(game({ tick: 100 }), EVENTS.events.moles, 0)
            expect(event.warnAt).toBe(100)
        })

        it("Early warning moves the start later and keeps warnAt, so both come sooner", () => {
            const def = EVENTS.events.frost
            const plain = buildEvent(game({ tick: 100 }), def, null)
            const early = buildEvent(
                game({ tick: 100, upgrades: [own("earlyWarning", "rare")] }),
                def,
                null
            )
            expect(early.warnAt).toBe(plain.warnAt)
            expect(early.startsAt - plain.startsAt).toBe(
                modifiersFor([own("earlyWarning", "rare")]).warnBonusSeconds * TICKS_PER_SECOND
            )
        })

        it("still draws two numbers per announcement", () => {
            const s = game({ tick: 100 })
            const [event, rng] = announceEvent(s, EVENTS, "bad")
            expect(event).not.toBeNull()
            // A forced kind draws one number, plus one for a plot event.
            const draws = EVENTS.events[event!.id].target === "plot" ? 2 : 1
            expect(rng).toBe(advance(s.rng.events, draws))
        })
    })

    describe("Lucky clover", () => {
        const field = [growing(500), ready, empty, growing(500)]

        it("marks one crop plot from rng.events, never an empty or marked one", () => {
            const s = startsNext(game({ plots: field }), "luckyClover", { amount: 1 })
            const next = step(s, crops)
            expect(next.cloverPlots).toHaveLength(1)
            expect([0, 1, 3]).toContain(next.cloverPlots[0])
            expect(next.rng.events).toBe(advance(s.rng.events, 1))

            const marked = startsNext(game({ plots: field, cloverPlots: [0, 1] }), "luckyClover", {
                amount: 1
            })
            expect(step(marked, crops).cloverPlots).toEqual([0, 1, 3])
        })

        it("marks more plots with Four-leaf", () => {
            const fourLeaf = [own("fourLeaf", "rare"), own("fourLeaf", "rare")]
            const s = game({ plots: field, upgrades: fourLeaf })
            const event = buildEvent(s, EVENTS.events.luckyClover, null)
            expect(event.amount).toBe(3)
            const next = step(startsNext(s, "luckyClover", { amount: event.amount }), crops)
            expect(next.cloverPlots).toEqual([0, 1, 3])
        })

        it("does nothing and draws nothing with no crop on the field", () => {
            const s = startsNext(game({ plots: [empty, empty] }), "luckyClover", { amount: 1 })
            const next = step(s, crops)
            expect(next.cloverPlots).toEqual([])
            expect(next.rng.events).toBe(s.rng.events)
        })

        it("doubles the next harvest of a marked plot and clears only its mark", () => {
            const s = game({ plots: [ready, ready], cloverPlots: [0, 1], nextEventAt: 1e9 })
            const next = applyAction(s, { type: "harvest", plot: 0 }, crops)!
            expect(next.inventory).toEqual({ garlic: 4 })
            expect(next.cloverPlots).toEqual([1])
            const again = applyAction(
                { ...next, plots: [ready, ready] },
                { type: "harvest", plot: 0 },
                crops
            )!
            expect(again.inventory).toEqual({ garlic: 6 })
        })

        it("keeps the mark when full storage refuses the harvest", () => {
            const s = game({ plots: [ready], cloverPlots: [0] })
            const full = { ...s, inventory: { garlic: storageCap(s) } }
            expect(applyAction(full, { type: "harvest", plot: 0 }, crops)).toBeNull()
        })

        it("Helpful neighbor's harvest doubles a marked plot and clears its mark", () => {
            const s = startsNext(
                game({ plots: [ready, ready, growing(500)], cloverPlots: [0, 2] }),
                "helpfulNeighbor"
            )
            const next = step(s, crops)
            expect(next.inventory).toEqual({ garlic: 6 })
            expect(next.cloverPlots).toEqual([2])
        })
    })

    describe("Scarecrow", () => {
        const SECONDS = 60

        it("guards for its seconds, and a second one never shortens the guard", () => {
            const s = startsNext(game(), "scarecrow", { amount: SECONDS })
            const next = step(s, crops)
            expect(next.scarecrowUntil).toBe(next.tick + SECONDS * TICKS_PER_SECOND)
            const longer = { ...next, scarecrowUntil: next.tick + 10_000 }
            const again = step(startsNext(longer, "scarecrow", { amount: SECONDS }), crops)
            expect(again.scarecrowUntil).toBe(longer.scarecrowUntil)
        })

        it("keeps Crows and Birds away while it guards, and lets other bad events come", () => {
            const field = { plots: [growing(500), ready, empty, empty] }
            const guarded = game({ ...field, tick: 100, scarecrowUntil: 101 })
            const bad = eligibleEvents(guarded, "bad")
            expect(bad).not.toContain("crows")
            expect(bad).not.toContain("birds")
            expect(bad).toContain("frost")
            const after = game({ ...field, tick: 101, scarecrowUntil: 101 })
            expect(eligibleEvents(after, "bad")).toContain("crows")
            expect(eligibleEvents(after, "bad")).toContain("birds")
        })
    })
})

describe("Drought, digging up seeds and Pest control (Day 11)", () => {
    const water = (plot: number): Action => ({ type: "waterPlot", plot })

    // A field with two growing crops (plot 1 under a Greenhouse), Drought starting on tick 1.
    function droughtGame(upgrades: OwnedUpgrade[] = []): GameState {
        const s = game({
            plots: [growing(500), growing(500), empty, ready],
            upgrades: [own("greenhouse", "epic", 1), ...upgrades]
        })
        return step(builtNext(s, "drought"), crops) // tick 1: the drought starts
    }

    it("validateEvents accepts a drought effect and throws for waterSeconds below 1", () => {
        const raw = rawConfig() as { events: Record<string, unknown>[] }
        raw.events[1].effect = { kind: "drought", waterSeconds: 3 }
        expect(validateEvents(raw).events.frost.effect).toEqual({
            kind: "drought",
            waterSeconds: 3
        })
        raw.events[1].effect = { kind: "drought", waterSeconds: 0 }
        expect(() => validateEvents(raw)).toThrow()
    })

    it("holds every unwatered crop for its length and skips a Greenhouse plot", () => {
        const s = droughtGame()
        const later = stepN(s, 50) // ticks 2 … 51
        expect((later.plots[0] as { readyAt: number }).readyAt).toBe(550)
        expect((later.plots[1] as { readyAt: number }).readyAt).toBe(500)
    })

    it("a watered plot grows as usual for waterSeconds, then stops again", () => {
        const s = droughtGame()
        const tap = EVENTS.events.drought.effect as { waterSeconds: number }
        const ticks = tap.waterSeconds * TICKS_PER_SECOND
        const watered = applyAction(s, water(0), crops)!
        expect(watered.rng).toBe(s.rng)
        const later = stepN(watered, 50)
        expect((later.plots[0] as { readyAt: number }).readyAt).toBe(550 - ticks)
    })

    it("watering again adds time, and Irrigation makes a tap last longer", () => {
        const s = droughtGame()
        const once = stepN(applyAction(s, water(0), crops)!, 80)
        const twice = stepN(applyAction(applyAction(s, water(0), crops)!, water(0), crops)!, 80)
        const plain = (once.plots[0] as { readyAt: number }).readyAt
        const tap = (EVENTS.events.drought.effect as { waterSeconds: number }).waterSeconds
        expect((twice.plots[0] as { readyAt: number }).readyAt).toBe(plain - tap * TICKS_PER_SECOND)

        const irrigated = droughtGame([own("irrigation", "legendary")])
        const longer = stepN(applyAction(irrigated, water(0), crops)!, 80)
        expect((longer.plots[0] as { readyAt: number }).readyAt).toBe(plain - 3 * TICKS_PER_SECOND)
    })

    it("refuses watering with no drought, on a Greenhouse plot, and on empty or ready plots", () => {
        const s = droughtGame()
        expect(applyAction(s, water(1), crops)).toBeNull()
        expect(applyAction(s, water(2), crops)).toBeNull()
        expect(applyAction(s, water(3), crops)).toBeNull()
        expect(applyAction(s, water(9), crops)).toBeNull()
        expect(applyAction(game({ plots: [growing(500)] }), water(0), crops)).toBeNull()
        const offer = { ...s, upgradeOffer: [{ id: "fastGrowth", tier: "common" as Tier }] }
        expect(applyAction(offer, water(0), crops)).toBeNull()
    })

    it("Birds mark the plots they seed, and digUp empties only a seeded growing plot", () => {
        const s = builtNext(game({ plots: [empty, empty, empty, growing(500)] }), "birds")
        const seeded = step(s, crops)
        const marked = seeded.plots.flatMap((p, i) =>
            p.state === "growing" && p.seeded === true ? [i] : []
        )
        expect(marked.length).toBeGreaterThan(0)
        expect(marked).not.toContain(3)
        const dug = applyAction(seeded, { type: "digUp", plot: marked[0] }, crops)!
        expect(dug.plots[marked[0]]).toEqual({ state: "empty" })
        expect(dug.rng).toBe(seeded.rng)
        expect(applyAction(seeded, { type: "digUp", plot: 3 }, crops)).toBeNull()
        expect(applyAction(dug, { type: "digUp", plot: marked[0] }, crops)).toBeNull()
        const grown = { ...seeded, tick: 100_000 }
        const ripe = step(grown, crops)
        expect(ripe.plots[marked[0]]).toEqual({
            state: "ready",
            cropId: (seeded.plots[marked[0]] as { cropId: string }).cropId
        })
    })

    it("Pest control keeps Drought, Birds and Crows from ever being eligible", () => {
        const banned = game({ upgrades: [own("pestControl", "epic")] })
        const bad = eligibleEvents(banned, "bad")
        for (const id of ["drought", "birds", "crows"]) expect(bad).not.toContain(id)
        expect(bad).toContain("frost")
    })

    it("Crow decoy shortens Crows", () => {
        const field = { plots: [ready, ready, empty, empty] }
        const plain = builtNext(game(field), "crows").event!
        const decoy = builtNext(
            game({ ...field, upgrades: [own("crowDecoy", "legendary")] }),
            "crows"
        ).event!
        const full = EVENTS.events.crows.durationTicks!
        expect(plain.endsAt - plain.startsAt).toBe(full)
        expect(decoy.endsAt - decoy.startsAt).toBe(
            scalePct(full, modifiersFor([own("crowDecoy", "legendary")]).crowDurationPct)
        )
        expect(decoy.endsAt - decoy.startsAt).toBeLessThan(full)
    })
})
