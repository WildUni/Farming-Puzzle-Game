// Text shown on screen, built from plain state. No Phaser imports so it can be unit tested.
import type {
    GameMode,
    GameState,
    Order,
    Plot,
    Crop,
    CropTable,
    OwnedUpgrade,
    ActiveEffect,
    PowerUpDef,
    Tier,
    UpgradeDef,
    UpgradeTarget
} from "../sim/types"
import { TICKS_PER_SECOND } from "../sim/game_constants"
import { MODES, comboPct, upcomingRushWave } from "../sim/modes"
import { progress } from "../sim/plot"
import { timeLeft } from "../sim/orders"
import { runLevel } from "../sim/difficulty"
import { lifePriceFor, maxLivesFor, rerollPriceFor } from "../sim/main"
import { sellValue, storageCap, storageUsed } from "../sim/economy"
import { copyCount, effectAmount } from "../sim/upgrades"
import { POWER_UPS, durationFor } from "../sim/powerups"
import { EVENTS, shieldedPlots } from "../sim/events"
import { appliesTo, fogged } from "../sim/effects"
import { scoreBreakdown } from "../sim/scoring"
import type { ScoreLineKind } from "../sim/scoring"

const MAX_HEARTS = 5 // a cap above this shows lives as a count

// Lives as hearts: a full heart per life and an empty one up to the cap `max`, e.g. "♥♥♡".
// Past MAX_HEARTS, "♥ xN".
function heartsText(lives: number, max: number = lives): string {
    const held = Math.max(0, lives)
    const cap = Math.max(held, max)
    if (cap > MAX_HEARTS) return `♥ x${held}`
    if (cap === 0) return "none"
    return "♥".repeat(held) + "♡".repeat(cap - held)
}

// Label on the buy-life button: the next life's price (upgrades applied), or "Lives full" at
// the cap.
function buyLifeText(state: GameState): string {
    if (state.lives >= maxLivesFor(state)) return "Lives full"
    return `Buy life\n${lifePriceFor(state)} coins`
}

// Tier name as shown on a card, e.g. "Rare".
function tierName(tier: Tier): string {
    return tier.charAt(0).toUpperCase() + tier.slice(1)
}

// An upgrade's one-line description with {0}, {1}, ... replaced by each effect's size at `tier`.
function upgradeDescription(def: UpgradeDef, tier: Tier): string {
    return def.text.replace(/\{(\d+)\}/g, (match, i: string) => {
        const n = Number(i)
        return n < def.effects.length ? String(Math.abs(effectAmount(def, n, tier))) : match
    })
}

// Text on an upgrade pick card: name, tier, what it does at that tier, and the copy count
// after picking it.
function upgradeCardText(def: UpgradeDef, tier: Tier, upgrades: readonly OwnedUpgrade[]): string {
    const copies = `${copyCount(upgrades, def.id) + 1} / ${def.maxCopies}`
    return `${def.name}
${tierName(tier)}
${upgradeDescription(def, tier)}
${copies}`
}

// Title of the target step after a targeted card is clicked.
function targetTitle(def: UpgradeDef): string {
    return def.target === "plot" ? "Choose a plot" : "Choose a crop"
}

// Label on a target button: plots are counted from 1, crops show their id.
function targetText(target: UpgradeTarget): string {
    return typeof target === "number" ? `Plot ${target + 1}` : String(target)
}

// Summary on the game-over panel. Levels are shown counted from 1.
// Both modes list filled and failed orders; Survival also lists how long the run lasted
// (Timed always lasts the same time) and the level reached.
// Label of each end-of-run score line on the summary.
const SCORE_LINE_LABELS: Record<ScoreLineKind, string> = {
    bestCombo: "Best combo bonus",
    failedOrders: "Failed orders",
    coins: "Coins left"
}

// The score part of the summary: order points, each end-of-run line that changed the score
// ("Best combo bonus +140", "Failed orders -15"), then the final score.
function scoreLines(state: GameState): string[] {
    const { orderPoints, lines, total } = scoreBreakdown(state)
    const extra = lines
        .filter((line) => line.points !== 0)
        .map((line) => {
            const sign = line.points > 0 ? "+" : "-"
            return `${SCORE_LINE_LABELS[line.kind]} ${sign}${Math.abs(line.points)}`
        })
    return [`Order points ${orderPoints}`, ...extra, `Final score ${total}`]
}

function gameOverText(state: GameState): string {
    const lines = [
        ...scoreLines(state),
        `Orders filled ${state.ordersCompleted}`,
        `Orders failed ${state.ordersFailed}`
    ]
    if (state.mode === "survival") {
        lines.push(
            `Time survived ${formatClock(state.tick)}`,
            `Level reached ${runLevel(state) + 1}`
        )
    } else if (state.mode === "timed") {
        lines.push(`Best combo ${state.bestCombo}`)
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
            return `Timed\nBest score in ${formatClock(MODES.timed.runTicks)}`
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
        ? formatClock(MODES.timed.runTicks - state.tick)
        : formatClock(state.tick)
}

// True while Fog hides growth and order timers.
function isFogged(state: GameState): boolean {
    return fogged(state.activeEffects, state.tick)
}

// Label inside a plot square: crop id plus growth, or "empty". In fog the growth shows as "?".
function plotText(plot: Plot, now: number, fog = false): string {
    switch (plot.state) {
        case "empty":
            return "empty"
        case "growing":
            return `${plot.cropId}\n${fog ? "?" : `${Math.floor(progress(plot, now) * 100)}%`}`
        case "ready":
            return `${plot.cropId}\nREADY`
    }
}

// Text on an order card: one line per required crop, then value and time left ("?:??" in fog).
function orderText(order: Order, state: GameState): string {
    const lines = Object.entries(order.required).map(
        ([cropId, amount]) => `${cropId} x${amount}  (have ${state.inventory[cropId] ?? 0})`
    )
    const time = isFogged(state) ? "?:??" : formatClock(timeLeft(order, state.tick))
    lines.push(`value ${order.value}   ${time}`)
    return `${orderTitle(order)}\n${lines.join("\n")}`
}

// First line of an order card. "RUSH" marks a rush wave order, "SMALL" one Small order halved.
function orderTitle(order: Order): string {
    const tags = [order.rush ? "RUSH" : "", order.small ? "SMALL" : ""].filter((t) => t !== "")
    return tags.length === 0 ? `Order #${order.id}` : `Order #${order.id}  ${tags.join(" ")}`
}

// Text on the Sneak peek card: the order that comes next, with its crops and value.
function nextOrderText(order: Order): string {
    const lines = Object.entries(order.required).map(([cropId, amount]) => `${cropId} x${amount}`)
    const title = order.small ? "Next order  SMALL" : "Next order"
    return `${title}\n${lines.join("\n")}\nvalue ${order.value}`
}

// Rows for the stats table, in display order. Inventory lists every crop, even at 0.
function statRows(state: GameState, crops: CropTable): [string, string][] {
    const survival: [string, string][] =
        state.mode === "survival"
            ? [
                  ["Level", String(runLevel(state) + 1)],
                  ["Lives", heartsText(state.lives, maxLivesFor(state))],
                  ["Coins", String(state.coins)]
              ]
            : []
    const timed: [string, string][] = state.mode === "timed" ? [["Combo", comboText(state)]] : []
    return [
        ["Mode", modeName(state.mode)],
        [state.mode === "timed" ? "Time left" : "Time", timerText(state)],
        ["Score", String(state.score)],
        ...timed,
        ...survival,
        ["Filled", String(state.ordersCompleted)],
        ["Failed", String(state.ordersFailed)],
        ...Object.keys(crops)
            .sort()
            .map((id): [string, string] => [id, String(state.inventory[id] ?? 0)])
    ]
}

// Combo row: the multiplier the next filled order gets, then the time left to keep the streak.
// "x1" with no streak.
function comboText(state: GameState): string {
    const mult = `x${comboPct(state.combo) / 100}`
    if (state.combo === 0) return mult
    return `${mult} ${formatClock(state.comboEndsAt - state.tick)}`
}

// Label on a plant-picker button: crop id and how long it takes to grow.
function cropButtonText(crop: Crop): string {
    return `${crop.id}\n${formatClock(crop.growTicks)}`
}

export {
    formatClock,
    timerText,
    comboText,
    plotText,
    orderText,
    nextOrderText,
    statRows,
    cropButtonText
}
export { isFogged }

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
function debugText(state: GameState, seed: number, paused: boolean, debugged = false): string {
    const pause = (paused ? "  PAUSED" : "") + (debugged ? "  DEBUGGED" : "")
    return `tick ${state.tick}  seed ${seed}  ${state.mode}${pause}\nR restart  L log  P pause`
}

export { orderTimeFraction, isOrderUrgent, parseSeed, debugText, MAX_SEED }
export { heartsText, buyLifeText, gameOverText, gameOverTitle }
export { tierName, upgradeDescription, upgradeCardText, targetTitle, targetText }
export { PLAYABLE_MODES, modeName, modeButtonText }

// Text on a power-up slot button: the name, then what it does with {seconds} filled in from
// durationFor, so Long-lasting shows the longer time.
function powerUpButtonText(def: PowerUpDef, upgrades: readonly OwnedUpgrade[]): string {
    const ticks = durationFor(def, upgrades)
    const seconds = ticks === null ? "" : String(Math.ceil(ticks / TICKS_PER_SECOND))
    return `${def.name}\n${def.text.replace(/\{seconds\}/g, seconds)}`
}

// Lasting effects still to run a tick: an effect on its endsAt tick has done its last one.
function runningEffects(state: GameState): ActiveEffect[] {
    return state.activeEffects.filter((a) => a.endsAt > state.tick)
}

// The running effects started by power-ups. Event effects show on the event banner instead.
function shownEffects(state: GameState): ActiveEffect[] {
    return runningEffects(state).filter((a) => a.source in POWER_UPS.powerUps)
}

// "Order freeze 7s": the effect's source name and whole seconds left, rounding up.
function activeEffectText(effect: ActiveEffect, now: number): string {
    const def = POWER_UPS.powerUps[effect.source]
    const name = def === undefined ? effect.source : def.name
    return `${name} ${Math.ceil((effect.endsAt - now) / TICKS_PER_SECOND)}s`
}

// True while an effect stops order timers, so their countdown bars can be drawn frozen.
function ordersFrozen(state: GameState): boolean {
    return runningEffects(state).some((a) => a.effect.kind === "orderRate" && a.effect.pct === 0)
}

// Seconds from `now` until `tick`, rounded up.
function secondsUntil(tick: number, now: number): number {
    return Math.ceil((tick - now) / TICKS_PER_SECOND)
}

// Text on the event banner: "Frost in 4s" or "Moles → Plot 2 in 4s" during the warning,
// "Frost 6s" while a lasting event runs. null when there is nothing to show.
function eventBannerText(state: GameState): string | null {
    const event = state.event
    if (event === null) return null
    const { name } = EVENTS.events[event.id]
    if (state.tick < event.startsAt) {
        const where = event.plot === null ? "" : ` → ${targetText(event.plot)}`
        return `${name}${where} in ${secondsUntil(event.startsAt, state.tick)}s`
    }
    if (state.tick < event.endsAt) return `${name} ${secondsUntil(event.endsAt, state.tick)}s`
    return null
}

// Text on the rush wave banner (Timed): "Rush wave in 3s" during a wave's warning, then
// "Rush wave! 2 left" while any of its orders are open. null otherwise, and once the run ends.
function rushBannerText(state: GameState): string | null {
    if (state.mode !== "timed" || state.status === "ended") return null
    const upcoming = upcomingRushWave(state.tick)
    if (upcoming !== null) return `Rush wave in ${secondsUntil(upcoming.startsAt, state.tick)}s`
    const left = state.orders.filter((o) => o.rush).length
    return left > 0 ? `Rush wave! ${left} left` : null
}

// True when the banner's event is a good one, for its colour.
function eventIsGood(state: GameState): boolean {
    return state.event !== null && EVENTS.events[state.event.id].kind === "good"
}

type PlotOverlay = "target" | "blocked" | "frozen" | "fast" | "worms" | "shield" | "fertilized"

// Markers drawn on each plot: the plot a plot event will hit, harvest blocked, growth stopped or
// slowed, growth sped up, extra crops from Worms, Greenhouse protection, and a fertilized crop.
function plotOverlays(state: GameState): PlotOverlay[][] {
    const { event, tick } = state
    const shielded = shieldedPlots(state)
    const working = state.activeEffects.filter((a) => a.startedAt <= tick && tick < a.endsAt)
    return state.plots.map((_, i) => {
        const marks: PlotOverlay[] = []
        if (event !== null && event.plot === i && tick < event.startsAt) marks.push("target")
        const here = working.filter((a) => appliesTo(a, i))
        if (here.some((a) => a.effect.kind === "blockHarvest")) marks.push("blocked")
        if (here.some((a) => a.effect.kind === "growthRate" && a.effect.pct < 100)) {
            marks.push("frozen")
        }
        if (here.some((a) => a.effect.kind === "growthRate" && a.effect.pct > 100)) {
            marks.push("fast")
        }
        if (here.some((a) => a.effect.kind === "harvestBonus")) marks.push("worms")
        if (shielded.includes(i)) marks.push("shield")
        const plot = state.plots[i]
        if (plot.state === "growing" && plot.fertilized === true) marks.push("fertilized")
        return marks
    })
}

export { powerUpButtonText, shownEffects, activeEffectText, ordersFrozen }
export { eventBannerText, eventIsGood, rushBannerText, plotOverlays }
export type { PlotOverlay }

// The storage bar's label: crops held out of the cap, e.g. "Storage 12 / 25".
function storageText(state: GameState): string {
    return `Storage ${storageUsed(state)} / ${storageCap(state)}`
}

// How full storage is, from 0 to 1, for the storage bar.
function storageFill(state: GameState): number {
    const cap = storageCap(state)
    return cap === Infinity ? 0 : Math.min(1, storageUsed(state) / cap)
}

// True when storage is full and harvests are refused; the bar turns red.
function isStorageFull(state: GameState): boolean {
    return storageUsed(state) >= storageCap(state)
}

// The amount typed in the sell box, as a whole number from 1 to `held` (1 when nothing is
// held). Blank or bad text counts as 1.
function sellAmount(text: string, held: number): number {
    const n = Number.parseInt(text.trim(), 10)
    if (!Number.isFinite(n) || n < 1) return 1
    return Math.max(1, Math.min(n, held))
}

// Label on a crop button in the barn panel: the crop and how many are held.
function barnCropText(cropId: string, state: GameState): string {
    return `${cropId}\n${state.inventory[cropId] ?? 0}`
}

// Label on the Sell button: how many, and the coins they pay.
function sellButtonText(crop: Crop, amount: number): string {
    return `Sell ${amount}\n+${sellValue(crop, amount)} coins`
}

// Label on the Make fertilizer button: what one fertilizer costs in the selected crop, or that
// the Compost upgrade is needed first.
function makeFertilizerText(crop: Crop, allowed = true): string {
    if (!allowed) return "Make fertilizer\nneeds Compost"
    return `Make fertilizer\nuses ${crop.fertilizerCost} ${crop.id}`
}

// Label on the Fertilize button: how many are held.
function fertilizeText(state: GameState): string {
    return `Fertilize\n${state.fertilizer} held`
}

// Label on the upgrade pick screen's reroll button: the next reroll's price.
function rerollText(state: GameState): string {
    return `Reroll\n${rerollPriceFor(state)} coins`
}

export { storageText, storageFill, isStorageFull, sellAmount, barnCropText, sellButtonText }
export { makeFertilizerText, fertilizeText, rerollText }
