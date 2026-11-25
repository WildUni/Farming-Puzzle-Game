// The in-run economy: the storage cap, sell prices, fertilizer and paid upgrade rerolls.
// Numbers come from src/data/economy.json, crops.json and modes.json. See specs/economy.md.
import type { Crop, GameState, Plot } from "./types"
import { MODES } from "./modes"
import { modifiersFor } from "./upgrades"
import { sellRateAt } from "./effects"
import { ECONOMY, fertilizerLocked, validateEconomy } from "./economy_config"
import type { EconomyConfig } from "./economy_config"

// Most crops the run can hold: the mode's cap plus Bigger barn. Puzzle has no cap yet.
function storageCap(state: GameState): number {
    const bonus = modifiersFor(state.upgrades).storageBonus
    switch (state.mode) {
        case "survival":
            return MODES.survival.storageCap + bonus
        case "timed":
            return MODES.timed.storageCap + bonus
        case "puzzle":
            return Infinity
    }
}

// Crops held, every kind added up. Held fertilizer doesn't count.
function storageUsed(state: GameState): number {
    return Object.values(state.inventory).reduce((sum, n) => sum + n, 0)
}

// Crops that still fit, never below 0.
function storageFree(state: GameState): number {
    return Math.max(0, storageCap(state) - storageUsed(state))
}

// Coins for selling `amount` of `crop`, with `bonusPct` (Premium produce's sellPricePct; 100 =
// normal) and `ratePct` (a Price crash's rate; 100 = none) on top of the config's price. The
// total is rounded down once, not each crop.
function sellValue(
    crop: Crop,
    amount: number,
    config: EconomyConfig = ECONOMY,
    bonusPct = 100,
    ratePct = 100
): number {
    return Math.floor((amount * crop.value * config.sellPricePct * bonusPct * ratePct) / 1_000_000)
}

// sellValue with the run's Premium produce bonus and any Price crash working now. The sell
// action and its button use this.
function sellValueFor(state: GameState, crop: Crop, amount: number): number {
    return sellValue(
        crop,
        amount,
        ECONOMY,
        modifiersFor(state.upgrades).sellPricePct,
        sellRateAt(state.activeEffects, state.tick)
    )
}

// True when fertilizer can be made and used in this run.
function fertilizerAllowed(state: GameState, config: EconomyConfig = ECONOMY): boolean {
    if (!fertilizerLocked(config)) return true
    return modifiersFor(state.upgrades).fertilizerUnlocked > 0
}

// The ready tick fertilizer gives a growing plot at `now`: cutPct of the remaining growth time
// removed, rounded down.
function fertilizedReadyAt(
    plot: Extract<Plot, { state: "growing" }>,
    now: number,
    config: EconomyConfig = ECONOMY
): number {
    const left = Math.max(0, plot.readyAt - now)
    return plot.readyAt - Math.floor((left * config.fertilizer.cutPct) / 100)
}

// Plots fertilizer can go on now: growing and not yet fertilized. The screen highlights them.
function fertilizerTargets(state: GameState): number[] {
    return state.plots.flatMap((p, i) =>
        p.state === "growing" && p.fertilized !== true ? [i] : []
    )
}

// Price of the next reroll when `rerolls` have already been bought for the open offer.
function rerollPrice(rerolls: number, config: EconomyConfig = ECONOMY): number {
    return Math.round(config.reroll.base * config.reroll.growth ** rerolls)
}

export {
    validateEconomy,
    ECONOMY,
    fertilizerLocked,
    storageCap,
    storageUsed,
    storageFree,
    sellValue,
    sellValueFor,
    fertilizerAllowed,
    fertilizedReadyAt,
    fertilizerTargets,
    rerollPrice
}
export type { EconomyConfig, FertilizerUnlock } from "./economy_config"
