import { describe, it, expect } from "vitest"
import { formatClock, timerText, plotText, orderText, statRows, cropButtonText } from "./format"
import { createGame } from "../sim/main"
import { buildCropTable } from "../sim/plot"
import { TIMED_MODE_TICKS } from "../sim/game_constants"
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
