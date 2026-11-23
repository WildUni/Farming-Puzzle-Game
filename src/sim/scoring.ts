// Score calculation for every mode. Points are added as each order is filled (orderPoints), and
// a few bonuses and penalties are worked out at the end of the run (scoreBreakdown). Every
// number comes from src/data/scoring.json. See specs/scoring.md.
import type { GameMode, GameState, Order } from "./types"
import { comboPct } from "./modes"
import { runLevel } from "./difficulty"
import { timeLeft } from "./orders"
import rawScoring from "../data/scoring.json"

// One mode's scoring numbers. 0 turns a part off.
type ScoringRules = {
    levelBonusPct: number // % added to an order's value per Survival level past the first
    speedBonusPct: number // % of the value paid on top for an order filled with all its time left
    bestComboPoints: number // end of run: points per order in the longest streak
    failedOrderPoints: number // end of run: points taken away per failed order
    coinsPerPoint: number // end of run: coins left that make 1 point (0: coins don't count)
}

type ScoringConfig = { survival: ScoringRules; timed: ScoringRules }

type ScoreLineKind = "bestCombo" | "failedOrders" | "coins"
type ScoreLine = { kind: ScoreLineKind; count: number; points: number } // points < 0: a penalty
type ScoreBreakdown = { orderPoints: number; lines: ScoreLine[]; total: number }

const FIELDS = [
    "levelBonusPct",
    "speedBonusPct",
    "bestComboPoints",
    "failedOrderPoints",
    "coinsPerPoint"
] as const satisfies readonly (keyof ScoringRules)[]

// Puzzle has no scoring entry yet: an order is worth its value and nothing is added at the end.
const NO_SCORING: ScoringRules = {
    levelBonusPct: 0,
    speedBonusPct: 0,
    bestComboPoints: 0,
    failedOrderPoints: 0,
    coinsPerPoint: 0
}

function isObject(v: unknown): v is Record<string, unknown> {
    return typeof v === "object" && v !== null && !Array.isArray(v)
}

function validateRules(raw: unknown, mode: string): ScoringRules {
    if (!isObject(raw)) throw new Error(`scoring config: ${mode} must be an object`)
    const rules = { ...NO_SCORING }
    for (const field of FIELDS) {
        const v = raw[field]
        if (typeof v !== "number" || !Number.isInteger(v) || v < 0) {
            throw new Error(`scoring config: ${mode}.${field} must be a whole number >= 0`)
        }
        rules[field] = v
    }
    return rules
}

// Checks a parsed JSON value and returns it typed. Throws naming the bad field.
function validateScoring(raw: unknown): ScoringConfig {
    if (!isObject(raw)) throw new Error("scoring config: config must be an object")
    return {
        survival: validateRules(raw.survival, "survival"),
        timed: validateRules(raw.timed, "timed")
    }
}

const SCORING: ScoringConfig = validateScoring(rawScoring)

// The mode's scoring numbers; all zero for Puzzle.
function scoringRules(mode: GameMode, config: ScoringConfig = SCORING): ScoringRules {
    return mode === "puzzle" ? NO_SCORING : config[mode]
}

// Points for filling `order` now, from the state before the fill: the value raised by the
// Survival level and the Timed combo, plus a speed bonus for the time still left on it.
function orderPoints(
    state: GameState,
    order: Order,
    rules: ScoringRules = scoringRules(state.mode)
): number {
    const level = state.mode === "survival" ? runLevel(state) : 0
    const combo = state.mode === "timed" ? state.combo : 0
    // Whole numbers until the one division, so rounding never depends on float error.
    const levelPct = 100 + rules.levelBonusPct * level
    const base = Math.floor((order.value * levelPct * comboPct(combo)) / 10_000)
    // An Order freeze can push the deadline past the time limit; the bonus stops at full.
    const left = Math.min(timeLeft(order, state.tick), order.timeLimit)
    const speed = Math.floor((order.value * rules.speedBonusPct * left) / (100 * order.timeLimit))
    return base + speed
}

// The final score and how it is made up: the points from filled orders, then the end-of-run
// lines whose rate is above 0. The total never goes below 0.
function scoreBreakdown(
    state: GameState,
    rules: ScoringRules = scoringRules(state.mode)
): ScoreBreakdown {
    const lines: ScoreLine[] = []
    if (rules.bestComboPoints > 0) {
        const count = state.bestCombo
        lines.push({ kind: "bestCombo", count, points: count * rules.bestComboPoints })
    }
    if (rules.failedOrderPoints > 0) {
        const count = state.ordersFailed
        lines.push({ kind: "failedOrders", count, points: -count * rules.failedOrderPoints })
    }
    if (rules.coinsPerPoint > 0) {
        const count = state.coins
        lines.push({ kind: "coins", count, points: Math.floor(count / rules.coinsPerPoint) })
    }
    const sum = lines.reduce((total, line) => total + line.points, state.score)
    return { orderPoints: state.score, lines, total: Math.max(0, sum) }
}

// The run's final score. High scores and leaderboards use this.
function finalScore(state: GameState): number {
    return scoreBreakdown(state).total
}

export {
    validateScoring,
    SCORING,
    NO_SCORING,
    scoringRules,
    orderPoints,
    scoreBreakdown,
    finalScore
}
export type { ScoringRules, ScoringConfig, ScoreLine, ScoreLineKind, ScoreBreakdown }
