import { describe, it, expect } from "vitest"
import type { GameMode, GameState, Order, Plot } from "../sim/types"
import { createGame } from "../sim/main"
import { MODES } from "../sim/modes"
import { TICKS_PER_SECOND } from "../sim/game_constants"
import { cues, orderChanges, lowTimePulse, LOW_TIME_SECONDS } from "./cues"

function game(mode: GameMode = "survival"): GameState {
    return createGame(1, { mode, allowPowerUps: false, allowEvents: false })
}

const ready: Plot = { state: "ready", cropId: "garlic" }
const empty: Plot = { state: "empty" }
const growing: Plot = { state: "growing", cropId: "garlic", plantedAt: 20, readyAt: 100 }

function order(id: number, expiresAt: number): Order {
    return {
        id,
        required: { garlic: 1 },
        value: 10,
        expiresAt,
        timeLimit: 100,
        small: false,
        rush: false,
        tip: 0,
        mixed: false,
        giant: null
    }
}

describe("cues", () => {
    it("gives harvest for a plot that went from ready to empty", () => {
        const prev = { ...game(), plots: [ready, ready] }
        const next = { ...prev, plots: [empty, ready] }
        expect(cues(prev, next)).toEqual([{ kind: "harvest", plot: 0 }])
    })

    it("gives no harvest for a ready plot that started over (Moles)", () => {
        const prev = { ...game(), plots: [ready] }
        expect(cues(prev, { ...prev, plots: [growing] })).toEqual([])
    })

    it("gives score with the one filled order's id", () => {
        const prev = { ...game(), tick: 50, score: 0, orders: [order(1, 100), order(2, 100)] }
        const next = { ...prev, score: 30, orders: [order(2, 100)] }
        expect(cues(prev, next)).toEqual([{ kind: "score", points: 30, orderId: 1 }])
    })

    it("gives score with no order when several were filled", () => {
        const prev = { ...game(), tick: 50, score: 0, orders: [order(1, 100), order(2, 100)] }
        const next = { ...prev, score: 60, orders: [] }
        expect(cues(prev, next)).toEqual([{ kind: "score", points: 60, orderId: null }])
    })

    it("gives lifeLost when Survival loses a life", () => {
        const prev = game("survival")
        expect(cues(prev, { ...prev, lives: prev.lives - 1 })).toEqual([{ kind: "lifeLost" }])
    })

    it("gives nothing for two equal states", () => {
        const state = game()
        expect(cues(state, state)).toEqual([])
    })
})

describe("orderChanges", () => {
    it("lists a new order as added", () => {
        expect(orderChanges([order(1, 100)], [order(1, 100), order(2, 200)], 10).added).toEqual([2])
    })

    it("marks an order that left before expiresAt as not failed", () => {
        expect(orderChanges([order(1, 100)], [], 100).removed).toEqual([{ id: 1, failed: false }])
    })

    it("marks an order that left after expiresAt as failed", () => {
        expect(orderChanges([order(1, 100)], [], 101).removed).toEqual([{ id: 1, failed: true }])
    })
})

describe("lowTimePulse", () => {
    const end = MODES.timed.runTicks
    const low = LOW_TIME_SECONDS * TICKS_PER_SECOND

    it("is null in Survival", () => {
        expect(lowTimePulse({ ...game("survival"), tick: 100000 })).toBeNull()
    })

    it("is null before the last 10 seconds", () => {
        expect(lowTimePulse({ ...game("timed"), tick: end - low - 1 })).toBeNull()
    })

    it("is 1 when a second starts and falls through the second", () => {
        const timed = game("timed")
        expect(lowTimePulse({ ...timed, tick: end - low })).toBe(1)
        expect(lowTimePulse({ ...timed, tick: end - low + 1 })).toBeCloseTo(0.9)
        expect(lowTimePulse({ ...timed, tick: end - low + TICKS_PER_SECOND })).toBe(1)
    })

    it("is null once the run has ended", () => {
        expect(lowTimePulse({ ...game("timed"), tick: end, status: "ended" })).toBeNull()
    })
})
