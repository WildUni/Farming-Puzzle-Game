// Text shown on screen, built from plain state. No Phaser imports so it can be unit tested.
import type { GameMode, GameState, Order, Plot, Crop, CropTable, UpgradeDef } from "../sim/types"
import { TICKS_PER_SECOND, TIMED_MODE_TICKS } from "../sim/game_constants"
import { progress } from "../sim/plot"
import { timeLeft } from "../sim/orders"
import { levelFor } from "../sim/difficulty"
import { lifePriceFor } from "../sim/main"
import { stackCount } from "../sim/upgrades"

const MAX_HEARTS = 5 // more lives than this show as a count

// Lives as hearts: one per life up to MAX_HEARTS, then "♥ xN".
function heartsText(lives: number): string {
    if (lives <= 0) return "none"
    return lives <= MAX_HEARTS ? "♥".repeat(lives) : `♥ x${lives}`
}

// Label on the buy-life button, with the next life's price (upgrades applied).
function buyLifeText(state: GameState): string {
    return `Buy life\n${lifePriceFor(state)} coins`
}

// Text on an upgrade pick card: name, what it does, and the stack count after picking it.
function upgradeCardText(def: UpgradeDef, upgrades: readonly string[]): string {
    return `${def.name}\n${def.text}\n${stackCount(upgrades, def.id) + 1} / ${def.maxStacks}`
}

// Summary on the game-over panel. Levels are shown counted from 1.
// Survival lists how long the run lasted; Timed always lasts the same time, so it
// lists the failed orders instead.
function gameOverText(state: GameState): string {
    const lines = [`Score ${state.score}`, `Orders filled ${state.ordersCompleted}`]
    if (state.mode === "survival") {
        lines.push(
            `Time survived ${formatClock(state.tick)}`,
            `Level reached ${levelFor(state.ordersCompleted) + 1}`
        )
    } else {
        lines.push(`Orders failed ${state.ordersFailed}`)
    }
    return lines.join("\n")
}

// Title on the end-of-run panel: Survival ends when lives run out, Timed when the clock does.
function gameOverTitle(state: GameState): string {
    return state.mode === "timed" ? "Time's up" : "Game over"
}

// Modes the menu offers, in order. Puzzle joins once it has levels.
const PLAYABLE_MODES: GameMode[] = ["survival", "timed"]

function modeName(mode: GameMode): string {
    switch (mode) {
        case "survival":
            return "Survival"
        case "timed":
            return "Timed"
        case "puzzle":
            return "Puzzle"
    }
}

// Mode-picker button: the name, then a one-line description.
function modeButtonText(mode: GameMode): string {
    switch (mode) {
        case "survival":
            return "Survival\nLast as long as you can"
        case "timed":
            return `Timed\nBest score in ${formatClock(TIMED_MODE_TICKS)}`
        case "puzzle":
            return "Puzzle\nSolve handmade levels"
    }
}

// Whole ticks as m:ss, rounding partial seconds up so 0:00 only shows at the very end.
function formatClock(ticks: number): string {
    const seconds = Math.max(0, Math.ceil(ticks / TICKS_PER_SECOND))
    const m = Math.floor(seconds / 60)
    const s = seconds % 60
    return `${m}:${s.toString().padStart(2, "0")}`
}

// Timed mode counts down to the end of the run; other modes count up.
function timerText(state: GameState): string {
    return state.mode === "timed"
        ? formatClock(TIMED_MODE_TICKS - state.tick)
        : formatClock(state.tick)
}

// Label inside a plot square: crop id plus growth, or "empty".
function plotText(plot: Plot, now: number): string {
    switch (plot.state) {
        case "empty":
            return "empty"
        case "growing":
            return `${plot.cropId}\n${Math.floor(progress(plot, now) * 100)}%`
        case "ready":
            return `${plot.cropId}\nREADY`
    }
}

// Text on an order card: one line per required crop, then value and time left.
function orderText(order: Order, state: GameState): string {
    const lines = Object.entries(order.required).map(
        ([cropId, amount]) => `${cropId} x${amount}  (have ${state.inventory[cropId] ?? 0})`
    )
    lines.push(`value ${order.value}   ${formatClock(timeLeft(order, state.tick))}`)
    return `Order #${order.id}\n${lines.join("\n")}`
}

// Rows for the stats table, in display order. Inventory lists every crop, even at 0.
function statRows(state: GameState, crops: CropTable): [string, string][] {
    const survival: [string, string][] =
        state.mode === "survival"
            ? [
                  ["Level", String(levelFor(state.ordersCompleted) + 1)],
                  ["Lives", heartsText(state.lives)],
                  ["Coins", String(state.coins)]
              ]
            : []
    return [
        ["Mode", modeName(state.mode)],
        [state.mode === "timed" ? "Time left" : "Time", timerText(state)],
        ["Score", String(state.score)],
        ...survival,
        ["Filled", String(state.ordersCompleted)],
        ["Failed", String(state.ordersFailed)],
        ...Object.keys(crops)
            .sort()
            .map((id): [string, string] => [id, String(state.inventory[id] ?? 0)])
    ]
}

// Label on a plant-picker button: crop id and how long it takes to grow.
function cropButtonText(crop: Crop): string {
    return `${crop.id}\n${formatClock(crop.growTicks)}`
}

export { formatClock, timerText, plotText, orderText, statRows, cropButtonText }

// Share of an order's own time limit still left, from 1 (just opened) to 0 (last tick).
function orderTimeFraction(order: Order, now: number): number {
    return Math.min(1, timeLeft(order, now) / order.timeLimit)
}

// True in the last quarter of an order's time, when its countdown bar turns red.
function isOrderUrgent(order: Order, now: number): boolean {
    return orderTimeFraction(order, now) <= 0.25
}

const MAX_SEED = 2 ** 32 - 1

// Seed typed on the landing page. Blank means "pick one at random" (undefined);
// anything other than a whole number from 0 to MAX_SEED is rejected (null).
function parseSeed(text: string): number | undefined | null {
    const trimmed = text.trim()
    if (trimmed === "") return undefined
    if (!/^\d+$/.test(trimmed)) return null
    const seed = Number(trimmed)
    return seed <= MAX_SEED ? seed : null
}

// Line shown in the debug overlay.
function debugText(state: GameState, seed: number, paused: boolean): string {
    const pause = paused ? "  PAUSED" : ""
    return `tick ${state.tick}  seed ${seed}  ${state.mode}${pause}\nR restart  L log  P pause`
}

export { orderTimeFraction, isOrderUrgent, parseSeed, debugText, MAX_SEED }
export { heartsText, buyLifeText, upgradeCardText, gameOverText, gameOverTitle }
export { PLAYABLE_MODES, modeName, modeButtonText }
