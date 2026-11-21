import type {
    RNGSeed,
    GameConfig,
    GameState,
    Plot,
    Action,
    CropTable,
    OrderRules,
    Pool
} from "./types"
import { randomInt, seedRNG, seedStream } from "./mulberry"
import {
    START_PLOTS,
    TIMED_MODE_TICKS,
    DEFAULT_ORDER_RULES,
    ORDERS_PER_UPGRADE
} from "./game_constants"
import { plant, harvest, updateGrowth } from "./plot"
import { createOrder, fulfill, isExpired } from "./orders"
import { DIFFICULTY, levelFor, orderRulesFor, lifePrice } from "./difficulty"
import { UPGRADES, modifiersFor, modifiersAt, scalePct, rollOffer, validTargets } from "./upgrades"
import { tickEffects, startEffect, cutGrowth, finishGrowth } from "./effects"
import { POWER_UPS, rollDrop, canUsePowerUp, durationFor } from "./powerups"

// Salts for the separate streams. The orders stream uses the seed itself (see specs/mulberry.md).
const UPGRADE_STREAM_SALT = 1
const HARVEST_STREAM_SALT = 2
const DROPS_STREAM_SALT = 3

function createGame(seed: RNGSeed, config: GameConfig): GameState {
    return {
        mode: config.mode,
        status: "running",
        tick: 0,
        rng: {
            orders: seedRNG(seed),
            upgrades: seedStream(seed, UPGRADE_STREAM_SALT),
            harvest: seedStream(seed, HARVEST_STREAM_SALT),
            drops: seedStream(seed, DROPS_STREAM_SALT)
        },
        plots: Array.from({ length: START_PLOTS }, (): Plot => ({ state: "empty" })),
        inventory: {},
        orders: [],
        nextOrderId: 0,
        score: 0,
        ordersCompleted: 0,
        ordersFailed: 0,
        lives: config.mode === "survival" ? DIFFICULTY.startLives : 0,
        coins: 0,
        livesBought: 0,
        upgrades: [],
        upgradeOffer: null,
        offersMade: 0,
        allowPowerUps: config.allowPowerUps,
        powerUps: [],
        activeEffects: []
    }
}

// The rules step uses for new orders: the current level in Survival, fixed otherwise.
// Survival order timers are scaled by the orderTimePct upgrade modifier.
function orderRules(state: GameState): OrderRules {
    if (state.mode !== "survival") return DEFAULT_ORDER_RULES
    const rules = orderRulesFor(levelFor(state.ordersCompleted))
    const { orderTimePct } = modifiersFor(state.upgrades)
    return { ...rules, orderTicks: scalePct(rules.orderTicks, orderTimePct) }
}

// Price of the next life, with the lifePricePct upgrade modifier applied.
function lifePriceFor(state: GameState): number {
    return scalePct(lifePrice(state.livesBought), modifiersFor(state.upgrades).lifePricePct)
}

// True when a buyLife action would succeed. The buy button uses this.
function canBuyLife(state: GameState): boolean {
    return (
        state.mode === "survival" &&
        state.status === "running" &&
        state.upgradeOffer === null &&
        state.coins >= lifePriceFor(state)
    )
}

// True if i is a whole number pointing at an existing plot.
function isPlotIndex(state: GameState, i: number): boolean {
    return Number.isInteger(i) && i >= 0 && i < state.plots.length
}

// Copy of plots with one plot swapped out. Untouched plots are shared.
function replacePlot(plots: Plot[], i: number, plot: Plot): Plot[] {
    return plots.map((p, j) => (j === i ? plot : p))
}

// Applies one player move. Returns a new state, or null if the move isn't allowed.
// Never changes `state` or `tick`; only harvest draws (rng.harvest and rng.drops). See specs/main.md.
function applyAction(state: GameState, action: Action, crops: CropTable): GameState | null {
    if (state.status === "ended") return null
    // While an upgrade offer is open the clock is stopped and only the pick is allowed.
    if (state.upgradeOffer !== null && action.type !== "chooseUpgrade") return null

    switch (action.type) {
        case "plant": {
            if (!isPlotIndex(state, action.plot)) return null
            const where = { plot: action.plot, cropId: action.cropId }
            const { growthPct } = modifiersAt(state.upgrades, where)
            const planted = plant(
                state.plots[action.plot],
                action.cropId,
                state.tick,
                crops,
                growthPct
            )
            if (planted === null) return null
            return { ...state, plots: replacePlot(state.plots, action.plot, planted) }
        }

        case "harvest": {
            if (!isPlotIndex(state, action.plot)) return null
            const result = harvest(state.plots[action.plot])
            if (result === null) return null
            const { plot, cropId } = result
            const { yieldBonus, bumperChance } = modifiersAt(state.upgrades, {
                plot: action.plot,
                cropId
            })
            // Bumper harvest: one roll from rng.harvest, only when there is a chance at all.
            let bumper = 0
            let rng = state.rng
            if (bumperChance > 0) {
                const [roll, next] = randomInt(state.rng.harvest, 0, 99)
                if (roll < bumperChance) bumper = 1
                rng = { ...state.rng, harvest: next }
            }
            const amount = crops[cropId].yield + yieldBonus + bumper
            // Power-up drop: rolled from rng.drops whether or not a slot is free.
            const [drop, dropsRng] = rollDrop(state)
            rng = { ...rng, drops: dropsRng }
            const keep =
                drop !== null && state.powerUps.length < modifiersFor(state.upgrades).powerUpSlots
            return {
                ...state,
                rng,
                plots: replacePlot(state.plots, action.plot, plot),
                inventory: {
                    ...state.inventory,
                    [cropId]: (state.inventory[cropId] ?? 0) + amount
                },
                powerUps: keep ? [...state.powerUps, drop] : state.powerUps
            }
        }

        case "deliver": {
            const order = state.orders.find((o) => o.id === action.orderId)
            if (order === undefined || isExpired(order, state.tick)) return null
            const inventory = fulfill(order, state.inventory)
            if (inventory === null) return null
            const pay = DIFFICULTY.coinsPerOrder + modifiersFor(state.upgrades).coinsPerOrder
            return {
                ...state,
                inventory,
                orders: state.orders.filter((o) => o.id !== order.id),
                score: state.score + order.value,
                ordersCompleted: state.ordersCompleted + 1,
                coins: state.mode === "survival" ? state.coins + pay : state.coins
            }
        }

        case "buyLife": {
            if (!canBuyLife(state)) return null
            return {
                ...state,
                coins: state.coins - lifePriceFor(state),
                lives: state.lives + 1,
                livesBought: state.livesBought + 1
            }
        }

        case "chooseUpgrade": {
            const card = state.upgradeOffer?.find((c) => c.id === action.upgradeId)
            if (card === undefined) return null
            const def = UPGRADES.upgrades[card.id]
            const target = action.target ?? null
            if (def.target === null) {
                if (target !== null) return null
            } else {
                const valid = validTargets(state.upgrades, card.id, state.plots.length, crops)
                if (target === null || !valid.includes(target)) return null
            }
            const upgrades = [...state.upgrades, { id: card.id, tier: card.tier, target }]
            // plots.length always equals START_PLOTS + extraPlots (clamped), so a pick past
            // the cap adds nothing.
            const wanted = START_PLOTS + modifiersFor(upgrades).extraPlots
            const added = Array.from(
                { length: Math.max(0, wanted - state.plots.length) },
                (): Plot => ({ state: "empty" })
            )
            return {
                ...state,
                upgrades,
                upgradeOffer: null,
                plots: added.length > 0 ? [...state.plots, ...added] : state.plots
            }
        }

        case "usePowerUp": {
            const target = action.target ?? null
            if (!canUsePowerUp(state, action.slot, target)) return null
            const def = POWER_UPS.powerUps[state.powerUps[action.slot]]
            const used: GameState = {
                ...state,
                powerUps: state.powerUps.filter((_, i) => i !== action.slot)
            }
            const effect = def.effect
            switch (effect.kind) {
                case "finishGrowth": {
                    // canUsePowerUp checked the target is a growing plot.
                    const ready = finishGrowth(state.plots[target as number])!
                    return { ...used, plots: replacePlot(state.plots, target as number, ready) }
                }
                case "cutGrowth":
                    return { ...used, plots: cutGrowth(state.plots, effect.ticks, state.tick) }
                case "grantCoins":
                    return { ...used, coins: state.coins + effect.amount }
                case "growthRate":
                case "orderRate":
                    return {
                        ...used,
                        activeEffects: startEffect(
                            state.activeEffects,
                            def.id,
                            effect,
                            state.tick,
                            durationFor(def, state.upgrades)!
                        )
                    }
            }
            return null
        }

        default:
            // An unknown action type (from a bad log) is refused, not thrown.
            return null
    }
}

// True when the run should end on this tick. Puzzle has no end rule yet.
function isRunOver(state: GameState): boolean {
    switch (state.mode) {
        case "timed":
            return state.tick >= TIMED_MODE_TICKS
        case "survival":
            return state.lives <= 0
        case "puzzle":
            return false
    }
}

// The pool free picks draw from in this mode, or null when the mode makes no offers.
// Only Survival makes offers so far (Timed joins in a later phase).
function offerPool(state: GameState): Pool | null {
    return state.mode === "survival" ? "survival" : null
}

// True when enough orders are filled for the next upgrade offer.
function isOfferDue(state: GameState): boolean {
    return (
        offerPool(state) !== null &&
        state.ordersCompleted >= (state.offersMade + 1) * ORDERS_PER_UPGRADE
    )
}

// Moves the game forward one tick. Returns a new state, or `state` itself once ended
// or while an upgrade offer is open. See specs/main.md for the order of the steps.
function step(state: GameState, crops: CropTable): GameState {
    if (state.status === "ended" || state.upgradeOffer !== null) return state

    // 1. Tick
    const tick = state.tick + 1

    // 2. Effects move crops' and orders' deadlines before growth and failures are checked
    const moved = tickEffects(state.activeEffects, state.plots, state.orders, tick)

    // 3. Growth
    const plots = moved.plots.map((p) => updateGrowth(p, tick))

    // 4. Failed orders
    const open = moved.orders.filter((o) => !isExpired(o, tick))
    const failed = moved.orders.length - open.length
    const ordersFailed = state.ordersFailed + failed
    // Survival: each failed order costs a life, never going below 0.
    const lives = state.mode === "survival" ? Math.max(0, state.lives - failed) : state.lives

    const next: GameState = {
        ...state,
        tick,
        plots,
        orders: open,
        ordersFailed,
        lives,
        activeEffects: moved.active
    }

    // 5. End of run
    if (isRunOver(next)) return { ...next, status: "ended" }

    // 6. New orders, using the rules for the current difficulty
    const rules = orderRules(next)
    const orders = [...open]
    let ordersRng = state.rng.orders
    let nextOrderId = state.nextOrderId
    while (orders.length < rules.maxOpenOrders) {
        const [order, after] = createOrder(nextOrderId, tick, ordersRng, crops, rules)
        orders.push(order)
        ordersRng = after
        nextOrderId += 1
    }

    const withOrders: GameState = {
        ...next,
        orders,
        nextOrderId,
        rng: { ...state.rng, orders: ordersRng }
    }

    // 7. Upgrade offer, drawn from its own stream after the orders
    const pool = offerPool(withOrders)
    if (pool === null || !isOfferDue(withOrders)) return withOrders
    const [offer, upgradesRng] = rollOffer(withOrders, pool, crops)
    return {
        ...withOrders,
        rng: { ...withOrders.rng, upgrades: upgradesRng },
        upgradeOffer: offer.length > 0 ? offer : null,
        offersMade: withOrders.offersMade + 1
    }
}

export { createGame, applyAction, step, canBuyLife, orderRules, lifePriceFor }
