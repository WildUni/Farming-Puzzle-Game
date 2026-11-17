// Text shown on screen, built from plain state. No Phaser imports so it can be unit tested.
import type { GameState, Order, Plot, Crop, CropTable } from "../sim/types"
import { TICKS_PER_SECOND, TIMED_MODE_TICKS } from "../sim/game_constants"
import { progress } from "../sim/plot"
import { timeLeft } from "../sim/orders"

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
function plotText(plot: Plot, now: number, crops: CropTable): string {
    switch (plot.state) {
        case "empty":
            return "empty"
        case "growing":
            return `${plot.cropId}\n${Math.floor(progress(plot, now, crops) * 100)}%`
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
    return [
        ["Time", timerText(state)],
        ["Score", String(state.score)],
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
