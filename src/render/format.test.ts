import { describe, it, expect } from "vitest"
import {
    formatClock,
    timerText,
    plotText,
    orderText,
    statRows,
    cropButtonText,
    orderTimeFraction,
    isOrderUrgent,
    parseSeed,
    debugText,
    MAX_SEED
} from "./format"
import { createGame } from "../sim/main"
import { buildCropTable } from "../sim/plot"
import { TIMED_MODE_TICKS, ORDER_TICKS } from "../sim/game_constants"
import type { GameState, Order } from "../sim/types"

const crops = buildCropTable([
    { id: "garlic", growTicks: 80, yield: 2, value: 2 },
    { id: "carrot", growTicks: 150, yield: 2, value: 8 }
])

function game(mode: GameState["mode"]): GameState {
    return createGame(1, { mode, allowPowerUps: false })
}

describe("formatClock", () => {
    it("shows minutes and padded seconds", () => {
        expect(formatClock(0)).toBe("0:00")
        expect(formatClock(50)).toBe("0:05")
        expect(formatClock(3000)).toBe("5:00")
    })

    it("rounds partial seconds up and never goes negative", () => {
        expect(formatClock(1)).toBe("0:01")
        expect(formatClock(-10)).toBe("0:00")
    })
})

describe("timerText", () => {
    it("counts down in timed mode", () => {
        expect(timerText(game("timed"))).toBe(formatClock(TIMED_MODE_TICKS))
        expect(timerText({ ...game("timed"), tick: TIMED_MODE_TICKS })).toBe("0:00")
    })

    it("counts up in survival mode", () => {
        expect(timerText({ ...game("survival"), tick: 610 })).toBe("1:01")
    })
})

describe("plotText", () => {
    it("labels each plot state", () => {
        expect(plotText({ state: "empty" }, 0, crops)).toBe("empty")
        expect(plotText({ state: "growing", cropId: "garlic", plantedAt: 0 }, 40, crops)).toBe(
            "garlic\n50%"
        )
        expect(plotText({ state: "ready", cropId: "carrot" }, 0, crops)).toBe("carrot\nREADY")
    })
})

describe("orderText", () => {
    it("shows crops needed, amount held, value and time left", () => {
        const order: Order = { id: 3, required: { garlic: 4 }, value: 8, expiresAt: 600 }
        const state = { ...game("timed"), tick: 100, inventory: { garlic: 2 } }
        expect(orderText(order, state)).toBe("Order #3\ngarlic x4  (have 2)\nvalue 8   0:50")
    })
})

describe("statRows", () => {
    it("lists timer, score, order counts and every crop sorted", () => {
        const state = { ...game("timed"), score: 12, ordersCompleted: 2, ordersFailed: 1 }
        expect(statRows({ ...state, inventory: { garlic: 5 } }, crops)).toEqual([
            ["Time", "5:00"],
            ["Score", "12"],
            ["Filled", "2"],
            ["Failed", "1"],
            ["carrot", "0"],
            ["garlic", "5"]
        ])
    })
})

describe("cropButtonText", () => {
    it("shows the crop id and its grow time", () => {
        expect(cropButtonText(crops.carrot)).toBe("carrot\n0:15")
    })
})

describe("orderTimeFraction and isOrderUrgent", () => {
    const order: Order = { id: 0, required: { garlic: 2 }, value: 4, expiresAt: ORDER_TICKS }

    it("runs from 1 when the order opens to 0 on its last tick", () => {
        expect(orderTimeFraction(order, 0)).toBe(1)
        expect(orderTimeFraction(order, ORDER_TICKS / 2)).toBe(0.5)
        expect(orderTimeFraction(order, ORDER_TICKS)).toBe(0)
    })

    it("is urgent only in the last quarter", () => {
        expect(isOrderUrgent(order, ORDER_TICKS * 0.75 - 1)).toBe(false)
        expect(isOrderUrgent(order, ORDER_TICKS * 0.75)).toBe(true)
        expect(isOrderUrgent(order, ORDER_TICKS)).toBe(true)
    })
})

describe("parseSeed", () => {
    it("treats blank as random", () => {
        expect(parseSeed("")).toBeUndefined()
        expect(parseSeed("   ")).toBeUndefined()
    })

    it("accepts whole numbers from 0 to MAX_SEED", () => {
        expect(parseSeed("0")).toBe(0)
        expect(parseSeed(" 42 ")).toBe(42)
        expect(parseSeed(String(MAX_SEED))).toBe(MAX_SEED)
    })

    it("rejects anything else", () => {
        for (const bad of ["-1", "1.5", "abc", "1e3", String(MAX_SEED + 1)]) {
            expect(parseSeed(bad)).toBeNull()
        }
    })
})

describe("debugText", () => {
    it("shows tick and seed, and marks a paused game", () => {
        const state = game("timed")
        expect(debugText(state, 7, false)).toContain("tick 0  seed 7\n")
        expect(debugText(state, 7, true)).toContain("PAUSED")
    })
})
