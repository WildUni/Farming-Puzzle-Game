// Survival tuning: lives, coins, life prices and the difficulty curve.
// Every number comes from src/data/difficulty.json. See specs/difficulty.md.
import type { GameState, OrderRules } from "./types"
import { modifiersFor } from "./upgrades"
import { ORDER_TICKS, TICKS_PER_SECOND } from "./game_constants"
import rawDifficulty from "../data/difficulty.json"

type LevelRow = {
    orderTimeMultiplier: number
    maxOpenOrders: number
    minAmount: number
    maxAmount: number
    eventGapSeconds: number
}

type DifficultyConfig = {
    startLives: number
    coinsPerOrder: number
    lifePrice: { base: number; growth: number }
    ordersPerLevel: number
    levels: LevelRow[]
}

function isObject(v: unknown): v is Record<string, unknown> {
    return typeof v === "object" && v !== null && !Array.isArray(v)
}

function fail(field: string, rule: string): never {
    throw new Error(`difficulty config: ${field} must be ${rule}`)
}

function wholeAtLeast(
    obj: Record<string, unknown>,
    key: string,
    min: number,
    path: string
): number {
    const v = obj[key]
    if (typeof v !== "number" || !Number.isInteger(v) || v < min) {
        fail(path, `a whole number >= ${min}`)
    }
    return v
}

// Checks a parsed JSON value and returns it typed. Throws naming the bad field.
function validateDifficulty(raw: unknown): DifficultyConfig {
    if (!isObject(raw)) fail("config", "an object")

    const startLives = wholeAtLeast(raw, "startLives", 1, "startLives")
    const coinsPerOrder = wholeAtLeast(raw, "coinsPerOrder", 0, "coinsPerOrder")
    const ordersPerLevel = wholeAtLeast(raw, "ordersPerLevel", 1, "ordersPerLevel")

    const price = raw.lifePrice
    if (!isObject(price)) fail("lifePrice", "an object")
    const base = wholeAtLeast(price, "base", 1, "lifePrice.base")
    const growth = price.growth
    if (typeof growth !== "number" || !Number.isFinite(growth) || growth < 1) {
        fail("lifePrice.growth", "a number >= 1")
    }

    const rows = raw.levels
    if (!Array.isArray(rows) || rows.length === 0) fail("levels", "a non-empty list")
    const levels = rows.map((row: unknown, i): LevelRow => {
        const at = `levels[${i}]`
        if (!isObject(row)) fail(at, "an object")
        const mult = row.orderTimeMultiplier
        if (typeof mult !== "number" || !Number.isFinite(mult) || mult <= 0) {
            fail(`${at}.orderTimeMultiplier`, "a number > 0")
        }
        if (Math.round(ORDER_TICKS * mult) < 1) {
            fail(`${at}.orderTimeMultiplier`, "large enough to give at least 1 tick")
        }
        const maxOpenOrders = wholeAtLeast(row, "maxOpenOrders", 1, `${at}.maxOpenOrders`)
        const minAmount = wholeAtLeast(row, "minAmount", 1, `${at}.minAmount`)
        const maxAmount = wholeAtLeast(row, "maxAmount", minAmount, `${at}.maxAmount`)
        const eventGapSeconds = wholeAtLeast(row, "eventGapSeconds", 1, `${at}.eventGapSeconds`)
        return { orderTimeMultiplier: mult, maxOpenOrders, minAmount, maxAmount, eventGapSeconds }
    })

    return { startLives, coinsPerOrder, lifePrice: { base, growth }, ordersPerLevel, levels }
}

const DIFFICULTY: DifficultyConfig = validateDifficulty(rawDifficulty)

// Level counted from 0, from the number of filled orders. Capped at the last row.
function levelFor(ordersCompleted: number, config: DifficultyConfig = DIFFICULTY): number {
    return Math.min(Math.floor(ordersCompleted / config.ordersPerLevel), config.levels.length - 1)
}

// A Survival run's level: levelFor on the filled orders, slowed by Steady pace (levelPacePct).
function runLevel(state: GameState, config: DifficultyConfig = DIFFICULTY): number {
    const pace = modifiersFor(state.upgrades).levelPacePct
    return levelFor(Math.floor((state.ordersCompleted * 100) / pace), config)
}

// What a level means for new orders. Levels past the end use the last row.
function orderRulesFor(level: number, config: DifficultyConfig = DIFFICULTY): OrderRules {
    const row = config.levels[Math.min(level, config.levels.length - 1)]
    return {
        maxOpenOrders: row.maxOpenOrders,
        orderTicks: Math.round(ORDER_TICKS * row.orderTimeMultiplier),
        minAmount: row.minAmount,
        maxAmount: row.maxAmount
    }
}

// Ticks between one event ending and the next announcement at a level. Past the end: last row.
function eventGapTicks(level: number, config: DifficultyConfig = DIFFICULTY): number {
    return (
        config.levels[Math.min(level, config.levels.length - 1)].eventGapSeconds * TICKS_PER_SECOND
    )
}

// Price of the next life after `livesBought` purchases: round(base x growth^n).
function lifePrice(livesBought: number, config: DifficultyConfig = DIFFICULTY): number {
    const { base, growth } = config.lifePrice
    return Math.round(base * growth ** livesBought)
}

export {
    validateDifficulty,
    DIFFICULTY,
    levelFor,
    runLevel,
    orderRulesFor,
    eventGapTicks,
    lifePrice
}
export type { DifficultyConfig, LevelRow }
