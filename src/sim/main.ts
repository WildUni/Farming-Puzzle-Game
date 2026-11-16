import { RNGSeed, GameConfig, GameState, Plot } from "./types";
import { seedRNG } from "./mulberry";
import { START_PLOTS } from "./game_constants";

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

export default createGame
