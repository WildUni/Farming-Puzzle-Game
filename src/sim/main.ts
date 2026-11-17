import { RNGSeed, GameConfig, GameState, Plot, Action, CropTable } from "./types";
import { seedRNG } from "./mulberry";
import { START_PLOTS } from "./game_constants";
import { plant, harvest } from "./plot";
import { fulfill, isExpired } from "./orders";

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
        ordersFailed: 0
    }
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

    switch (action.type) {
        case "plant": {
            if (!isPlotIndex(state, action.plot)) return null
            const planted = plant(state.plots[action.plot], action.cropId, state.tick, crops)
            if (planted === null) return null
            return { ...state, plots: replacePlot(state.plots, action.plot, planted) }
        }

        case "harvest": {
            if (!isPlotIndex(state, action.plot)) return null
            const result = harvest(state.plots[action.plot])
            if (result === null) return null
            const { plot, cropId } = result
            return {
                ...state,
                plots: replacePlot(state.plots, action.plot, plot),
                inventory: {
                    ...state.inventory,
                    [cropId]: (state.inventory[cropId] ?? 0) + crops[cropId].yield
                }
            }
        }

        case "deliver": {
            const order = state.orders.find((o) => o.id === action.orderId)
            if (order === undefined || isExpired(order, state.tick)) return null
            const inventory = fulfill(order, state.inventory)
            if (inventory === null) return null
            return {
                ...state,
                inventory,
                orders: state.orders.filter((o) => o.id !== order.id),
                score: state.score + order.value,
                ordersCompleted: state.ordersCompleted + 1
            }
        }
    }
}

export { applyAction }
export default createGame
