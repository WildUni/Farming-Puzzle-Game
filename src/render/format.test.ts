import { describe, it, expect } from "vitest"
import {
    formatClock,
    powerUpButtonText,
    activeEffectText,
    shownEffects,
    ordersFrozen,
    eventBannerText,
    rushBannerText,
    eventIsGood,
    plotOverlays,
    newsText,
    scarecrowText,
    timerText,
    plotText,
    orderText,
    nextOrderText,
    isFogged,
    statRows,
    cropButtonText,
    orderTimeFraction,
    isOrderUrgent,
    parseSeed,
    debugText,
    heartsText,
    buyLifeText,
    upgradeCardText,
    upgradeDescription,
    targetTitle,
    targetText,
    tierName,
    gameOverText,
    comboText,
    gameOverTitle,
    modeName,
    modeButtonText,
    modeBestText,
    bestScoreText,
    soundButtonText,
    PLAYABLE_MODES,
    MAX_SEED,
    storageText,
    storageFill,
    isStorageFull,
    sellAmount,
    barnCropText,
    sellButtonText,
    miracleGrowText,
    makeFertilizerText,
    fertilizeText,
    rerollText,
    shopItemText,
    shopPriceText,
    sellRefundText,
    ownedUpgradeText,
    restockText,
    promotionTargetText,
    shopTitleText,
    freeRestockText,
    shopButtonText
} from "./format"
import { sellValue, storageUsed, rerollPrice } from "../sim/economy"
import { ECONOMY } from "../sim/economy_config"
import { createGame } from "../sim/main"
import { buildCropTable } from "../sim/plot"
import { lifePrice, levelFor, DIFFICULTY } from "../sim/difficulty"
import { ORDER_TICKS, TICKS_PER_SECOND } from "../sim/game_constants"
import { MODES, comboPct } from "../sim/modes"
import { SCORING, comboPctFor } from "../sim/scoring"
import { UPGRADES, effectAmount, modifiersFor, scalePct } from "../sim/upgrades"
import { POWER_UPS } from "../sim/powerups"
import { SHOP, sellRefund } from "../sim/shop"
import { EVENTS } from "../sim/events"
import type { ActiveEffect, GameState, Order, OwnedUpgrade, RunEvent, Tier } from "../sim/types"

const crops = buildCropTable([
    { id: "garlic", growTicks: 80, yield: 2, value: 2, fertilizerCost: 4 },
    { id: "carrot", growTicks: 150, yield: 2, value: 8, fertilizerCost: 2 }
])

function game(mode: GameState["mode"]): GameState {
    return createGame(1, { mode, allowPowerUps: false, allowEvents: false })
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
        expect(timerText(game("timed"))).toBe(formatClock(MODES.timed.runTicks))
        expect(timerText({ ...game("timed"), tick: MODES.timed.runTicks })).toBe("0:00")
    })

    it("counts up in survival mode", () => {
        expect(timerText({ ...game("survival"), tick: 610 })).toBe("1:01")
    })
})

describe("plotText", () => {
    it("labels each plot state", () => {
        expect(plotText({ state: "empty" }, 0)).toBe("empty")
        expect(
            plotText({ state: "growing", cropId: "garlic", plantedAt: 0, readyAt: 80 }, 40)
        ).toBe("garlic\n50%")
        expect(plotText({ state: "ready", cropId: "carrot" }, 0)).toBe("carrot\nREADY")
    })
})

describe("orderText", () => {
    it("shows crops needed, amount held, value and time left", () => {
        const order: Order = {
            id: 3,
            required: { garlic: 4 },
            value: 8,
            expiresAt: 600,
            timeLimit: 600,
            small: false,
            rush: false,
            tip: 0,
            giant: null
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
            `Timed\nBest score in ${formatClock(MODES.timed.runTicks)}`
        )
        expect(modeButtonText("timed")).toBe("Timed\nBest score in 5:00")
    })
})

describe("save text", () => {
    it("modeBestText shows the saved best, or that there is none", () => {
        expect(modeBestText(undefined)).toBe("No best yet")
        expect(modeBestText(0)).toBe("Best 0")
        expect(modeBestText(465)).toBe("Best 465")
    })

    it("bestScoreText says New best, the best to beat, or that a debugged run isn't saved", () => {
        expect(bestScoreText(465, true, false)).toBe("New best!")
        expect(bestScoreText(465, false, false)).toBe("Best 465")
        expect(bestScoreText(465, true, true)).toBe("Not saved (debugged run)")
    })

    it("soundButtonText shows the setting", () => {
        expect(soundButtonText(true)).toBe("Sound: on")
        expect(soundButtonText(false)).toBe("Sound: off")
    })
})

describe("statRows", () => {
    it("shows Timed's countdown, score, combo, order counts and every crop sorted", () => {
        const state = { ...game("timed"), score: 12, ordersCompleted: 2, ordersFailed: 1 }
        expect(statRows({ ...state, inventory: { garlic: 5 } }, crops)).toEqual([
            ["Mode", "Timed"],
            ["Time left", "5:00"],
            ["Score", "12"],
            ["Combo", "x1"],
            ["Coins", "0"],
            ["Filled", "2"],
            ["Failed", "1"],
            ["carrot", "0"],
            ["garlic", "5"]
        ])
    })

    it("shows the combo multiplier and the time left to keep it", () => {
        const s = { ...game("timed"), tick: 100, combo: 3, comboEndsAt: 150 }
        expect(comboText(s)).toBe(`x${comboPct(3) / 100} 0:05`)
        expect(comboText({ ...game("timed"), combo: 0 })).toBe("x1")
        // Head start lifts the multiplier even with no streak.
        const lifted = {
            ...game("timed"),
            upgrades: [{ id: "headStart", tier: "epic" as const, target: null }]
        }
        expect(comboText(lifted)).toBe(`x${comboPctFor(lifted) / 100}`)
        expect(comboPctFor(lifted)).toBeGreaterThan(100)
        const labels = statRows({ ...game("survival"), combo: 3 }, crops).map(([l]) => l)
        expect(labels).not.toContain("Combo")
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
            ["Lives", "♥♥♡"],
            ["Coins", "9"],
            ["Filled", String(DIFFICULTY.ordersPerLevel)],
            ["Failed", "0"],
            ["carrot", "0"],
            ["garlic", "0"]
        ])
    })

    it("leaves Survival-only rows out of Timed, even with lives set", () => {
        const state = { ...game("timed"), lives: 2, coins: 9, ordersCompleted: 40 }
        const rows = statRows(state, crops)
        const labels = rows.map(([label]) => label)
        for (const row of ["Level", "Lives"]) expect(labels).not.toContain(row)
        expect(rows).toContainEqual(["Coins", "9"])
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

    it("shows empty hearts up to the cap", () => {
        expect(heartsText(1, 3)).toBe("♥♡♡")
        expect(heartsText(0, 3)).toBe("♡♡♡")
        expect(heartsText(3, 3)).toBe("♥♥♥")
        expect(heartsText(2, 6)).toBe("♥ x2")
    })
})

describe("buyLifeText", () => {
    it("shows the next life's price", () => {
        const state = { ...game("survival"), livesBought: 2, lives: 1 }
        expect(buyLifeText(state)).toBe(`Buy life\n${lifePrice(2)} coins`)
    })

    it("says Lives full at the cap", () => {
        expect(buyLifeText({ ...game("survival"), lives: MODES.survival.maxLives })).toBe(
            "Lives full"
        )
    })

    it("applies the life price upgrade", () => {
        const upgrades = [{ id: "lifeDiscount", tier: "epic" as const, target: null }]
        const state = { ...game("survival"), upgrades, lives: 1 }
        const pct = 100 + effectAmount(UPGRADES.upgrades.lifeDiscount, 0, "epic")
        const price = scalePct(lifePrice(0), pct)
        expect(buyLifeText(state)).toBe(`Buy life\n${price} coins`)
    })
})

describe("upgradeCardText", () => {
    const own = (id: string) => ({ id, tier: "common" as const, target: null })

    it("shows name, tier, the tier's values and the copy count after picking", () => {
        const def = UPGRADES.upgrades.fastGrowth
        const pct = -effectAmount(def, 0, "rare")
        expect(upgradeCardText(def, "rare", [])).toBe(
            `Fast growth
Rare
Crops grow ${pct}% faster
1 / ${def.maxCopies}`
        )
        expect(upgradeCardText(def, "rare", [own("fastGrowth"), own("bigTips")])).toBe(
            `Fast growth
Rare
Crops grow ${pct}% faster
2 / ${def.maxCopies}`
        )
    })

    it("fills every effect of a two-effect upgrade", () => {
        const def = UPGRADES.upgrades.favoriteCrop
        const grow = -effectAmount(def, 0, "legendary")
        const bonus = effectAmount(def, 1, "legendary")
        expect(upgradeDescription(def, "legendary")).toBe(
            `One crop grows ${grow}% faster and yields +${bonus}`
        )
    })

    it("shows a non-tiered upgrade at its own tier", () => {
        const def = UPGRADES.upgrades.extraPlot
        expect(upgradeCardText(def, "rare", [])).toBe(
            `Extra plot
Rare
One more plot to plant on
1 / ${def.maxCopies}`
        )
    })
})

describe("upgrade target text", () => {
    it("names the step and each target", () => {
        expect(targetTitle(UPGRADES.upgrades.favoriteCrop)).toBe("Choose a crop")
        expect(targetText("carrot")).toBe("carrot")
        expect(targetText(0)).toBe("Plot 1")
    })

    it("capitalises tier names", () => {
        expect(tierName("legendary")).toBe("Legendary")
    })
})

describe("gameOverTitle", () => {
    it("says Game over in Survival and Time's up in Timed", () => {
        expect(gameOverTitle(game("survival"))).toBe("Game over")
        expect(gameOverTitle(game("timed"))).toBe("Time's up")
    })
})

describe("gameOverText", () => {
    it("shows the score breakdown, order counts and best combo in Timed", () => {
        const state = {
            ...game("timed"),
            tick: MODES.timed.runTicks,
            score: 340,
            ordersCompleted: 12,
            ordersFailed: 3,
            bestCombo: 7
        }
        const combo = 7 * SCORING.timed.bestComboPoints
        const failed = 3 * SCORING.timed.failedOrderPoints
        expect(gameOverText(state)).toBe(
            [
                "Order points 340",
                `Best combo bonus +${combo}`,
                `Failed orders -${failed}`,
                `Final score ${340 + combo - failed}`,
                "Orders filled 12",
                "Orders failed 3",
                "Best combo 7"
            ].join("\n")
        )
    })

    it("shows the score breakdown, time survived and level reached in Survival", () => {
        const state = {
            ...game("survival"),
            tick: 3050,
            score: 120,
            ordersCompleted: 7,
            ordersFailed: 3,
            coins: 13
        }
        const coins = Math.floor(13 / SCORING.survival.coinsPerPoint)
        expect(gameOverText(state)).toBe(
            [
                "Order points 120",
                `Coins left +${coins}`,
                `Final score ${120 + coins}`,
                "Orders filled 7",
                "Orders failed 3",
                "Time survived 5:05",
                `Level reached ${levelFor(7) + 1}`
            ].join("\n")
        )
    })

    it("leaves out end-of-run lines that add nothing", () => {
        const state = { ...game("timed"), score: 50, ordersCompleted: 2 }
        expect(gameOverText(state).split("\n").slice(0, 2)).toEqual([
            "Order points 50",
            "Final score 50"
        ])
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
        timeLimit: ORDER_TICKS,
        small: false,
        rush: false,
        tip: 0,
        giant: null
    }

    it("runs from 1 when the order opens to 0 on its last tick", () => {
        expect(orderTimeFraction(order, 0)).toBe(1)
        expect(orderTimeFraction(order, ORDER_TICKS / 2)).toBe(0.5)
        expect(orderTimeFraction(order, ORDER_TICKS)).toBe(0)
    })

    it("measures against the order's own time limit", () => {
        const long: Order = { ...order, expiresAt: 100 + 900, timeLimit: 900, small: false }
        expect(orderTimeFraction(long, 100)).toBe(1)
        expect(orderTimeFraction(long, 550)).toBe(0.5)
        const short: Order = { ...order, expiresAt: 200, timeLimit: 200, small: false }
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

    it("marks a run changed by the debug menu", () => {
        expect(debugText(game("timed"), 7, false)).not.toContain("DEBUGGED")
        expect(debugText(game("timed"), 7, false, true)).toContain(
            "tick 0  seed 7  timed  DEBUGGED\n"
        )
    })
})

describe("power-up text", () => {
    const freeze = POWER_UPS.powerUps.orderFreeze
    const effect = (endsAt: number): ActiveEffect => ({
        source: "orderFreeze",
        effect: { kind: "orderRate", pct: 0 },
        startedAt: 0,
        endsAt,
        exclude: [],
        only: null
    })

    it("powerUpButtonText gives the name and fills {seconds} from durationFor", () => {
        expect(powerUpButtonText(freeze, [])).toBe("Order freeze\nOrder timers stop for 10 s")
        const longer = [{ id: "longLasting", tier: "legendary" as const, target: null }]
        expect(powerUpButtonText(freeze, longer)).toBe("Order freeze\nOrder timers stop for 15 s")
        expect(powerUpButtonText(POWER_UPS.powerUps.coinBag, [])).toBe("Coin bag\n+10 coins")
    })

    it("activeEffectText rounds seconds up", () => {
        expect(activeEffectText(effect(101), 100)).toBe("Order freeze 1s")
        expect(activeEffectText(effect(200), 100)).toBe("Order freeze 10s")
        expect(activeEffectText(effect(171), 100)).toBe("Order freeze 8s")
    })

    it("shownEffects and ordersFrozen skip an effect on its endsAt tick", () => {
        const s = { ...game("survival"), tick: 50, activeEffects: [effect(50), effect(60)] }
        expect(shownEffects(s)).toEqual([effect(60)])
        expect(ordersFrozen(s)).toBe(true)
        expect(ordersFrozen({ ...s, activeEffects: [effect(50)] })).toBe(false)
    })

    it("shownEffects lists only power-up effects", () => {
        const frost: ActiveEffect = {
            source: "frost",
            effect: { kind: "growthRate", pct: 0 },
            startedAt: 0,
            endsAt: 60,
            exclude: [],
            only: null
        }
        const s = { ...game("survival"), tick: 10, activeEffects: [frost, effect(60)] }
        expect(shownEffects(s)).toEqual([effect(60)])
    })
})

describe("event text", () => {
    const run = (overrides: Partial<RunEvent>): RunEvent => ({
        id: "frost",
        announcedAt: 0,
        warnAt: 0,
        startsAt: 50,
        endsAt: 130,
        plot: null,
        amount: null,
        ...overrides
    })
    const at = (tick: number, event: RunEvent | null) => ({ ...game("survival"), tick, event })

    it("eventBannerText shows the warning, then the time left, rounding up", () => {
        expect(eventBannerText(at(10, run({})))).toBe("Frost in 4s")
        expect(eventBannerText(at(49, run({})))).toBe("Frost in 1s")
        expect(eventBannerText(at(50, run({})))).toBe("Frost 8s")
        expect(eventBannerText(at(129, run({})))).toBe("Frost 1s")
        expect(eventBannerText(at(130, run({})))).toBeNull()
        expect(eventBannerText(at(10, null))).toBeNull()
    })

    it("eventBannerText names a plot event's plot, and instant events only show a warning", () => {
        const moles = run({ id: "moles", startsAt: 50, endsAt: 50, plot: 1 })
        expect(eventBannerText(at(20, moles))).toBe("Moles → Plot 2 in 3s")
        expect(eventBannerText(at(50, moles))).toBeNull()
    })

    it("newsText shows the headline until the warning, and the banner waits for it", () => {
        const news = run({ announcedAt: 0, warnAt: 100, startsAt: 150, endsAt: 230 })
        const headline = EVENTS.events.frost.news!.headline
        expect(newsText(at(0, news))).toBe(`NEWS  ${headline}`)
        expect(newsText(at(99, news))).toBe(`NEWS  ${headline}`)
        expect(eventBannerText(at(99, news))).toBeNull()
        expect(newsText(at(100, news))).toBeNull()
        expect(eventBannerText(at(100, news))).toBe("Frost in 5s")
        expect(newsText(at(0, run({ id: "moles", warnAt: 0 })))).toBeNull()
        expect(newsText(at(0, null))).toBeNull()
    })

    it("scarecrowText counts down the guard and is null once it ends", () => {
        const s = { ...game("survival"), tick: 100, scarecrowUntil: 551 }
        expect(scarecrowText(s)).toBe("Scarecrow 46s")
        expect(scarecrowText({ ...s, tick: 551 })).toBeNull()
        expect(scarecrowText(game("survival"))).toBeNull()
    })

    it("plotOverlays marks dry, watered and seeded crops", () => {
        const grow = { state: "growing" as const, cropId: "garlic", plantedAt: 0, readyAt: 500 }
        const s: GameState = {
            ...game("survival"),
            tick: 20,
            plots: [grow, grow, { ...grow, seeded: true }, { state: "empty" }],
            activeEffects: [
                {
                    source: "drought",
                    effect: { kind: "drought", waterSeconds: 3 },
                    startedAt: 10,
                    endsAt: 110,
                    exclude: [],
                    only: null
                },
                {
                    source: "water:1",
                    effect: { kind: "water" },
                    startedAt: 15,
                    endsAt: 45,
                    exclude: [],
                    only: [1]
                }
            ]
        }
        expect(plotOverlays(s)).toEqual([["dry"], ["wet"], ["dry", "seeds"], []])
    })

    it("plotOverlays marks Lucky clover plots", () => {
        const s = { ...game("survival"), cloverPlots: [1, 3] }
        expect(plotOverlays(s)).toEqual([[], ["clover"], [], ["clover"]])
    })

    it("eventIsGood follows the event's kind", () => {
        expect(eventIsGood(at(0, run({ id: "sunnySpell" })))).toBe(true)
        expect(eventIsGood(at(0, run({})))).toBe(false)
        expect(eventIsGood(at(0, null))).toBe(false)
        expect(EVENTS.events.sunnySpell.kind).toBe("good")
    })

    it("plotOverlays marks the target, crows, frost, sun and Greenhouse plots", () => {
        const base = game("survival")
        const working = (effect: ActiveEffect["effect"], exclude: number[] = []): ActiveEffect => ({
            source: effect.kind,
            effect,
            startedAt: 10,
            endsAt: 20,
            exclude,
            only: null
        })
        const s = {
            ...base,
            tick: 12,
            event: run({ id: "moles", startsAt: 30, endsAt: 30, plot: 0 }),
            upgrades: [{ id: "greenhouse", tier: "epic" as const, target: 3 }],
            activeEffects: [
                working({ kind: "blockHarvest", plots: 2 }, [3]),
                working({ kind: "growthRate", pct: 0 }, [3]),
                working({ kind: "growthRate", pct: 150 })
            ]
        }
        expect(plotOverlays(s)).toEqual([
            ["target", "blocked", "frozen", "fast"],
            ["blocked", "frozen", "fast"],
            ["blocked", "frozen", "fast"],
            ["fast", "shield"]
        ])
        expect(plotOverlays({ ...s, tick: 20, event: null })).toEqual([[], [], [], ["shield"]])
    })

    it("plotOverlays marks crows only on the plots they landed on", () => {
        const crows: ActiveEffect = {
            source: "crows",
            effect: { kind: "blockHarvest", plots: 2 },
            startedAt: 10,
            endsAt: 20,
            exclude: [],
            only: [1, 2]
        }
        const s = { ...game("survival"), tick: 12, activeEffects: [crows] }
        expect(plotOverlays(s)).toEqual([[], ["blocked"], ["blocked"], []])
    })
})

describe("second batch text: fog, worms, sneak peek, steady pace", () => {
    const fog: ActiveEffect = {
        source: "fog",
        effect: { kind: "fog" },
        startedAt: 10,
        endsAt: 20,
        exclude: [],
        only: null
    }
    const fogged = (tick: number): GameState => ({
        ...game("survival"),
        tick,
        activeEffects: [fog]
    })

    it("isFogged is true only while fog works", () => {
        expect(isFogged(fogged(10))).toBe(true)
        expect(isFogged(fogged(20))).toBe(false)
        expect(isFogged(game("survival"))).toBe(false)
    })

    it("plotText hides growth in fog", () => {
        const growing = { state: "growing" as const, cropId: "garlic", plantedAt: 0, readyAt: 100 }
        expect(plotText(growing, 50, true)).toBe("garlic\n?")
        expect(plotText(growing, 50)).toBe("garlic\n50%")
        expect(plotText({ state: "ready", cropId: "garlic" }, 50, true)).toBe("garlic\nREADY")
    })

    it("orderText hides the time left in fog", () => {
        const order: Order = {
            id: 2,
            required: { garlic: 3 },
            value: 6,
            expiresAt: 600,
            timeLimit: 600,
            small: false,
            rush: false,
            tip: 0,
            giant: null
        }
        expect(orderText(order, fogged(12))).toBe("Order #2\ngarlic x3  (have 0)\nvalue 6   ?:??")
    })

    it("marks an order Small order halved", () => {
        const order: Order = {
            id: 4,
            required: { garlic: 2 },
            value: 8,
            expiresAt: 600,
            timeLimit: 600,
            small: true,
            rush: false,
            tip: 0,
            giant: null
        }
        expect(orderText(order, game("survival")).split("\n")[0]).toBe("Order #4  SMALL")
        expect(nextOrderText(order).split("\n")[0]).toBe("Next order  SMALL")
    })

    it("marks an order Generous customer tipped, after SMALL", () => {
        const order: Order = {
            id: 4,
            required: { garlic: 2 },
            value: 8,
            expiresAt: 600,
            timeLimit: 600,
            small: true,
            rush: false,
            tip: 10,
            giant: null
        }
        expect(orderText(order, game("survival")).split("\n")[0]).toBe("Order #4  SMALL TIP +10")
        expect(orderText({ ...order, small: false, tip: 0 }, game("survival"))).not.toContain("TIP")
    })

    it("nextOrderText lists the next order's crops and value", () => {
        const order: Order = {
            id: 9,
            required: { carrot: 2 },
            value: 16,
            expiresAt: 0,
            timeLimit: 1,
            small: false,
            rush: false,
            tip: 0,
            giant: null
        }
        expect(nextOrderText(order)).toBe("Next order\ncarrot x2\nvalue 16")
    })

    it("plotOverlays marks plots Worms are working on", () => {
        const worms: ActiveEffect = {
            source: "worms",
            effect: { kind: "harvestBonus", crops: 1 },
            startedAt: 10,
            endsAt: 20,
            exclude: [],
            only: null
        }
        const s = { ...game("survival"), tick: 12, activeEffects: [worms] }
        expect(plotOverlays(s)).toEqual([["worms"], ["worms"], ["worms"], ["worms"]])
    })

    it("the Level row and game-over text follow Steady pace", () => {
        const s: GameState = {
            ...game("survival"),
            ordersCompleted: DIFFICULTY.ordersPerLevel,
            upgrades: [{ id: "steadyPace", tier: "legendary", target: null }]
        }
        expect(statRows(s, crops)).toContainEqual(["Level", "1"])
        expect(gameOverText(s)).toContain("Level reached 1")
    })
})

describe("rush wave text", () => {
    const RUSH = MODES.timed.rush
    const WAVE = RUSH.atTicks[0]
    const rushOrder = (id: number): Order => ({
        id,
        required: { garlic: 2 },
        value: 6,
        expiresAt: 1000,
        timeLimit: 300,
        small: false,
        rush: true,
        tip: 0,
        giant: null
    })

    it("marks a rush order, before SMALL", () => {
        const order = rushOrder(5)
        expect(orderText(order, game("timed")).split("\n")[0]).toBe("Order #5  RUSH")
        const both = { ...order, small: true }
        expect(orderText(both, game("timed")).split("\n")[0]).toBe("Order #5  RUSH SMALL")
    })

    it("marks a Giant order with how many orders it merged, first", () => {
        const giant = { ...rushOrder(6), rush: false, tip: 4, giant: { orders: 3, coinsPct: 150 } }
        expect(orderText(giant, game("timed")).split("\n")[0]).toBe("Order #6  GIANT x3 TIP +4")
    })

    it("counts down the warning in whole seconds, rounding up", () => {
        const at = (tick: number) => rushBannerText({ ...game("timed"), tick })
        expect(at(WAVE - RUSH.warnTicks - 1)).toBeNull()
        const seconds = Math.ceil(RUSH.warnTicks / TICKS_PER_SECOND)
        expect(at(WAVE - RUSH.warnTicks)).toBe(`Rush wave in ${seconds}s`)
        expect(at(WAVE - 1)).toBe("Rush wave in 1s")
    })

    it("shows the rush orders left while any are open, then nothing", () => {
        const s = { ...game("timed"), tick: WAVE + 10, orders: [rushOrder(3), rushOrder(4)] }
        expect(rushBannerText(s)).toBe("Rush wave! 2 left")
        expect(rushBannerText({ ...s, orders: [] })).toBeNull()
    })

    it("never shows in Survival or once the run has ended", () => {
        const tick = WAVE - 1
        expect(rushBannerText({ ...game("survival"), tick })).toBeNull()
        expect(rushBannerText({ ...game("timed"), tick, status: "ended" })).toBeNull()
    })
})

describe("miracleGrowText", () => {
    it("reads ready, or the time left on the recharge", () => {
        const s = { ...game("survival"), tick: 100 }
        expect(miracleGrowText(s)).toBe("Miracle grow\nready")
        expect(miracleGrowText({ ...s, miracleReadyAt: 100 })).toBe("Miracle grow\nready")
        const later = 100 + 42 * TICKS_PER_SECOND
        expect(miracleGrowText({ ...s, miracleReadyAt: later })).toBe(
            `Miracle grow\n${formatClock(42 * TICKS_PER_SECOND)}`
        )
    })
})

describe("barn panel and reroll text", () => {
    const cap = MODES.survival.storageCap

    it("storageText, storageFill and isStorageFull follow the crops held", () => {
        const empty = game("survival")
        expect(storageText(empty)).toBe(`Storage 0 / ${cap}`)
        expect(storageFill(empty)).toBe(0)
        expect(isStorageFull(empty)).toBe(false)
        const half = { ...empty, inventory: { garlic: 5, carrot: 5 } }
        expect(storageFill(half)).toBeCloseTo(storageUsed(half) / cap)
        const full = { ...empty, inventory: { garlic: cap } }
        expect(storageText(full)).toBe(`Storage ${cap} / ${cap}`)
        expect(storageFill(full)).toBe(1)
        expect(isStorageFull(full)).toBe(true)
        expect(storageText({ ...game("timed"), inventory: { garlic: 3 } })).toBe(
            `Storage 3 / ${MODES.timed.storageCap}`
        )
    })

    it("sellAmount keeps the typed amount between 1 and what is held", () => {
        expect(sellAmount("3", 5)).toBe(3)
        expect(sellAmount(" 9 ", 5)).toBe(5)
        expect(sellAmount("0", 5)).toBe(1)
        expect(sellAmount("", 5)).toBe(1)
        expect(sellAmount("abc", 5)).toBe(1)
        expect(sellAmount("4", 0)).toBe(1)
    })

    it("button labels show counts, coins and costs", () => {
        const s = { ...game("survival"), inventory: { garlic: 4 }, fertilizer: 2 }
        expect(barnCropText("garlic", s)).toBe("garlic\n4")
        expect(barnCropText("carrot", s)).toBe("carrot\n0")
        expect(sellButtonText(s, crops.carrot, 3)).toBe(
            `Sell 3\n+${sellValue(crops.carrot, 3)} coins`
        )
        const premium = {
            ...s,
            upgrades: [{ id: "premiumProduce", tier: "legendary" as const, target: null }]
        }
        const boosted = sellValue(
            crops.carrot,
            8,
            ECONOMY,
            modifiersFor(premium.upgrades).sellPricePct
        )
        expect(boosted).toBeGreaterThan(sellValue(crops.carrot, 8))
        expect(sellButtonText(premium, crops.carrot, 8)).toBe(`Sell 8\n+${boosted} coins`)
        expect(makeFertilizerText(crops.garlic)).toBe(
            `Make fertilizer\nuses ${crops.garlic.fertilizerCost} garlic`
        )
        expect(makeFertilizerText(crops.garlic, false)).toBe("Make fertilizer\nneeds Compost")
        expect(fertilizeText(s)).toBe("Fertilize\n2 held")
        expect(rerollText({ ...s, rerollsThisOffer: 2 })).toBe(`Reroll\n${rerollPrice(2)} coins`)
    })

    it("plotOverlays marks a fertilized crop", () => {
        const s = {
            ...game("survival"),
            plots: [
                { state: "growing" as const, cropId: "garlic", plantedAt: 0, readyAt: 50 },
                {
                    state: "growing" as const,
                    cropId: "garlic",
                    plantedAt: 0,
                    readyAt: 50,
                    fertilized: true as const
                }
            ]
        }
        expect(plotOverlays(s)).toEqual([[], ["fertilized"]])
    })
})

describe("shop text", () => {
    const own = (
        id: string,
        tier: Tier = "common",
        target: number | null = null
    ): OwnedUpgrade => ({
        id,
        tier,
        target
    })
    const shopState = (overrides: Partial<GameState> = {}): GameState => ({
        ...createGame(1, { mode: "survival", allowPowerUps: true, allowEvents: false }),
        coins: 200,
        shop: {
            open: true,
            stock: [
                { kind: "upgrade", id: "bigTips", tier: "rare", sold: false },
                { kind: "upgrade", id: "promotion", tier: "epic", sold: false },
                { kind: "powerUp", id: "orderFreeze", sold: false },
                { kind: "life", sold: true }
            ],
            freeRestocks: 0,
            restockProgress: 0
        },
        ...overrides
    })

    it("shopItemText for an upgrade, Promotion, a power-up and a life", () => {
        const s = shopState({ lives: 2 })
        expect(shopItemText(s, 0)).toBe(upgradeCardText(UPGRADES.upgrades.bigTips, "rare", []))
        expect(shopItemText(s, 1)).toBe("Promotion\nEpic\nRaise one owned upgrade by one tier")
        expect(shopItemText(s, 2)).toBe("Order freeze\nOrder timers stop for 10 s\nPower-up")
        expect(shopItemText(s, 3)).toBe("Life\n♥♥♥")
        expect(shopItemText(shopState(), 3)).toBe("Life\nLives full")
    })

    it("shopPriceText follows itemPrice, with Discount card, and says SOLD and Maxed", () => {
        const s = shopState()
        expect(shopPriceText(s, 0, crops)).toBe(`Buy ${SHOP.tierPrice.rare}`)
        const discounted = shopState({ upgrades: [own("discountCard", "legendary")] })
        expect(shopPriceText(discounted, 0, crops)).toBe(`Buy ${(SHOP.tierPrice.rare * 80) / 100}`)
        expect(shopPriceText(s, 3, crops)).toBe("SOLD")
        const max = UPGRADES.upgrades.bigTips.maxCopies
        const maxed = shopState({ upgrades: Array.from({ length: max }, () => own("bigTips")) })
        expect(shopPriceText(maxed, 0, crops)).toBe("Maxed")
    })

    it("sellRefundText gives the refund or why a copy can't be sold", () => {
        const s = shopState({
            upgrades: [
                own("bigTips", "epic"),
                own("extraHeart", "rare"),
                own("bumperHarvest"),
                own("biggerBumper")
            ]
        })
        expect(sellRefundText(s, 0)).toBe(`Sell +${sellRefund(own("bigTips", "epic"))}`)
        expect(sellRefundText(s, 1)).toBe("Can't sell")
        expect(sellRefundText(s, 2)).toBe("Needed by Bigger bumper")
        const barn = shopState({ upgrades: [own("biggerBarn")], inventory: { garlic: 28 } })
        expect(sellRefundText(barn, 0)).toBe("Barn too full")
        expect(ownedUpgradeText(own("richSoil", "rare", 1))).toBe("Rich soil (Rare) · Plot 2")
    })

    it("restockText, freeRestockText, shopButtonText, promotionTargetText, shopTitleText", () => {
        const bank = (freeRestocks: number, restockProgress = 0) =>
            shopState({ shop: { ...shopState().shop, freeRestocks, restockProgress } })
        expect(restockText(shopState())).toBe(`Restock\n${SHOP.restock.price} coins`)
        expect(restockText(bank(2))).toBe("Restock\nfree (2 left)")
        expect(freeRestockText(shopState())).toBe("Next free restock in 7 orders")
        expect(freeRestockText(bank(0, 6))).toBe("Next free restock in 1 order")
        expect(freeRestockText(bank(2))).toBe("Free restocks full")
        expect(shopButtonText(shopState())).toBe("Shop")
        expect(shopButtonText(bank(2))).toBe("Shop\n2 free")
        expect(promotionTargetText(own("fastGrowth", "rare"))).toBe("Fast growth\nRare → Epic")
        expect(shopTitleText(shopState())).toBe("Shop  ·  200 coins")
    })
})
