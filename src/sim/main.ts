import type { RNGSeed, GameConfig, GameState, Plot, Action, CropTable, OrderRules } from "./types"
import { seedRNG } from "./mulberry"
import {
    START_PLOTS,
    TIMED_MODE_TICKS,
    DEFAULT_ORDER_RULES,
    ORDERS_PER_UPGRADE
} from "./game_constants"
import { plant, harvest, updateGrowth } from "./plot"
import { createOrder, fulfill, isExpired } from "./orders"
import { DIFFICULTY, levelFor, orderRulesFor, lifePrice } from "./difficulty"
import { UPGRADES, modifiersFor, scalePct, rollOffer } from "./upgrades"

function createGame(seed: RNGSeed, config: GameConfig): GameState {
    return {
        mode: config.mode,
        status: "running",
        tick: 0,
        rngState: seedRNG(seed),
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
        offersMade: 0
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
// Never changes `state`, `tick` or `rngState`. See specs/main.md.
function applyAction(state: GameState, action: Action, crops: CropTable): GameState | null {
    if (state.status === "ended") return null
    // While an upgrade offer is open the clock is stopped and only the pick is allowed.
    if (state.upgradeOffer !== null && action.type !== "chooseUpgrade") return null

    switch (action.type) {
        case "plant": {
            if (!isPlotIndex(state, action.plot)) return null
            const { growthPct } = modifiersFor(state.upgrades)
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
            const amount = crops[cropId].yield + modifiersFor(state.upgrades).yieldBonus
            return {
                ...state,
                plots: replacePlot(state.plots, action.plot, plot),
                inventory: {
                    ...state.inventory,
                    [cropId]: (state.inventory[cropId] ?? 0) + amount
                }
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
            const offer = state.upgradeOffer
            if (offer === null || !offer.includes(action.upgradeId)) return null
            const def = UPGRADES[action.upgradeId]
            const added =
                def.stat === "extraPlots"
                    ? Array.from({ length: def.amount }, (): Plot => ({ state: "empty" }))
                    : []
            return {
                ...state,
                upgrades: [...state.upgrades, action.upgradeId],
                upgradeOffer: null,
                plots: added.length > 0 ? [...state.plots, ...added] : state.plots
            }
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

// True when Survival has filled enough orders for the next upgrade offer.
function isOfferDue(state: GameState): boolean {
    return (
        state.mode === "survival" &&
        state.ordersCompleted >= (state.offersMade + 1) * ORDERS_PER_UPGRADE
    )
}

// Moves the game forward one tick. Returns a new state, or `state` itself once ended
// or while an upgrade offer is open. See specs/main.md for the order of the steps.
function step(state: GameState, crops: CropTable): GameState {
    if (state.status === "ended" || state.upgradeOffer !== null) return state

    // 1. Tick
    const tick = state.tick + 1

    // 2. Growth
    const plots = state.plots.map((p) => updateGrowth(p, tick))

    // 3. Failed orders
    const open = state.orders.filter((o) => !isExpired(o, tick))
    const failed = state.orders.length - open.length
    const ordersFailed = state.ordersFailed + failed
    // Survival: each failed order costs a life, never going below 0.
    const lives = state.mode === "survival" ? Math.max(0, state.lives - failed) : state.lives

    const next: GameState = { ...state, tick, plots, orders: open, ordersFailed, lives }

    // 4. End of run
    if (isRunOver(next)) return { ...next, status: "ended" }

    // 5. New orders, using the rules for the current difficulty
    const rules = orderRules(next)
    const orders = [...open]
    let rngState = state.rngState
    let nextOrderId = state.nextOrderId
    while (orders.length < rules.maxOpenOrders) {
        const [order, after] = createOrder(nextOrderId, tick, rngState, crops, rules)
        orders.push(order)
        rngState = after
        nextOrderId += 1
    }

    // 6. Upgrade offer (Survival), drawn after the orders
    if (!isOfferDue(next)) return { ...next, orders, rngState, nextOrderId }
    const [offer, afterOffer] = rollOffer(next.upgrades, rngState)
    return {
        ...next,
        orders,
        rngState: afterOffer,
        nextOrderId,
        upgradeOffer: offer.length > 0 ? offer : null,
        offersMade: next.offersMade + 1
    }
}

export { createGame, applyAction, step, canBuyLife, orderRules, lifePriceFor }
