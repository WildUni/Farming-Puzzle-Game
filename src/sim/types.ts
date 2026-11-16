type RNGState = number;
type RNGSeed = number;
type GameMode = 'survival' | 'timed' | 'puzzle'
type GameStatus = "running" | "ended";

type RunData = {
    time_left: number,
    orders_completed: number,
    points: number
}
type Crop = {
    id: string,
    growTicks: number,
    yield: number,
    value: number
}

type CropTable = Record<string, Crop>;  // cropId -> Crop

type Plot =
    | { state: "empty" }
    | { state: "growing", cropId: string, plantedAt: number }
    | { state: "ready", cropId: string };

type Order = {
    id: number,
    required: Record<string, number>,   // cropId -> amount
    value: number,
    expiresAt: number                    // tick when the order fails
}

type GameState = {
    mode: GameMode,
    status: GameStatus,
    tick: number,
    rngState: RNGState,
    plots: Plot[],
    inventory: Record<string, number>,  // cropId -> amount held
    orders: Order[],
    nextOrderId: number,
    score: number,
    ordersCompleted: number,
    ordersFailed: number
}


type GameConfig = {
    mode: GameMode,
    allowPowerUps: boolean,
}




export type {
    RunData,
    GameState,
    GameStatus,
    GameConfig,
    Order,
    Plot,
    RNGState,
    RNGSeed,
    Crop,
    CropTable
}
