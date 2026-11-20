import { describe, it, expect } from "vitest"
import { replay } from "./verification"
import { createGame, applyAction, step } from "./main"
import { buildCropTable } from "./plot"
import { canFulfill } from "./orders"
import { TIMED_MODE_TICKS } from "./game_constants"
import type { Action, Crop, CropTable, GameConfig, GameState, LogEntry } from "./types"

const cropList: Crop[] = [
    { id: "garlic", growTicks: 80, yield: 2, value: 2 },
    { id: "carrot", growTicks: 150, yield: 2, value: 8 },
    { id: "pumpkin", growTicks: 250, yield: 5, value: 12 }
]
const crops: CropTable = buildCropTable(cropList)

const survival: GameConfig = { mode: "survival", allowPowerUps: false }
const timed: GameConfig = { mode: "timed", allowPowerUps: false }

// Picks this tick's moves: take the first upgrade on an open offer, harvest every ready
// plot, deliver every order it can, then plant every empty plot with the crop the first
// open order wants.
function botMoves(state: GameState): Action[] {
    const moves: Action[] = []
    if (state.upgradeOffer !== null) {
        moves.push({ type: "chooseUpgrade", upgradeId: state.upgradeOffer[0] })
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

// Like botMoves, but first buys a life whenever it can afford one.
function buyer(state: GameState): Action[] {
    return [{ type: "buyLife" }, ...botMoves(state)]
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
        for (const action of movesFor(state)) {
            if (action.type === "deliver") {
                const order = state.orders.find((o) => o.id === action.orderId)
                if (!order || !canFulfill(order, state.inventory)) continue
            }
            const next = applyAction(state, action, crops)
            if (next === null) continue
            log.push({ tick: state.tick, action })
            state = next
        }
        if (state.tick >= finalTick || state.status === "ended") break
        const next = step(state, crops)
        if (next === state) break // an unanswered upgrade offer stopped the clock
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

    it("replays a full Timed run that ends", () => {
        const { state, log } = play(7, timed, TIMED_MODE_TICKS)
        expect(state.status).toBe("ended")
        expect(state.tick).toBe(TIMED_MODE_TICKS)
        expect(replayState(7, timed, log, TIMED_MODE_TICKS, crops)).toEqual(state)
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
        const last: LogEntry[] = [{ tick: TIMED_MODE_TICKS - 1, action: plant }]
        expect(replay(1, timed, last, TIMED_MODE_TICKS, crops).ok).toBe(true)

        const onEnd: LogEntry[] = [{ tick: TIMED_MODE_TICKS, action: plant }]
        expect(replay(1, timed, onEnd, TIMED_MODE_TICKS, crops)).toEqual({
            ok: false,
            error: "after-end",
            entry: 0
        })

        const afterEnd: LogEntry[] = [{ tick: TIMED_MODE_TICKS + 5, action: plant }]
        expect(replay(1, timed, afterEnd, TIMED_MODE_TICKS + 10, crops)).toEqual({
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
        expect(replay(1, timed, [], TIMED_MODE_TICKS + 1, crops)).toEqual({
            ok: false,
            error: "bad-final-tick",
            entry: null
        })
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
        const pick: LogEntry = {
            tick: state.tick,
            action: { type: "chooseUpgrade", upgradeId: state.upgradeOffer![0] }
        }
        const result = replayState(1, survival, [...log, pick], state.tick + 50, crops)
        expect(result.upgrades).toEqual([state.upgradeOffer![0]])
        expect(result.tick).toBe(state.tick + 50)
    })
})
