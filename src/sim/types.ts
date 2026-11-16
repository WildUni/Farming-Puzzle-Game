type RNGState = number;
type RNGSeed = number;

type RunData = {
    time_left: number,
    orders_completed: number,
    points: number
}

// A plot stores the tick it was planted on, not a countdown, so step()
// doesn't need to touch every plot each tick.
// Growth progress = (tick - plantedAt) / crop.growTicks.
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

type GameStatus = "running" | "ended";

type GameState = {
    mode: string,
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
    gameMode: string,
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
}
