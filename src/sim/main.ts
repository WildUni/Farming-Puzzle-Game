import { RNGSeed, GameConfig, GameState, Order} from "./types";
import { seedRNG } from "./mulberry";
import { START_PLOTS } from "./game_constants";
function createGame(seed:RNGSeed, config:GameConfig): GameState{
    
    
    return {
        mode: config.gameMode,
        tick: 0,
        rngState: seedRNG(seed),
        plots: START_PLOTS,
        inventory: new Map<string, number>(),
        orders: new Array<Order>(),
        score: 0
    }
}

export default createGame