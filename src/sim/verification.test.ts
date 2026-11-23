import { describe, it, expect } from "vitest"
import { replay } from "./verification"
import { createGame, applyAction, step, canReroll } from "./main"
import { storageFree, storageUsed, storageCap } from "./economy"
import { buildCropTable } from "./plot"
import { canFulfill } from "./orders"
import { UPGRADES, validTargets } from "./upgrades"
import { powerUpTargets } from "./powerups"
import { EVENTS } from "./events"
import { MODES } from "./modes"
import type { Action, Crop, CropTable, GameConfig, GameState, LogEntry } from "./types"

const cropList: Crop[] = [
    { id: "garlic", growTicks: 80, yield: 2, value: 2, fertilizerCost: 4 },
    { id: "carrot", growTicks: 150, yield: 2, value: 8, fertilizerCost: 2 },
    { id: "pumpkin", growTicks: 250, yield: 5, value: 12, fertilizerCost: 1 }
]
const crops: CropTable = buildCropTable(cropList)

const survival: GameConfig = { mode: "survival", allowPowerUps: false, allowEvents: false }
const timed: GameConfig = { mode: "timed", allowPowerUps: false, allowEvents: false }

// The pick for an open offer: the card at `index` (or the first), with its first valid target.
function pickCard(state: GameState, index = 0): Action {
    const offer = state.upgradeOffer!
    const card = offer[Math.min(index, offer.length - 1)]
    if (UPGRADES.upgrades[card.id].target === null) {
        return { type: "chooseUpgrade", upgradeId: card.id }
    }
    const [target] = validTargets(state.upgrades, card.id, state.plots.length, crops)
    return { type: "chooseUpgrade", upgradeId: card.id, target: target! }
}

// Picks this tick's moves: take the first card on an open offer, harvest every ready
// plot, deliver every order it can, then plant every empty plot with the crop the first
// open order wants.
function botMoves(state: GameState): Action[] {
    const moves: Action[] = []
    if (state.upgradeOffer !== null) {
        moves.push(pickCard(state))
    }
    state.plots.forEach((p, plot) => {
        if (p.state === "ready") moves.push({ type: "harvest", plot })
    })
    moves.push(...state.orders.map((o): Action => ({ type: "deliver", orderId: o.id })))
    const wanted = state.orders.length > 0 ? Object.keys(state.orders[0].required)[0] : "garlic"
    state.plots.forEach((p, plot) => {
        if (p.state === "empty") moves.push({ type: "plant", plot, cropId: wanted })
    })
    return moves
}

// A weaker player: like botMoves, but only ever plants garlic.
function garlicOnly(state: GameState): Action[] {
    return botMoves(state).map((a): Action => (a.type === "plant" ? { ...a, cropId: "garlic" } : a))
}

// Like botMoves, but always picks a targeted card when one is on the offer.
function targetPicker(state: GameState): Action[] {
    if (state.upgradeOffer === null) return botMoves(state)
    const i = state.upgradeOffer.findIndex((c) => UPGRADES.upgrades[c.id].target !== null)
    return [pickCard(state, Math.max(0, i)), ...botMoves(state).slice(1)]
}

// Like botMoves, but first buys a life whenever it can afford one.
function buyer(state: GameState): Action[] {
    return [{ type: "buyLife" }, ...botMoves(state)]
}

// Uses the in-run economy: rerolls each offer up to twice before picking; when storage is full,
// sells half of its biggest pile and makes fertilizer from the others; uses fertilizer on every
// growing plot; and plants pumpkins on plots 0 and 1 so storage fills up.
function economist(state: GameState): Action[] {
    if (state.upgradeOffer !== null) {
        if (state.rerollsThisOffer < 2 && canReroll(state)) return [{ type: "rerollOffer" }]
        return [pickCard(state)]
    }
    const moves: Action[] = []
    if (storageFree(state) === 0) {
        // Full: sell half of the biggest pile and turn the next one into fertilizer.
        const piles = Object.entries(state.inventory).sort((x, y) => y[1] - x[1])
        moves.push({ type: "sellCrop", cropId: piles[0][0], amount: Math.ceil(piles[0][1] / 2) })
        for (const [cropId] of piles.slice(1)) moves.push({ type: "makeFertilizer", cropId })
    }
    state.plots.forEach((p, plot) => {
        if (p.state === "growing") moves.push({ type: "useFertilizer", plot })
    })
    return [
        ...moves,
        ...botMoves(state).map((a): Action =>
            a.type === "plant" && a.plot < 2 ? { ...a, cropId: "pumpkin" } : a
        )
    ]
}

// Plays a run the way the client game loop does (see specs/verification.md)
// and returns the final state with the log of accepted actions.
function play(
    seed: number,
    config: GameConfig,
    finalTick: number,
    movesFor: (state: GameState) => Action[] = botMoves
): { state: GameState; log: LogEntry[] } {
    let state = createGame(seed, config)
    const log: LogEntry[] = []
    while (true) {
        // Moves are planned once per tick, so a harvest and a deliver can both
        // be tried on the same tick; only the ones that work are logged.
        let accepted = false
        for (const action of movesFor(state)) {
            if (action.type === "deliver") {
                const order = state.orders.find((o) => o.id === action.orderId)
                if (!order || !canFulfill(order, state.inventory)) continue
            }
            const next = applyAction(state, action, crops)
            if (next === null) continue
            log.push({ tick: state.tick, action })
            state = next
            accepted = true
        }
        if (state.tick >= finalTick || state.status === "ended") break
        const next = step(state, crops)
        if (next === state) {
            // An open offer stopped the clock: plan again after a reroll, else give up.
            if (accepted) continue
            break
        }
        state = next
    }
    return { state, log }
}

// Plays like botMoves but never answers an upgrade offer; stops on the tick one opens.
function playUntilOffer(seed: number): { state: GameState; log: LogEntry[] } {
    const { state, log } = play(seed, survival, 20_000, (s) =>
        s.upgradeOffer !== null ? [] : botMoves(s)
    )
    if (state.upgradeOffer === null) throw new Error("no upgrade offer was reached")
    return { state, log }
}

function stepTo(state: GameState, tick: number): GameState {
    while (state.tick < tick) state = step(state, crops)
    return state
}

// Unwraps a successful replay.
function replayState(...args: Parameters<typeof replay>): GameState {
    const result = replay(...args)
    if (!result.ok) throw new Error(`replay failed: ${result.error} at entry ${result.entry}`)
    return result.state
}

describe("replay: the in-run economy", () => {
    it.each([1, 2, 3, 42])(
        "replays a Survival run with sells, fertilizer and rerolls equal (seed %i)",
        (seed) => {
            const { state, log } = play(seed, survival, 6000, economist)
            const types = new Set(log.map((e) => e.action.type))
            for (const t of ["sellCrop", "makeFertilizer", "useFertilizer", "rerollOffer"]) {
                expect(types).toContain(t)
            }
            expect(replayState(seed, survival, log, state.tick, crops)).toEqual(state)
        }
    )

    it("storage fills and empties, and never passes the cap", () => {
        let state = createGame(7, survival)
        let wasFull = false
        let emptiedAfterFull = false
        for (let tick = 0; tick < 6000 && state.status === "running"; tick++) {
            for (const action of economist(state)) {
                const next = applyAction(state, action, crops)
                if (next !== null) state = next
            }
            expect(storageUsed(state)).toBeLessThanOrEqual(storageCap(state))
            if (storageFree(state) === 0) wasFull = true
            else if (wasFull && storageUsed(state) < storageCap(state) / 2) emptiedAfterFull = true
            if (state.upgradeOffer === null) state = step(state, crops)
        }
        expect(wasFull).toBe(true)
        expect(emptiedAfterFull).toBe(true)
    })
})

describe("replay: matches the original run", () => {
    it("gives the same state as stepping when the log is empty", () => {
        const expected = stepTo(createGame(1, survival), 300)
        expect(replayState(1, survival, [], 300, crops)).toEqual(expected)
    })

    it("gives the fresh state for an empty log and finalTick 0", () => {
        expect(replayState(1, survival, [], 0, crops)).toEqual(createGame(1, survival))
    })

    it.each([1, 2, 3, 42, 1234])("replays a scripted Survival run equal (seed %i)", (seed) => {
        const { state, log } = play(seed, survival, 2000)
        expect(log.length).toBeGreaterThan(0)
        expect(state.ordersCompleted).toBeGreaterThan(0)
        expect(replayState(seed, survival, log, state.tick, crops)).toEqual(state)
    })

    it.each([1, 2, 3])("replays a run with failed orders equal (seed %i)", (seed) => {
        // Only planting garlic lets every other order expire.
        const { state, log } = play(seed, survival, 2000, garlicOnly)
        expect(state.ordersFailed).toBeGreaterThan(0)
        expect(replayState(seed, survival, log, state.tick, crops)).toEqual(state)
    })

    it("replays a full Timed run that ends, with combos and rush waves", () => {
        const { state, log } = play(7, timed, MODES.timed.runTicks)
        // Every wave drew from rng.rush, so it has moved off its starting state.
        expect(state.rng.rush).not.toBe(createGame(7, timed).rng.rush)
        expect(state.status).toBe("ended")
        expect(state.bestCombo).toBeGreaterThan(1)
        expect(state.tick).toBe(MODES.timed.runTicks)
        expect(replayState(7, timed, log, MODES.timed.runTicks, crops)).toEqual(state)
    })

    it.each([1, 2, 3])(
        "replays a full Survival run that runs out of lives, with lives bought (seed %i)",
        (seed) => {
            const { state, log } = play(seed, survival, 100_000, buyer)
            expect(state.status).toBe("ended")
            expect(state.lives).toBe(0)
            expect(log.some((e) => e.action.type === "buyLife")).toBe(true)
            expect(log.some((e) => e.action.type === "chooseUpgrade")).toBe(true)
            expect(state.upgrades.length).toBeGreaterThan(0)
            expect(replayState(seed, survival, log, state.tick, crops)).toEqual(state)
        }
    )

    it("replays actions on tick 0 and several actions on one tick", () => {
        const log: LogEntry[] = [
            { tick: 0, action: { type: "plant", plot: 0, cropId: "garlic" } },
            { tick: 0, action: { type: "plant", plot: 1, cropId: "carrot" } },
            { tick: 80, action: { type: "harvest", plot: 0 } },
            { tick: 80, action: { type: "plant", plot: 0, cropId: "pumpkin" } }
        ]
        const state = replayState(1, survival, log, 100, crops)
        expect(state.tick).toBe(100)
        expect(state.inventory).toEqual({ garlic: 2 })
        expect(state.plots[0]).toEqual({
            state: "growing",
            cropId: "pumpkin",
            plantedAt: 80,
            readyAt: 330
        })
        expect(state.plots[1]).toEqual({
            state: "growing",
            cropId: "carrot",
            plantedAt: 0,
            readyAt: 150
        })
    })

    it("is deterministic and never changes the log", () => {
        const { state, log } = play(5, survival, 800)
        const before = structuredClone(log)
        const a = replay(5, survival, log, state.tick, crops)
        const b = replay(5, survival, log, state.tick, crops)
        expect(a).toEqual(b)
        expect(log).toEqual(before)
    })
})

describe("replay: rejects bad logs", () => {
    it("rejects an action that can't be applied, naming the entry", () => {
        const log: LogEntry[] = [
            { tick: 0, action: { type: "plant", plot: 0, cropId: "garlic" } },
            { tick: 5, action: { type: "harvest", plot: 1 } }
        ]
        expect(replay(1, survival, log, 10, crops)).toEqual({
            ok: false,
            error: "refused",
            entry: 1
        })
    })

    it("rejects an action logged on the wrong tick", () => {
        // Garlic is ready on tick 80, so harvesting on 79 is refused.
        const ok: LogEntry[] = [
            { tick: 0, action: { type: "plant", plot: 0, cropId: "garlic" } },
            { tick: 80, action: { type: "harvest", plot: 0 } }
        ]
        expect(replay(1, survival, ok, 80, crops).ok).toBe(true)

        const early: LogEntry[] = [ok[0], { ...ok[1], tick: 79 }]
        expect(replay(1, survival, early, 80, crops)).toEqual({
            ok: false,
            error: "refused",
            entry: 1
        })
    })

    it("rejects an unknown action type", () => {
        const log = [{ tick: 0, action: { type: "fly" } }] as unknown as LogEntry[]
        expect(replay(1, survival, log, 10, crops)).toEqual({
            ok: false,
            error: "refused",
            entry: 0
        })
    })

    it("rejects entries out of tick order", () => {
        const log: LogEntry[] = [
            { tick: 5, action: { type: "plant", plot: 0, cropId: "garlic" } },
            { tick: 4, action: { type: "plant", plot: 1, cropId: "garlic" } }
        ]
        expect(replay(1, survival, log, 10, crops)).toEqual({
            ok: false,
            error: "out-of-order",
            entry: 1
        })
    })

    it.each([-1, 2.5, 11, NaN])("rejects an entry on tick %s", (tick) => {
        const log: LogEntry[] = [{ tick, action: { type: "plant", plot: 0, cropId: "garlic" } }]
        expect(replay(1, survival, log, 10, crops)).toEqual({
            ok: false,
            error: "bad-tick",
            entry: 0
        })
    })

    it("rejects an action on or after the tick a Timed run ends", () => {
        const plant: Action = { type: "plant", plot: 0, cropId: "garlic" }
        const last: LogEntry[] = [{ tick: MODES.timed.runTicks - 1, action: plant }]
        expect(replay(1, timed, last, MODES.timed.runTicks, crops).ok).toBe(true)

        const onEnd: LogEntry[] = [{ tick: MODES.timed.runTicks, action: plant }]
        expect(replay(1, timed, onEnd, MODES.timed.runTicks, crops)).toEqual({
            ok: false,
            error: "after-end",
            entry: 0
        })

        const afterEnd: LogEntry[] = [{ tick: MODES.timed.runTicks + 5, action: plant }]
        expect(replay(1, timed, afterEnd, MODES.timed.runTicks + 10, crops)).toEqual({
            ok: false,
            error: "after-end",
            entry: 0
        })
    })

    it("rejects an action after a Survival run ran out of lives", () => {
        // Nobody plays, so orders fail until the lives are gone.
        let ended = createGame(1, survival)
        while (ended.status === "running") ended = step(ended, crops)
        const end = ended.tick
        expect(replay(1, survival, [], end, crops).ok).toBe(true)

        const log: LogEntry[] = [
            { tick: end, action: { type: "plant", plot: 0, cropId: "garlic" } }
        ]
        expect(replay(1, survival, log, end, crops)).toEqual({
            ok: false,
            error: "after-end",
            entry: 0
        })
        expect(replay(1, survival, [], end + 1, crops)).toEqual({
            ok: false,
            error: "bad-final-tick",
            entry: null
        })
    })

    it.each([-1, 0.5, NaN])("rejects finalTick %s", (finalTick) => {
        expect(replay(1, survival, [], finalTick, crops)).toEqual({
            ok: false,
            error: "bad-final-tick",
            entry: null
        })
    })

    it("rejects a finalTick after a Timed run ended", () => {
        expect(replay(1, timed, [], MODES.timed.runTicks + 1, crops)).toEqual({
            ok: false,
            error: "bad-final-tick",
            entry: null
        })
    })

    it("replays runs with targeted picks equal", () => {
        let targeted = 0
        for (const seed of [1, 2, 3]) {
            const { state, log } = play(seed, survival, 100_000, targetPicker)
            targeted += log.filter(
                (e) => e.action.type === "chooseUpgrade" && e.action.target !== undefined
            ).length
            expect(replayState(seed, survival, log, state.tick, crops)).toEqual(state)
        }
        expect(targeted).toBeGreaterThan(0)
    })

    it("replays runs with Bumper harvest equal", () => {
        // Always takes Bumper harvest when it is offered.
        const bumperPicker = (state: GameState): Action[] => {
            if (state.upgradeOffer === null) return botMoves(state)
            const i = state.upgradeOffer.findIndex((c) => c.id === "bumperHarvest")
            return [pickCard(state, Math.max(0, i)), ...botMoves(state).slice(1)]
        }
        let withBumper = 0
        for (const seed of [1, 2, 3]) {
            const fresh = createGame(seed, survival)
            const { state, log } = play(seed, survival, 100_000, bumperPicker)
            if (state.upgrades.some((u) => u.id === "bumperHarvest")) {
                withBumper += 1
                expect(state.rng.harvest).not.toBe(fresh.rng.harvest)
            }
            expect(replayState(seed, survival, log, state.tick, crops)).toEqual(state)
        }
        expect(withBumper).toBeGreaterThan(0)
    })

    it("doesn't reproduce a run under a different seed", () => {
        const { state, log } = play(3, survival, 1500)
        const other = replay(4, survival, log, state.tick, crops)
        if (other.ok) expect(other.state).not.toEqual(state)
        else expect(other.error).toBe("refused")
    })
})

describe("replay: upgrade offers", () => {
    it("replays a run that stops while an offer is open", () => {
        const { state, log } = playUntilOffer(1)
        expect(replayState(1, survival, log, state.tick, crops)).toEqual(state)
    })

    it("rejects a finalTick after an unanswered offer", () => {
        const { state, log } = playUntilOffer(1)
        expect(replay(1, survival, log, state.tick + 1, crops)).toEqual({
            ok: false,
            error: "offer-pending",
            entry: null
        })
    })

    it("rejects an entry after an unanswered offer, naming the entry", () => {
        const { state, log } = playUntilOffer(1)
        const late: LogEntry = { tick: state.tick + 1, action: { type: "buyLife" } }
        expect(replay(1, survival, [...log, late], state.tick + 1, crops)).toEqual({
            ok: false,
            error: "offer-pending",
            entry: log.length
        })
    })

    it("replays once the offer is answered on its tick", () => {
        const { state, log } = playUntilOffer(1)
        const pick: LogEntry = { tick: state.tick, action: pickCard(state) }
        const result = replayState(1, survival, [...log, pick], state.tick + 50, crops)
        expect(result.upgrades.map((u) => u.id)).toEqual([state.upgradeOffer![0].id])
        expect(result.tick).toBe(state.tick + 50)
    })
})

describe("replay: power-ups", () => {
    const survivalOn: GameConfig = { mode: "survival", allowPowerUps: true, allowEvents: false }
    const timedOn: GameConfig = { mode: "timed", allowPowerUps: true, allowEvents: false }

    // Uses every held power-up as soon as it can (Ready one on its first valid plot), then
    // plays like botMoves. Slot 0 is tried repeatedly since each use moves the others up.
    function powerUser(state: GameState): Action[] {
        const uses: Action[] = []
        for (let i = 0; i < state.powerUps.length; i++) {
            const [target] = powerUpTargets(state, i)
            uses.push(
                target === undefined
                    ? { type: "usePowerUp", slot: 0 }
                    : { type: "usePowerUp", slot: 0, target }
            )
        }
        return [...uses, ...botMoves(state)]
    }

    it.each([
        ["Survival", survivalOn],
        ["Timed", timedOn]
    ])("replays a %s run that uses power-ups equal", (_, cfg) => {
        for (const seed of [1, 2, 3]) {
            const { state, log } = play(seed, cfg, 2500, powerUser)
            expect(log.some((e) => e.action.type === "usePowerUp")).toBe(true)
            expect(replayState(seed, cfg, log, state.tick, crops)).toEqual(state)
        }
    })

    it("refuses a usePowerUp on an empty slot, and any use with power-ups off", () => {
        const empty = replay(
            1,
            survivalOn,
            [{ tick: 0, action: { type: "usePowerUp", slot: 0 } }],
            0,
            crops
        )
        expect(empty).toEqual({ ok: false, error: "refused", entry: 0 })
        const { state, log } = play(1, survivalOn, 2500, powerUser)
        const firstUse = log.findIndex((e) => e.action.type === "usePowerUp")
        const off = replay(1, survival, log, state.tick, crops)
        expect(off.ok).toBe(false)
        // With power-ups off nothing drops, so the run differs no later than the first use.
        if (!off.ok) expect(off.entry).toBeLessThanOrEqual(firstUse)
    })
})

describe("replay: events", () => {
    const configs: [string, GameConfig][] = [
        ["Survival", { mode: "survival", allowPowerUps: true, allowEvents: true }],
        ["Timed", { mode: "timed", allowPowerUps: true, allowEvents: true }]
    ]

    it.each(configs)("replays a %s run with events and power-ups equal", (_, cfg) => {
        for (const seed of [1, 2, 3]) {
            const { state, log } = play(seed, cfg, 2500)
            // At least one event has been announced: either one is pending or the schedule moved on.
            const ran = state.event !== null || state.nextEventAt > EVENTS.firstEventTicks
            expect(ran).toBe(true)
            expect(replayState(seed, cfg, log, state.tick, crops)).toEqual(state)
        }
    })
})
