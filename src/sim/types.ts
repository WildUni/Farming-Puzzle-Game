type RNGState = number;
type RNGSeed = number;

type RunData = {
    time_left: number,
    orders_completed: number,
    points: number
}

type Order = {
    required: Map<string, number>,
    value: number,
    ticks: number
}

type GameState = {
    mode: string,
    tick: number,
    rngState: RNGState,
    plots: number,
    inventory: Map<string, number>,
    orders: Order[],
    score: number
}

type GameConfig = {
    gameMode: string,
    allowPowerUps: boolean,
}
export type {
    RunData,
    GameState,
    GameConfig,
    Order,
    RNGState,
    RNGSeed,

}