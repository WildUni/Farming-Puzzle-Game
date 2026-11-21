type RNGState = number
// One generator per system, so one system's draws never shift another's.
type RNGStreams = { orders: RNGState; upgrades: RNGState; harvest: RNGState; drops: RNGState }
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
    rng: RNGStreams
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
    upgrades: OwnedUpgrade[] // copies picked this run, in pick order
    upgradeOffer: OfferCard[] | null // cards on offer while the player chooses; time stops while set
    offersMade: number // upgrade offers made this run
    allowPowerUps: boolean // copied from GameConfig so the rules can read it
    powerUps: string[] // held power-up ids, one per slot, in drop order
    activeEffects: ActiveEffect[] // lasting effects working right now
}

// What the run's upgrades add up to. Worked out from GameState.upgrades, never stored.
type Modifiers = {
    extraPlots: number // plots added on top of START_PLOTS
    growthPct: number // % of a crop's growTicks; 100 = normal
    yieldBonus: number // extra crops per harvest
    bumperChance: number // % chance that a harvest gives 1 more crop
    orderTimePct: number // % of the order time limit
    coinsPerOrder: number // extra coins per filled order (Survival)
    lifePricePct: number // % of the normal life price
    dropChance: number // % chance that a harvest drops a power-up
    powerUpSlots: number // power-ups the player can hold at once
    powerUpDurationPct: number // % of a lasting power-up's length
}

type ModifierStat = keyof Modifiers

// Game systems an upgrade can need to be on in the run before it is offered.
type GameSystem = "powerUps"

type Tier = "common" | "uncommon" | "rare" | "epic" | "legendary"
type Pool = "survival" | "timed" | "shop"

type StatDef = { base: number; min: number; max: number } // the total is clamped to [min, max]
type TierDef = { weight: number; sellPrice: number }

// amounts: five values (common first) for a tiered upgrade, one for a non-tiered one.
type UpgradeEffect = { stat: ModifierStat; amounts: number[] }

type UpgradeDef = {
    id: string
    name: string
    text: string // {0}, {1}, ... are replaced by each effect's size at the card's tier
    pools: Pool[]
    tier: Tier | null // null = tiered (exists at every tier)
    maxCopies: number
    sellable: boolean
    effects: UpgradeEffect[]
    target: "plot" | "crop" | null
    targetRule: "oncePerTarget" | "stackable" | null // null exactly when target is null
    requires: string[]
    category: string | null
    needs: GameSystem[]
}

type UpgradeConfig = {
    stats: Record<ModifierStat, StatDef>
    tiers: Record<Tier, TierDef>
    upgrades: Record<string, UpgradeDef> // id -> definition
}

type UpgradeTarget = number | string | null // plot index, crop id, or null when untargeted
type OwnedUpgrade = { id: string; tier: Tier; target: UpgradeTarget }
type OfferCard = { id: string; tier: Tier }

type Action =
    | { type: "plant"; plot: number; cropId: string }
    | { type: "harvest"; plot: number }
    | { type: "deliver"; orderId: number }
    | { type: "buyLife" }
    | { type: "chooseUpgrade"; upgradeId: string; target?: number | string }
    | { type: "usePowerUp"; slot: number; target?: number }

// Effects move crops' and orders' clocks. See specs/effects.md.
type LastingEffect =
    | { kind: "growthRate"; pct: number } // growing crops' clocks run at pct% of normal
    | { kind: "orderRate"; pct: number } // open orders' timers run at pct% of normal

type InstantEffect =
    | { kind: "cutGrowth"; ticks: number } // every growing crop gets this many ticks closer
    | { kind: "finishGrowth" } // one growing crop becomes ready now (targets a plot)
    | { kind: "grantCoins"; amount: number }

type Effect = LastingEffect | InstantEffect

type ActiveEffect = {
    source: string // power-up id (later: event id)
    effect: LastingEffect
    startedAt: number // tick it started on
    endsAt: number // last tick it moves a clock on
}

// Power-ups. See specs/powerups.md.
type PowerUpDef = {
    id: string
    name: string
    text: string // {seconds} is replaced by the length after powerUpDurationPct
    modes: GameMode[]
    weight: number
    durationTicks: number | null // lasting effects only
    effect: Effect
    target: "plot" | null
}

type PowerUpConfig = { powerUps: Record<string, PowerUpDef> } // id -> definition

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
    RNGStreams,
    Tier,
    Pool,
    StatDef,
    TierDef,
    UpgradeEffect,
    UpgradeDef,
    UpgradeConfig,
    UpgradeTarget,
    OwnedUpgrade,
    OfferCard,
    GameSystem,
    LastingEffect,
    InstantEffect,
    Effect,
    ActiveEffect,
    PowerUpDef,
    PowerUpConfig
}
