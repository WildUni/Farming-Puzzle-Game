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
    heartsText,
    buyLifeText,
    gameOverText,
    gameOverTitle,
    modeName,
    modeButtonText,
    PLAYABLE_MODES,
    MAX_SEED
} from "./format"
import { createGame } from "../sim/main"
import { buildCropTable } from "../sim/plot"
import { lifePrice, levelFor, DIFFICULTY } from "../sim/difficulty"
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
        const order: Order = {
            id: 3,
            required: { garlic: 4 },
            value: 8,
            expiresAt: 600,
            timeLimit: 600
        }
        const state = { ...game("timed"), tick: 100, inventory: { garlic: 2 } }
        expect(orderText(order, state)).toBe("Order #3\ngarlic x4  (have 2)\nvalue 8   0:50")
    })
})

describe("PLAYABLE_MODES, modeName and modeButtonText", () => {
    it("offers Survival then Timed", () => {
        expect(PLAYABLE_MODES).toEqual(["survival", "timed"])
    })

    it("names every mode", () => {
        expect(modeName("survival")).toBe("Survival")
        expect(modeName("timed")).toBe("Timed")
        expect(modeName("puzzle")).toBe("Puzzle")
    })

    it("describes each playable mode on a second line", () => {
        expect(modeButtonText("survival")).toBe("Survival\nLast as long as you can")
        expect(modeButtonText("timed")).toBe(
            `Timed\nBest score in ${formatClock(TIMED_MODE_TICKS)}`
        )
        expect(modeButtonText("timed")).toBe("Timed\nBest score in 5:00")
    })
})

describe("statRows", () => {
    it("shows Timed's countdown, score, order counts and every crop sorted", () => {
        const state = { ...game("timed"), score: 12, ordersCompleted: 2, ordersFailed: 1 }
        expect(statRows({ ...state, inventory: { garlic: 5 } }, crops)).toEqual([
            ["Mode", "Timed"],
            ["Time left", "5:00"],
            ["Score", "12"],
            ["Filled", "2"],
            ["Failed", "1"],
            ["carrot", "0"],
            ["garlic", "5"]
        ])
    })

    it("adds level, lives and coins in Survival", () => {
        const state = {
            ...game("survival"),
            tick: 600,
            score: 30,
            ordersCompleted: DIFFICULTY.ordersPerLevel,
            lives: 2,
            coins: 9
        }
        expect(statRows(state, crops)).toEqual([
            ["Mode", "Survival"],
            ["Time", "1:00"],
            ["Score", "30"],
            ["Level", "2"],
            ["Lives", "♥♥"],
            ["Coins", "9"],
            ["Filled", String(DIFFICULTY.ordersPerLevel)],
            ["Failed", "0"],
            ["carrot", "0"],
            ["garlic", "0"]
        ])
    })

    it("leaves Survival-only rows out of Timed, even with coins or lives set", () => {
        const state = { ...game("timed"), lives: 2, coins: 9, ordersCompleted: 40 }
        const labels = statRows(state, crops).map(([label]) => label)
        for (const row of ["Level", "Lives", "Coins"]) expect(labels).not.toContain(row)
    })
})

describe("heartsText", () => {
    it("shows one heart per life up to 5, then a count", () => {
        expect(heartsText(0)).toBe("none")
        expect(heartsText(1)).toBe("♥")
        expect(heartsText(3)).toBe("♥♥♥")
        expect(heartsText(5)).toBe("♥♥♥♥♥")
        expect(heartsText(7)).toBe("♥ x7")
    })
})

describe("buyLifeText", () => {
    it("shows the next life's price", () => {
        const state = { ...game("survival"), livesBought: 2 }
        expect(buyLifeText(state)).toBe(`Buy life\n${lifePrice(2)} coins`)
    })
})

describe("gameOverTitle", () => {
    it("says Game over in Survival and Time's up in Timed", () => {
        expect(gameOverTitle(game("survival"))).toBe("Game over")
        expect(gameOverTitle(game("timed"))).toBe("Time's up")
    })
})

describe("gameOverText", () => {
    it("shows score and order counts in Timed", () => {
        const state = {
            ...game("timed"),
            tick: TIMED_MODE_TICKS,
            score: 340,
            ordersCompleted: 12,
            ordersFailed: 3
        }
        expect(gameOverText(state)).toBe("Score 340\nOrders filled 12\nOrders failed 3")
    })

    it("shows score, orders filled, time survived and level reached in Survival", () => {
        const state = { ...game("survival"), tick: 3050, score: 120, ordersCompleted: 7 }
        expect(gameOverText(state)).toBe(
            `Score 120\nOrders filled 7\nTime survived 5:05\nLevel reached ${levelFor(7) + 1}`
        )
    })
})

describe("cropButtonText", () => {
    it("shows the crop id and its grow time", () => {
        expect(cropButtonText(crops.carrot)).toBe("carrot\n0:15")
    })
})

describe("orderTimeFraction and isOrderUrgent", () => {
    const order: Order = {
        id: 0,
        required: { garlic: 2 },
        value: 4,
        expiresAt: ORDER_TICKS,
        timeLimit: ORDER_TICKS
    }

    it("runs from 1 when the order opens to 0 on its last tick", () => {
        expect(orderTimeFraction(order, 0)).toBe(1)
        expect(orderTimeFraction(order, ORDER_TICKS / 2)).toBe(0.5)
        expect(orderTimeFraction(order, ORDER_TICKS)).toBe(0)
    })

    it("measures against the order's own time limit", () => {
        const long: Order = { ...order, expiresAt: 100 + 900, timeLimit: 900 }
        expect(orderTimeFraction(long, 100)).toBe(1)
        expect(orderTimeFraction(long, 550)).toBe(0.5)
        const short: Order = { ...order, expiresAt: 200, timeLimit: 200 }
        expect(orderTimeFraction(short, 0)).toBe(1)
        expect(isOrderUrgent(short, 150)).toBe(true)
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
    it("shows tick, seed and mode, and marks a paused game", () => {
        expect(debugText(game("timed"), 7, false)).toContain("tick 0  seed 7  timed\n")
        expect(debugText(game("survival"), 7, false)).toContain("tick 0  seed 7  survival\n")
        expect(debugText(game("timed"), 7, true)).toContain("PAUSED")
    })
})
