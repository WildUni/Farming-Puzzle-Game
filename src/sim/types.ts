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
    | { state: "growing"; cropId: string; plantedAt: number; readyAt: number } // readyAt fixed at planting
    | { state: "ready"; cropId: string }

type Order = {
    id: number
    required: Record<string, number> // cropId -> amount
    value: number
    expiresAt: number // last tick the order can be filled; fails on the tick after
    timeLimit: number // ticks the order was given when created
}

// How step creates orders at the current difficulty.
type OrderRules = {
    maxOpenOrders: number
    orderTicks: number
    minAmount: number
    maxAmount: number
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
    lives: number // Survival only; the run ends at 0
    coins: number // in-run coins, reset every run
    livesBought: number // sets the next life's price
    upgrades: string[] // upgrade ids picked this run, in order; repeats are stacks
    upgradeOffer: string[] | null // ids on offer while the player chooses; time stops while set
    offersMade: number // upgrade offers made this run
}

// What the run's upgrades add up to. Worked out from GameState.upgrades, never stored.
type Modifiers = {
    extraPlots: number // plots added on top of START_PLOTS
    growthPct: number // % of a crop's growTicks; 100 = normal
    yieldBonus: number // extra crops per harvest
    orderTimePct: number // % of the order time limit
    coinsPerOrder: number // extra coins per filled order (Survival)
    lifePricePct: number // % of the normal life price
}

type ModifierStat = keyof Modifiers

type UpgradeDef = {
    id: string
    name: string
    text: string
    stat: ModifierStat
    amount: number // added to `stat` each time the upgrade is picked
    maxStacks: number
}

type UpgradeTable = Record<string, UpgradeDef> // id -> definition

type Action =
    | { type: "plant"; plot: number; cropId: string }
    | { type: "harvest"; plot: number }
    | { type: "deliver"; orderId: number }
    | { type: "buyLife" }
    | { type: "chooseUpgrade"; upgradeId: string }

type LogEntry = { tick: number; action: Action }

type GameConfig = {
    mode: GameMode
    allowPowerUps: boolean
}

export type {
    RunData,
    GameMode,
    GameState,
    GameStatus,
    GameConfig,
    Order,
    OrderRules,
    Plot,
    RNGState,
    RNGSeed,
    Crop,
    CropTable,
    Inventory,
    Action,
    LogEntry,
    Modifiers,
    ModifierStat,
    UpgradeDef,
    UpgradeTable
}
