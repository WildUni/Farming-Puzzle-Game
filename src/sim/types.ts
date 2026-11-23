type RNGState = number
// One generator per system, so one system's draws never shift another's.
type RNGStreams = {
    orders: RNGState
    upgrades: RNGState
    harvest: RNGState
    drops: RNGState
    events: RNGState
    lives: RNGState // Second chance rolls
    shrink: RNGState // Small order rolls
    rush: RNGState // Timed rush wave orders
}
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
    small: boolean // Small order halved its amounts
    rush: boolean // a Timed rush wave added it
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
    allowEvents: boolean // copied from GameConfig so the rules can read it
    event: RunEvent | null // the announced or running event
    nextEventAt: number // first tick a new event may be announced on
    secondWind: boolean // Survival: a life was lost, so the next new order gets Second wind time
    combo: number // Timed: orders filled in a row; sets the score multiplier (comboPct)
    comboEndsAt: number // Timed: last tick the streak survives without another fill (0 with no streak)
    bestCombo: number // Timed: longest streak this run
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
    warnBonusSeconds: number // extra seconds of warning before an event
    goodEventPct: number // % chance an announced event is a good one
    eventGapPct: number // % of the gap between events
    rainCutPct: number // % of Rain shower's growth cut
    sunnyDurationPct: number // % of Sunny spell's length
    deliverBonusPct: number // % of Generous customer's bonus coins
    frostDurationPct: number // % of Frost's length
    crowDurationPct: number // % of Crows' length
    moleBlockChance: number // % chance Moles do nothing
    shielded: number // 1 on a Greenhouse plot: bad events skip it
    bumperExtra: number // crops a Bumper harvest roll adds when it hits
    smallOrderChance: number // % chance a new order asks for half as many crops
    sneakPeek: number // 1: the next order is shown before it arrives
    crowBan: number // 1: Crows never come (Pest control)
    earlyBirdCoins: number // coins for filling an order with at least half its time left (Survival)
    levelPacePct: number // % of filled orders a Survival level takes; 120 = levels come 20% slower
    extraLives: number // lives added on top of the starting lives (Survival)
    lastStandGrowthPct: number // % of growth time for crops planted on the last life (Survival)
    secondChance: number // % chance a failed order costs no life (Survival)
    secondWindPct: number // % of the time limit of the first new order after a lost life
    wormBonusPct: number // % of Worms' extra crops
    neighborReplant: number // 1: Helpful neighbor replants what they harvest
    birdPlotsPct: number // % of the plots Birds seed
    rotPct: number // % of Rot's share of storage
    fogDurationPct: number // % of Fog's length
    emergencyTimePct: number // % of an Emergency order's time share
}

type ModifierStat = keyof Modifiers

// Game systems an upgrade can need to be on in the run before it is offered.
type GameSystem = "powerUps" | "events"

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
    | { type: "usePowerUp"; slot: number; target?: number } // plot index, or order id
    | { type: "scareCrows"; plot: number }

// Effects move crops' and orders' clocks. See specs/effects.md.
type LastingEffect =
    | { kind: "growthRate"; pct: number } // growing crops' clocks run at pct% of normal
    | { kind: "orderRate"; pct: number } // open orders' timers run at pct% of normal
    | { kind: "blockHarvest"; plots: number } // harvest is refused on `only` (Crows land on up to `plots`)
    | { kind: "deliverBonus"; coins: number } // each delivery pays this many more coins (Survival)
    | { kind: "harvestBonus"; crops: number } // each harvest adds this many more crops
    | { kind: "fog" } // growth and order timers are hidden on screen; no rule changes

type InstantEffect =
    | { kind: "cutGrowth"; ticks: number } // every growing crop gets this many ticks closer
    | { kind: "finishGrowth" } // one growing crop becomes ready now (targets a plot)
    | { kind: "grantCoins"; amount: number }
    | { kind: "stealCrop" } // one plot's crop is lost (targets a plot)
    | { kind: "finishAll" } // every growing crop becomes ready now
    | { kind: "clearField" } // every plot becomes empty
    | { kind: "fillOrder" } // one open order is filled without crops (targets an order)
    | { kind: "fillAllOrders" } // every open order is filled without crops, for no score
    | { kind: "goodEvent" } // a random good event is announced now
    | { kind: "harvestAll" } // every ready crop is harvested for the player
    | { kind: "seedPlots"; plots: number } // random seeds land on up to this many empty plots
    | { kind: "addOrder"; timePct: number } // an extra order with timePct% of the usual time
    | { kind: "rotStorage"; pct: number } // this % of each stored crop is lost, rounded down

type Effect = LastingEffect | InstantEffect

type ActiveEffect = {
    source: string // power-up id or event id
    effect: LastingEffect
    startedAt: number // tick it started on
    endsAt: number // startedAt + length
    exclude: number[] // plots it leaves out, ascending
    only: number[] | null // the plots it works on, ascending; null for every plot
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
    target: "plot" | "order" | null
    needs: GameSystem[] // systems the run must have on for it to drop or be used
}

type PowerUpConfig = { powerUps: Record<string, PowerUpDef> } // id -> definition

// Events. See specs/events.md.
type EventKind = "good" | "bad"

type EventDef = {
    id: string
    name: string
    kind: EventKind
    modes: GameMode[]
    weight: number
    warnTicks: number
    durationTicks: number | null // lasting effects only
    effect: Effect
    target: "plot" | null
    durationStat: ModifierStat | null // a ...Pct stat scaling the length
    amountStat: ModifierStat | null // a ...Pct stat scaling the effect's amount
    blockStat: ModifierStat | null // a ...Chance stat: % chance the event does nothing
    banStat: ModifierStat | null // a ...Ban stat: above 0, the event is never announced
}

type EventConfig = {
    firstEventTicks: number
    timedGapTicks: number
    events: Record<string, EventDef> // id -> definition
}

// The announced or running event. Every number is fixed at announcement.
type RunEvent = {
    id: string
    announcedAt: number
    startsAt: number // the tick it fires on
    endsAt: number // startsAt + length; equals startsAt for instant events
    plot: number | null // the target, for plot events
    amount: number | null // effect amount after amountStat
}

type LogEntry = { tick: number; action: Action }

type GameConfig = {
    mode: GameMode
    allowPowerUps: boolean
    allowEvents: boolean
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
    PowerUpConfig,
    EventKind,
    EventDef,
    EventConfig,
    RunEvent
}
