type RNGState = number
type RNGSeed = number
type GameMode = "survival" | "timed" | "puzzle"
type GameStatus = "running" | "ended"

type RunData = {
    time_left: number
    orders_completed: number
    points: number
}
type Crop = {
    id: string
    growTicks: number
    yield: number
    value: number
}

type CropTable = Record<string, Crop> // cropId -> Crop

type Inventory = Record<string, number> // cropId -> amount held, missing means 0

type Plot =
    | { state: "empty" }
    | { state: "growing"; cropId: string; plantedAt: number }
    | { state: "ready"; cropId: string }

type Order = {
    id: number
    required: Record<string, number> // cropId -> amount
    value: number
    expiresAt: number // last tick the order can be filled; fails on the tick after
}

type GameState = {
    mode: GameMode
    status: GameStatus
    tick: number
    rngState: RNGState
    plots: Plot[]
    inventory: Inventory
    orders: Order[]
    nextOrderId: number
    score: number
    ordersCompleted: number
    ordersFailed: number
}

type Action =
    | { type: "plant"; plot: number; cropId: string }
    | { type: "harvest"; plot: number }
    | { type: "deliver"; orderId: number }

type LogEntry = { tick: number; action: Action }

type GameConfig = {
    mode: GameMode
    allowPowerUps: boolean
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
    CropTable,
    Inventory,
    Action,
    LogEntry
}
