import { describe, it, expect } from "vitest"
import {
    createGame,
    applyAction,
    step,
    canBuyLife,
    canReroll,
    rerollPriceFor,
    orderRules,
    lifePriceFor,
    maxLivesFor,
    withUpgrade,
    nextOrderPreview,
    canUseMiracleGrow,
    miracleTargets,
    miracleRechargeTicks
} from "./main"
import { buildCropTable, updateGrowth } from "./plot"
import { createOrder } from "./orders"
import { nextValue, randomInt, seedRNG, seedStream } from "./mulberry"
import {
    START_PLOTS,
    MAX_OPEN_ORDERS,
    ORDER_TICKS,
    DEFAULT_ORDER_RULES,
    ORDERS_PER_UPGRADE,
    UPGRADE_CHOICES,
    TICKS_PER_SECOND
} from "./game_constants"
import { DIFFICULTY, lifePrice, levelFor, orderRulesFor, runLevel } from "./difficulty"
import { MODES, comboPct, rushWaveAt } from "./modes"
import { SCORING, comboPctFor, fillBonusPct, isFinale, isPairFill, orderPoints } from "./scoring"
import {
    UPGRADES,
    effectAmount,
    eligibleUpgrades,
    modifiersFor,
    rollOffer,
    scalePct
} from "./upgrades"
import { EVENTS } from "./events"
import { POWER_UPS } from "./powerups"
import {
    ECONOMY,
    sellValue,
    sellValueFor,
    storageCap,
    fertilizedReadyAt,
    rerollPrice
} from "./economy"
import type {
    Action,
    Crop,
    GameConfig,
    GameState,
    OfferCard,
    Order,
    OwnedUpgrade,
    Plot,
    Tier
} from "./types"

const config: GameConfig = { mode: "survival", allowPowerUps: false, allowEvents: false }
const timed: GameConfig = { mode: "timed", allowPowerUps: false, allowEvents: false }

const cropList: Crop[] = [
    { id: "garlic", growTicks: 80, yield: 2, value: 2, fertilizerCost: 4 },
    { id: "carrot", growTicks: 150, yield: 2, value: 8, fertilizerCost: 2 },
    { id: "pumpkin", growTicks: 250, yield: 5, value: 12, fertilizerCost: 1 }
]
const crops = buildCropTable(cropList)

// A fresh game with some fields replaced, for setting up a test.
function makeState(overrides: Partial<GameState> = {}): GameState {
    return { ...createGame(1, config), ...overrides }
}

// The same, starting from a fresh Timed game.
function makeTimed(overrides: Partial<GameState> = {}): GameState {
    return { ...createGame(1, timed), ...overrides }
}

function makeOrder(overrides: Partial<Order> = {}): Order {
    return {
        id: 0,
        required: { carrot: 3 },
        value: 24,
        expiresAt: 600,
        timeLimit: 600,
        small: false,
        rush: false,
        tip: 0,
        mixed: false,
        giant: null,
        ...overrides
    }
}

function card(id: string, tier: Tier = "common"): OfferCard {
    return { id, tier }
}

function own(id: string, tier: Tier = "common", target: number | string | null = null) {
    return { id, tier, target } satisfies OwnedUpgrade
}

// An open offer of shipped upgrades, for tests that set one up by hand.
const OFFER: OfferCard[] = [card("bigTips"), card("lifeDiscount", "rare"), card("fastGrowth")]

// Applies an action that is expected to succeed.
function apply(state: GameState, action: Action): GameState {
    const next = applyAction(state, action, crops)
    if (next === null) throw new Error(`expected ${JSON.stringify(action)} to succeed`)
    return next
}

describe("createGame", () => {
    it("starts with a fresh state", () => {
        const g = createGame(1, config)
        expect(g.mode).toBe("survival")
        expect(g.tick).toBe(0)
        expect(g.score).toBe(0)
        expect(g.status).toBe("running")
        expect(g.plots).toHaveLength(START_PLOTS)
        expect(g.plots.every((p) => p.state === "empty")).toBe(true)
        expect(g.orders).toEqual([])
        expect(g.inventory).toEqual({})
        expect(g.nextOrderId).toBe(0)
        expect(g.ordersCompleted).toBe(0)
        expect(g.ordersFailed).toBe(0)
        expect(g.lives).toBe(MODES.survival.startLives)
        expect(g.coins).toBe(0)
        expect(g.livesBought).toBe(0)
        expect(g.upgrades).toEqual([])
        expect(g.upgradeOffer).toBeNull()
        expect(g.offersMade).toBe(0)
        expect(g.rng).toEqual({
            orders: seedRNG(1),
            upgrades: seedStream(1, 1),
            harvest: seedStream(1, 2),
            drops: seedStream(1, 3),
            events: seedStream(1, 4),
            lives: seedStream(1, 5),
            shrink: seedStream(1, 6),
            rush: seedStream(1, 7),
            shop: seedStream(1, 8)
        })
        expect(g.shop).toEqual({ open: false, stock: null, freeRestocks: 0, restockProgress: 0 })
        expect(g.secondWind).toBe(false)
        expect(g.allowEvents).toBe(false)
        expect(g.event).toBeNull()
        expect(g.nextEventAt).toBe(EVENTS.firstEventTicks)
        expect(g.allowPowerUps).toBe(false)
        expect(g.powerUps).toEqual([])
        expect(g.activeEffects).toEqual([])
        expect(
            createGame(1, { ...config, allowPowerUps: true, allowEvents: false }).allowPowerUps
        ).toBe(true)
    })

    it("gives Timed runs no lives", () => {
        expect(createGame(1, timed).lives).toBe(0)
    })

    it("always starts a new run with 0 coins", () => {
        for (const seed of [0, 1, 2, 99, 2 ** 32 - 1, -5]) {
            for (const mode of ["survival", "timed", "puzzle"] as const) {
                expect(
                    createGame(seed, { mode, allowPowerUps: false, allowEvents: false }).coins
                ).toBe(0)
            }
        }
    })

    it("is reproducible from the same seed", () => {
        expect(createGame(7, config)).toEqual(createGame(7, config))
    })
})

describe("applyAction: every action", () => {
    // One valid example of each action, with a state it succeeds on.
    const cases: [string, GameState, Action][] = [
        ["plant", makeState({ tick: 5 }), { type: "plant", plot: 0, cropId: "carrot" }],
        [
            "harvest",
            makeState({ plots: [{ state: "ready", cropId: "carrot" }] }),
            { type: "harvest", plot: 0 }
        ],
        [
            "deliver",
            makeState({ orders: [makeOrder()], inventory: { carrot: 3 } }),
            { type: "deliver", orderId: 0 }
        ],
        ["buyLife", makeState({ coins: 1000, lives: 1 }), { type: "buyLife" }],
        [
            "scareCrows",
            makeState({
                activeEffects: [
                    {
                        source: "crows",
                        effect: { kind: "blockHarvest", plots: 2 },
                        startedAt: 0,
                        endsAt: 10,
                        exclude: [],
                        only: [0]
                    }
                ]
            }),
            { type: "scareCrows", plot: 0 }
        ],
        [
            "chooseUpgrade",
            makeState({ upgradeOffer: OFFER }),
            { type: "chooseUpgrade", upgradeId: "bigTips" }
        ]
    ]

    it.each(cases)("%s succeeds on the setup state", (_, state, action) => {
        expect(applyAction(state, action, crops)).not.toBeNull()
    })

    it.each(cases)("%s returns null once the game has ended", (_, state, action) => {
        expect(applyAction({ ...state, status: "ended" }, action, crops)).toBeNull()
    })

    it.each(cases)("%s never changes the state passed in", (_, state, action) => {
        const before = structuredClone(state)
        applyAction(state, action, crops)
        expect(state).toEqual(before)
    })

    it.each(cases)("%s leaves tick and rng unchanged", (_, state, action) => {
        const next = apply(state, action)
        expect(next.tick).toBe(state.tick)
        expect(next.rng).toEqual(state.rng)
    })
})

describe("applyAction: plant", () => {
    it("plants on an empty plot at the current tick and leaves other plots alone", () => {
        const state = makeState({ tick: 42 })
        const next = apply(state, { type: "plant", plot: 2, cropId: "pumpkin" })
        expect(next.plots[2]).toEqual({
            state: "growing",
            cropId: "pumpkin",
            plantedAt: 42,
            readyAt: 42 + crops.pumpkin.growTicks
        })
        for (const i of [0, 1, 3]) expect(next.plots[i]).toEqual(state.plots[i])
        expect(next.inventory).toEqual(state.inventory)
        expect(next.score).toBe(state.score)
    })

    it("returns null for a busy plot", () => {
        const state = makeState({
            plots: [
                { state: "growing", cropId: "carrot", plantedAt: 0, readyAt: 150 },
                { state: "ready", cropId: "carrot" }
            ]
        })
        expect(applyAction(state, { type: "plant", plot: 0, cropId: "garlic" }, crops)).toBeNull()
        expect(applyAction(state, { type: "plant", plot: 1, cropId: "garlic" }, crops)).toBeNull()
    })

    it("returns null for an unknown crop", () => {
        expect(
            applyAction(makeState(), { type: "plant", plot: 0, cropId: "mango" }, crops)
        ).toBeNull()
        expect(
            applyAction(makeState(), { type: "plant", plot: 0, cropId: "toString" }, crops)
        ).toBeNull()
    })

    it.each([-1, START_PLOTS, 1.5, NaN])("returns null for plot index %s", (plot) => {
        expect(
            applyAction(makeState(), { type: "plant", plot, cropId: "carrot" }, crops)
        ).toBeNull()
    })
})

describe("applyAction: harvest", () => {
    it("empties a ready plot and adds the yield to the inventory", () => {
        const state = makeState({
            plots: [{ state: "empty" }, { state: "ready", cropId: "pumpkin" }]
        })
        const next = apply(state, { type: "harvest", plot: 1 })
        expect(next.plots[1]).toEqual({ state: "empty" })
        expect(next.inventory).toEqual({ pumpkin: crops.pumpkin.yield })
    })

    it("adds to crops already held and keeps other crops", () => {
        const state = makeState({
            plots: [{ state: "ready", cropId: "carrot" }],
            inventory: { carrot: 3, garlic: 1 }
        })
        const next = apply(state, { type: "harvest", plot: 0 })
        expect(next.inventory).toEqual({ carrot: 3 + crops.carrot.yield, garlic: 1 })
    })

    it("returns null for an empty or growing plot", () => {
        const state = makeState({
            plots: [
                { state: "empty" },
                { state: "growing", cropId: "carrot", plantedAt: 0, readyAt: 150 }
            ]
        })
        expect(applyAction(state, { type: "harvest", plot: 0 }, crops)).toBeNull()
        expect(applyAction(state, { type: "harvest", plot: 1 }, crops)).toBeNull()
    })

    it.each([-1, START_PLOTS, 0.5])("returns null for plot index %s", (plot) => {
        expect(applyAction(makeState(), { type: "harvest", plot }, crops)).toBeNull()
    })
})

describe("applyAction: deliver", () => {
    it("fills the order: removes it, takes the crops, adds score and the counter", () => {
        const order = makeOrder({ id: 4, required: { carrot: 3 }, value: 24 })
        const state = makeState({ orders: [order], inventory: { carrot: 5, garlic: 2 }, score: 10 })
        const next = apply(state, { type: "deliver", orderId: 4 })
        expect(next.orders).toEqual([])
        expect(next.inventory).toEqual({ carrot: 2, garlic: 2 })
        expect(next.score).toBe(34)
        expect(next.ordersCompleted).toBe(1)
        expect(next.ordersFailed).toBe(0)
        expect(next.nextOrderId).toBe(state.nextOrderId)
    })

    it("pays coinsPerOrder coins in Survival", () => {
        const state = makeState({ orders: [makeOrder()], inventory: { carrot: 3 }, coins: 2 })
        expect(apply(state, { type: "deliver", orderId: 0 }).coins).toBe(
            2 + DIFFICULTY.coinsPerOrder
        )
    })

    it("pays the same coinsPerOrder coins in Timed", () => {
        const state = makeTimed({ orders: [makeOrder()], inventory: { carrot: 3 }, coins: 2 })
        expect(apply(state, { type: "deliver", orderId: 0 }).coins).toBe(
            2 + DIFFICULTY.coinsPerOrder
        )
    })

    it("pays Big tips and Early bird in Timed too", () => {
        const order = makeOrder({ expiresAt: 600, timeLimit: 600 })
        const upgrades = [own("bigTips", "rare"), own("earlyBird", "rare")]
        const state = makeTimed({ orders: [order], inventory: { carrot: 3 }, upgrades })
        const extra =
            effectAmount(UPGRADES.upgrades.bigTips, 0, "rare") +
            effectAmount(UPGRADES.upgrades.earlyBird, 0, "rare")
        expect(apply(state, { type: "deliver", orderId: 0 }).coins).toBe(
            DIFFICULTY.coinsPerOrder + extra
        )
    })

    it("removes crops that drop to 0", () => {
        const state = makeState({ orders: [makeOrder()], inventory: { carrot: 3 } })
        expect(apply(state, { type: "deliver", orderId: 0 }).inventory).toEqual({})
    })

    it("leaves other orders in place and in order", () => {
        const a = makeOrder({ id: 1 })
        const b = makeOrder({ id: 2, required: { garlic: 2 }, value: 4 })
        const c = makeOrder({ id: 3 })
        const state = makeState({ orders: [a, b, c], inventory: { garlic: 2 } })
        expect(apply(state, { type: "deliver", orderId: 2 }).orders).toEqual([a, c])
    })

    it("returns null when the inventory is short", () => {
        const state = makeState({ orders: [makeOrder()], inventory: { carrot: 2 } })
        expect(applyAction(state, { type: "deliver", orderId: 0 }, crops)).toBeNull()
    })

    it("returns null for an unknown order id", () => {
        const state = makeState({ orders: [makeOrder({ id: 0 })], inventory: { carrot: 9 } })
        expect(applyAction(state, { type: "deliver", orderId: 1 }, crops)).toBeNull()
    })

    it("returns null for an order delivered twice", () => {
        const state = makeState({ orders: [makeOrder()], inventory: { carrot: 9 } })
        const once = apply(state, { type: "deliver", orderId: 0 })
        expect(applyAction(once, { type: "deliver", orderId: 0 }, crops)).toBeNull()
    })

    it("allows delivery on the expiration tick and refuses it the tick after", () => {
        const order = makeOrder({ expiresAt: 60 })
        const state = makeState({ orders: [order], inventory: { carrot: 3 } })
        const deliver: Action = { type: "deliver", orderId: 0 }
        expect(applyAction({ ...state, tick: 59 }, deliver, crops)).not.toBeNull()
        expect(applyAction({ ...state, tick: 60 }, deliver, crops)).not.toBeNull()
        expect(applyAction({ ...state, tick: 61 }, deliver, crops)).toBeNull()
        expect(applyAction({ ...state, tick: 100 }, deliver, crops)).toBeNull()
    })
})

describe("applyAction: buyLife", () => {
    const buy: Action = { type: "buyLife" }

    it("takes the price, adds a life and counts the purchase", () => {
        const price = lifePrice(0)
        const state = makeState({ coins: price + 3, orders: [makeOrder()], score: 40, lives: 1 })
        const next = apply(state, buy)
        expect(next.coins).toBe(3)
        expect(next.lives).toBe(state.lives + 1)
        expect(next.livesBought).toBe(1)
        expect({ ...next, coins: 0, lives: 0, livesBought: 0 }).toEqual({
            ...state,
            coins: 0,
            lives: 0,
            livesBought: 0
        })
    })

    it("charges the config's price sequence for lives bought in a row", () => {
        // Lose a life after each purchase, so the cap never stops the next one.
        let state = makeState({ coins: 100_000, lives: 1 })
        const paid: number[] = []
        for (let i = 0; i < 6; i++) {
            const next = apply(state, buy)
            expect(next.lives).toBe(2)
            paid.push(state.coins - next.coins)
            state = { ...next, lives: 1 }
        }
        expect(paid).toEqual([0, 1, 2, 3, 4, 5].map((n) => lifePrice(n)))
        expect(state.livesBought).toBe(6)
    })

    it("is refused at the lives cap, which Extra heart raises", () => {
        expect(maxLivesFor(makeState())).toBe(MODES.survival.maxLives)
        const full = makeState({ coins: 1000, lives: MODES.survival.maxLives })
        expect(applyAction(full, buy, crops)).toBeNull()
        expect(canBuyLife(full)).toBe(false)
        expect(canBuyLife({ ...full, lives: MODES.survival.maxLives - 1 })).toBe(true)
        const hearty = { ...full, upgrades: [own("extraHeart", "rare")] }
        expect(maxLivesFor(hearty)).toBe(MODES.survival.maxLives + 1)
        expect(apply(hearty, buy).lives).toBe(MODES.survival.maxLives + 1)
    })

    it("returns null when coins are one short", () => {
        const short = makeState({ livesBought: 2, coins: lifePrice(2) - 1, lives: 1 })
        expect(applyAction(short, buy, crops)).toBeNull()
        expect(canBuyLife(short)).toBe(false)

        const exact = makeState({ livesBought: 2, coins: lifePrice(2), lives: 1 })
        expect(canBuyLife(exact)).toBe(true)
        expect(apply(exact, buy).coins).toBe(0)
    })

    it("returns null outside Survival", () => {
        const state = makeTimed({ coins: 1000 })
        expect(applyAction(state, buy, crops)).toBeNull()
        expect(canBuyLife(state)).toBe(false)
    })

    it("can't be bought once the run has ended", () => {
        const state = makeState({ coins: 1000, lives: 0, status: "ended" })
        expect(applyAction(state, buy, crops)).toBeNull()
        expect(canBuyLife(state)).toBe(false)
    })
})

describe("applyAction: full flow", () => {
    it("plants, grows, harvests twice and fills an order", () => {
        let state = makeState({ orders: [makeOrder({ required: { carrot: 4 }, value: 32 })] })
        state = apply(state, { type: "plant", plot: 0, cropId: "carrot" })
        state = apply(state, { type: "plant", plot: 1, cropId: "carrot" })

        // Not ready yet: harvest is rejected.
        expect(applyAction(state, { type: "harvest", plot: 0 }, crops)).toBeNull()

        // Stand-in for step: move time forward and grow every plot.
        const tick = crops.carrot.growTicks
        state = { ...state, tick, plots: state.plots.map((p) => updateGrowth(p, tick)) }

        state = apply(state, { type: "harvest", plot: 0 })
        state = apply(state, { type: "harvest", plot: 1 })
        expect(state.inventory).toEqual({ carrot: 4 })

        state = apply(state, { type: "deliver", orderId: 0 })
        expect(state.orders).toEqual([])
        expect(state.inventory).toEqual({})
        expect(state.score).toBe(32)
        expect(state.ordersCompleted).toBe(1)
        expect(state.plots.every((p) => p.state === "empty")).toBe(true)
    })
})

// Calls step n times.
function stepN(state: GameState, n: number): GameState {
    for (let i = 0; i < n; i++) state = step(state, crops)
    return state
}

describe("step: tick and rules", () => {
    it("increases tick by 1", () => {
        const state = makeState({ tick: 41 })
        expect(step(state, crops).tick).toBe(42)
    })

    it("never changes the state passed in", () => {
        const state = makeState({
            plots: [{ state: "growing", cropId: "garlic", plantedAt: 0, readyAt: 80 }],
            orders: [makeOrder({ expiresAt: 0 }), makeOrder({ id: 1, expiresAt: 900 })],
            nextOrderId: 2,
            tick: 79
        })
        const before = structuredClone(state)
        step(state, crops)
        expect(state).toEqual(before)
    })

    it("leaves inventory, score, ordersCompleted, coins and livesBought alone", () => {
        const state = makeState({
            inventory: { carrot: 3 },
            score: 50,
            ordersCompleted: 2,
            coins: 7,
            livesBought: 1
        })
        const next = stepN(state, 700)
        expect(next.inventory).toEqual({ carrot: 3 })
        expect(next.score).toBe(50)
        expect(next.ordersCompleted).toBe(2)
        expect(next.coins).toBe(7)
        expect(next.livesBought).toBe(1)
    })

    it("returns the state unchanged once the game has ended", () => {
        const state = makeState({ status: "ended", tick: 10 })
        expect(step(state, crops)).toBe(state)
    })

    it("gives an equal state from the same seed after many steps", () => {
        const a = stepN(createGame(9, config), 2000)
        const b = stepN(createGame(9, config), 2000)
        expect(a).toEqual(b)
        expect(a.ordersFailed).toBeGreaterThan(0)
    })
})

describe("step: growth", () => {
    it("makes a crop ready exactly growTicks after planting", () => {
        let state = makeState({ tick: 10 })
        state = apply(state, { type: "plant", plot: 0, cropId: "garlic" })
        state = stepN(state, crops.garlic.growTicks - 1)
        expect(state.plots[0].state).toBe("growing")
        state = step(state, crops)
        expect(state.tick).toBe(10 + crops.garlic.growTicks)
        expect(state.plots[0]).toEqual({ state: "ready", cropId: "garlic" })
    })

    it("leaves empty and ready plots alone", () => {
        const plots: GameState["plots"] = [
            { state: "empty" },
            { state: "ready", cropId: "pumpkin" }
        ]
        const next = step(makeState({ plots }), crops)
        expect(next.plots).toEqual(plots)
    })
})

// Run in Timed, where the order rules are the fixed constants with MODES.timed.openOrders open.
const TIMED_OPEN = MODES.timed.openOrders

describe("step: orders", () => {
    it("fills up to TIMED_OPEN orders on the first step", () => {
        const state = createGame(3, timed)
        const next = step(state, crops)

        // Build the expected orders the same way step should.
        let rng = state.rng.orders
        const expected: Order[] = []
        for (let id = 0; id < TIMED_OPEN; id++) {
            const [order, after] = createOrder(id, 1, rng, crops)
            expected.push(order)
            rng = after
        }

        expect(next.orders).toEqual(expected)
        expect(next.orders.every((o) => o.expiresAt === 1 + ORDER_TICKS)).toBe(true)
        expect(next.nextOrderId).toBe(TIMED_OPEN)
        expect(next.rng.orders).toBe(rng)
    })

    it("never opens more than TIMED_OPEN regular orders (rush waves add past it)", () => {
        let state = createGame(5, timed)
        for (let i = 0; i < 2000; i++) {
            state = step(state, crops)
            const regular = state.orders.filter((o) => !o.rush)
            expect(regular.length).toBeLessThanOrEqual(TIMED_OPEN)
        }
    })

    it("keeps an order open on its expiresAt tick and fails it on the tick after", () => {
        const order = makeOrder({ id: 0, expiresAt: 60 })
        const other = makeOrder({ id: 1, expiresAt: 900 })
        const third = makeOrder({ id: 2, expiresAt: 900 })
        let state = makeTimed({ tick: 59, orders: [order, other, third], nextOrderId: 3 })

        state = step(state, crops) // tick 60
        expect(state.orders.map((o) => o.id)).toEqual([0, 1, 2])
        expect(state.ordersFailed).toBe(0)

        state = step(state, crops) // tick 61
        expect(state.ordersFailed).toBe(1)
        expect(state.orders.find((o) => o.id === 0)).toBeUndefined()
    })

    it("replaces a failed order on the same step and keeps the others in order", () => {
        const a = makeOrder({ id: 0, expiresAt: 900 })
        const b = makeOrder({ id: 1, expiresAt: 60 })
        const c = makeOrder({ id: 2, expiresAt: 900 })
        const state = makeTimed({ tick: 60, orders: [a, b, c], nextOrderId: 3 })
        const next = step(state, crops)
        expect(next.orders).toHaveLength(TIMED_OPEN)
        expect(next.orders[0]).toEqual(a)
        expect(next.orders[1]).toEqual(c)
        expect(next.orders[2].id).toBe(3)
        expect(next.orders[2].expiresAt).toBe(61 + ORDER_TICKS)
        expect(next.nextOrderId).toBe(4)
    })

    it("replaces a delivered order on the next step", () => {
        let state = step(createGame(4, timed), crops)
        const target = state.orders[0]
        state = { ...state, inventory: { ...target.required } }
        state = apply(state, { type: "deliver", orderId: target.id })
        expect(state.orders).toHaveLength(TIMED_OPEN - 1)

        state = step(state, crops)
        expect(state.orders).toHaveLength(TIMED_OPEN)
        expect(state.orders[state.orders.length - 1].id).toBe(TIMED_OPEN)
        expect(state.ordersFailed).toBe(0)
    })
})

describe("step: end of run", () => {
    it("ends a Timed run on tick MODES.timed.runTicks", () => {
        let state = stepN(createGame(2, timed), MODES.timed.runTicks - 1)
        expect(state.status).toBe("running")

        const before = state
        state = step(state, crops)
        expect(state.tick).toBe(MODES.timed.runTicks)
        expect(state.status).toBe("ended")
        // No new orders on the ending step.
        expect(state.nextOrderId).toBe(before.nextOrderId)
        expect(state.rng).toEqual(before.rng)
    })

    it("changes nothing after a Timed run ends, and refuses actions", () => {
        const ended = stepN(createGame(2, timed), MODES.timed.runTicks)
        expect(ended.status).toBe("ended")
        expect(step(ended, crops)).toBe(ended)
        expect(applyAction(ended, { type: "plant", plot: 0, cropId: "garlic" }, crops)).toBeNull()
    })

    it("does not end a Survival run by time while lives are left", () => {
        const state = stepN(makeState({ lives: 1000 }), MODES.timed.runTicks + 10)
        expect(state.status).toBe("running")
        expect(state.lives).toBeGreaterThan(0)
    })
})

describe("orderRules", () => {
    it("uses the fixed constants in Timed, with MODES.timed.openOrders open", () => {
        expect(orderRules(makeTimed({ ordersCompleted: 50 }))).toEqual({
            ...DEFAULT_ORDER_RULES,
            maxOpenOrders: MODES.timed.openOrders
        })
        expect(MODES.timed.openOrders).toBe(3)
        expect(orderRules(makeTimed({ mode: "puzzle" }))).toEqual(DEFAULT_ORDER_RULES)
        expect(DEFAULT_ORDER_RULES.maxOpenOrders).toBe(MAX_OPEN_ORDERS)
        expect(DEFAULT_ORDER_RULES.orderTicks).toBe(ORDER_TICKS)
    })

    it("follows the level in Survival", () => {
        for (const done of [0, 1, DIFFICULTY.ordersPerLevel, 4 * DIFFICULTY.ordersPerLevel, 999]) {
            expect(orderRules(makeState({ ordersCompleted: done }))).toEqual(
                orderRulesFor(levelFor(done))
            )
        }
    })
})

describe("step: Survival lives and difficulty", () => {
    it("takes one life for each failed order", () => {
        const state = makeState({
            tick: 60,
            orders: [makeOrder({ expiresAt: 60 })],
            nextOrderId: 1
        })
        const next = step(state, crops)
        expect(next.ordersFailed).toBe(1)
        expect(next.lives).toBe(MODES.survival.startLives - 1)
        expect(next.status).toBe("running")
    })

    it("takes no lives in Timed", () => {
        const state = makeTimed({
            tick: 60,
            orders: [makeOrder({ expiresAt: 60 })],
            nextOrderId: 1
        })
        const next = step(state, crops)
        expect(next.ordersFailed).toBe(1)
        expect(next.lives).toBe(0)
        expect(next.status).toBe("running")
    })

    it("ends at 0 lives when more orders fail than lives are left", () => {
        const a = makeOrder({ id: 0, expiresAt: 60 })
        const b = makeOrder({ id: 1, expiresAt: 60 })
        const state = makeState({ tick: 60, lives: 1, orders: [a, b], nextOrderId: 2 })
        const next = step(state, crops)
        expect(next.lives).toBe(0)
        expect(next.ordersFailed).toBe(2)
        expect(next.status).toBe("ended")
        // No new orders on the ending step.
        expect(next.orders).toEqual([])
        expect(next.nextOrderId).toBe(2)
        expect(next.rng).toEqual(state.rng)
    })

    it("changes nothing after the run ends and refuses every action", () => {
        const state = makeState({
            tick: 60,
            lives: 1,
            coins: 1000,
            orders: [makeOrder({ expiresAt: 60 })],
            plots: [{ state: "ready", cropId: "garlic" }, { state: "empty" }],
            nextOrderId: 1
        })
        const ended = step(state, crops)
        expect(ended.status).toBe("ended")
        expect(step(ended, crops)).toBe(ended)
        const actions: Action[] = [
            { type: "buyLife" },
            { type: "harvest", plot: 0 },
            { type: "plant", plot: 1, cropId: "garlic" }
        ]
        for (const action of actions) expect(applyAction(ended, action, crops)).toBeNull()
    })

    it("ends an idle run after a fixed number of ticks", () => {
        const { orderTicks: T, maxOpenOrders: k } = orderRulesFor(0)
        const L = MODES.survival.startLives
        const endTick = Math.ceil(L / k) * (T + 1) + 1

        let state = createGame(11, config)
        const livesSeen: [number, number][] = []
        while (state.status === "running") {
            const before = state.lives
            state = step(state, crops)
            if (state.lives !== before) livesSeen.push([state.tick, state.lives])
        }
        expect(state.tick).toBe(endTick)
        expect(state.lives).toBe(0)
        expect(state.ordersCompleted).toBe(0)
        // The first group of k orders fails on tick T + 2.
        expect(livesSeen[0]).toEqual([T + 2, Math.max(0, L - k)])
    })

    it("ends an idle run on the same tick whatever the seed", () => {
        const end = (seed: number) => {
            let state = createGame(seed, config)
            while (state.status === "running") state = step(state, crops)
            return state.tick
        }
        const first = end(0)
        for (const seed of [1, 2, 3, 12345]) expect(end(seed)).toBe(first)
    })

    it("opens level-1 orders at the start", () => {
        const rules = orderRulesFor(0)
        const next = step(createGame(3, config), crops)
        expect(next.orders).toHaveLength(rules.maxOpenOrders)
        for (const order of next.orders) {
            expect(order.timeLimit).toBe(rules.orderTicks)
            expect(order.expiresAt).toBe(1 + rules.orderTicks)
            const amount = Object.values(order.required)[0]
            expect(amount).toBeGreaterThanOrEqual(rules.minAmount)
            expect(amount).toBeLessThanOrEqual(rules.maxAmount)
        }
    })

    it("uses the next level's rules after ordersPerLevel filled orders", () => {
        expect(DIFFICULTY.levels.length).toBeGreaterThanOrEqual(2)
        const rules = orderRulesFor(1)
        const state = makeState({ tick: 10, ordersCompleted: DIFFICULTY.ordersPerLevel })
        const next = step(state, crops)
        expect(next.orders).toHaveLength(rules.maxOpenOrders)
        for (const order of next.orders) {
            expect(order.timeLimit).toBe(rules.orderTicks)
            expect(order.expiresAt).toBe(11 + rules.orderTicks)
        }
    })

    it("raises the level by filling orders", () => {
        let state = step(createGame(8, config), crops)
        for (let i = 0; i < DIFFICULTY.ordersPerLevel; i++) {
            const order = state.orders[0]
            const stocked = { ...state, inventory: { ...order.required } }
            state = step(apply(stocked, { type: "deliver", orderId: order.id }), crops)
        }
        expect(levelFor(state.ordersCompleted)).toBe(1)
        const newest = state.orders[state.orders.length - 1]
        expect(newest.timeLimit).toBe(orderRulesFor(1).orderTicks)
    })

    it("keeps two or more orders open on the last level", () => {
        const last = DIFFICULTY.levels.length - 1
        const done = last * DIFFICULTY.ordersPerLevel
        const next = step(makeState({ ordersCompleted: done }), crops)
        expect(next.orders.length).toBe(orderRulesFor(last).maxOpenOrders)
        expect(next.orders.length).toBeGreaterThanOrEqual(2)
    })
})

describe("step with applyAction", () => {
    it("allows harvesting on the same tick step makes a crop ready", () => {
        let state = apply(makeState(), { type: "plant", plot: 0, cropId: "garlic" })
        state = stepN(state, crops.garlic.growTicks)
        state = apply(state, { type: "harvest", plot: 0 })
        expect(state.inventory).toEqual({ garlic: crops.garlic.yield })
    })

    it("allows delivery on the expiresAt tick, but not after the next step", () => {
        const order = makeOrder({ id: 0, expiresAt: 60 })
        const state = step(
            makeState({ tick: 59, orders: [order], inventory: { carrot: 3 }, nextOrderId: 1 }),
            crops
        )
        expect(state.tick).toBe(60)
        expect(applyAction(state, { type: "deliver", orderId: 0 }, crops)).not.toBeNull()
        expect(applyAction(step(state, crops), { type: "deliver", orderId: 0 }, crops)).toBeNull()
    })
})

describe("upgrades: offer flow", () => {
    // A Survival state one step away from its first offer.
    const due = () => makeState({ ordersCompleted: ORDERS_PER_UPGRADE })

    it("makes no offer before ORDERS_PER_UPGRADE filled orders", () => {
        const next = step(makeState({ ordersCompleted: ORDERS_PER_UPGRADE - 1 }), crops)
        expect(next.upgradeOffer).toBeNull()
        expect(next.offersMade).toBe(0)
    })

    it("offers UPGRADE_CHOICES cards on the step after the ORDERS_PER_UPGRADE-th order", () => {
        const state = due()
        const next = step(state, crops)
        expect(next.tick).toBe(state.tick + 1)
        expect(next.upgradeOffer).toHaveLength(UPGRADE_CHOICES)
        expect(new Set(next.upgradeOffer!.map((c) => c.id)).size).toBe(UPGRADE_CHOICES)
        expect(next.offersMade).toBe(1)

        // The offer comes from rng.upgrades, after the step's new orders.
        const noOffer = step({ ...state, offersMade: 1 }, crops)
        expect(next.orders).toEqual(noOffer.orders)
        expect(rollOffer(noOffer, "survival", crops)).toEqual([
            next.upgradeOffer,
            next.rng.upgrades
        ])
    })

    it("leaves rng.orders alone when making an offer", () => {
        const state = due()
        const next = step(state, crops)
        const noOffer = step({ ...state, offersMade: 1 }, crops)
        expect(next.rng.orders).toBe(noOffer.rng.orders)
        expect(next.rng.upgrades).not.toBe(state.rng.upgrades)
    })

    it("gives the same order sequence whether or not an offer was made", () => {
        const open = step(due(), crops)
        const c = open.upgradeOffer![0]
        const picked = apply(open, {
            type: "chooseUpgrade",
            upgradeId: c.id,
            ...(UPGRADES.upgrades[c.id].target === "crop" ? { target: "carrot" } : {})
        })
        const noOffer = step({ ...due(), offersMade: 1 }, crops)
        // Clearing the orders every tick makes both runs create orders on the same ticks.
        const ordersAfter = (start: GameState): Order[] => {
            let s = start
            const seen: Order[] = []
            for (let i = 0; i < 200; i++) {
                s = step({ ...s, lives: 99, orders: [] }, crops)
                seen.push(...s.orders)
            }
            return seen
        }
        // Same ids, crops and amounts (time limits may differ by upgrade).
        const shape = (o: Order) => [o.id, o.required]
        const withOffer = ordersAfter(picked).map(shape)
        expect(withOffer.length).toBeGreaterThan(0)
        expect(withOffer).toEqual(ordersAfter(noOffer).map(shape))
    })

    it("stops time and refuses other actions while an offer is open", () => {
        const plots: Plot[] = [{ state: "ready", cropId: "carrot" }, { state: "empty" }]
        const open = { ...step(due(), crops), coins: 1000, inventory: { carrot: 10 }, plots }
        expect(step(open, crops)).toBe(open)
        const blocked: Action[] = [
            { type: "plant", plot: 1, cropId: "garlic" },
            { type: "harvest", plot: 0 },
            { type: "deliver", orderId: open.orders[0].id },
            { type: "buyLife" }
        ]
        for (const action of blocked) expect(applyAction(open, action, crops)).toBeNull()
        expect(canBuyLife(open)).toBe(false)
    })

    it("chooseUpgrade stores the copy with the card's tier and clears the offer", () => {
        const open = makeState({ upgradeOffer: OFFER })
        const next = apply(open, { type: "chooseUpgrade", upgradeId: "lifeDiscount" })
        expect(next.upgrades).toEqual([{ id: "lifeDiscount", tier: "rare", target: null }])
        expect(next.upgradeOffer).toBeNull()
        expect(next.tick).toBe(open.tick)
        expect(step(next, crops).tick).toBe(open.tick + 1)
    })

    it("chooseUpgrade stores the target of a targeted upgrade", () => {
        const open = makeState({ upgradeOffer: [card("favoriteCrop", "epic")] })
        const next = apply(open, {
            type: "chooseUpgrade",
            upgradeId: "favoriteCrop",
            target: "pumpkin"
        })
        expect(next.upgrades).toEqual([{ id: "favoriteCrop", tier: "epic", target: "pumpkin" }])
    })

    it("chooseUpgrade refuses bad picks", () => {
        const open = makeState({ upgradeOffer: [...OFFER, card("favoriteCrop")] })
        const pick = (state: GameState, upgradeId: string, target?: number | string) =>
            applyAction(
                state,
                target === undefined
                    ? { type: "chooseUpgrade", upgradeId }
                    : { type: "chooseUpgrade", upgradeId, target },
                crops
            )
        expect(pick(open, "extraPlot")).toBeNull() // not on the offer
        expect(pick(open, "nope")).toBeNull()
        expect(pick(makeState(), "bigTips")).toBeNull() // no offer open
        expect(pick(open, "bigTips", 0)).toBeNull() // a target on an untargeted upgrade
        expect(pick(open, "favoriteCrop")).toBeNull() // no target
        expect(pick(open, "favoriteCrop", "turnip")).toBeNull() // not a crop
        expect(pick(open, "favoriteCrop", 0)).toBeNull() // a plot, not a crop
        expect(pick(open, "favoriteCrop", "carrot")).not.toBeNull()
    })

    it("makes the next offer at 2 x ORDERS_PER_UPGRADE", () => {
        const after = { upgrades: [own("bigTips")], offersMade: 1 }
        const early = makeState({ ...after, ordersCompleted: 2 * ORDERS_PER_UPGRADE - 1 })
        expect(step(early, crops).upgradeOffer).toBeNull()
        const ready = makeState({ ...after, ordersCompleted: 2 * ORDERS_PER_UPGRADE })
        const next = step(ready, crops)
        expect(next.upgradeOffer).toHaveLength(UPGRADE_CHOICES)
        expect(next.offersMade).toBe(2)
    })

    it("makes offers in Timed from the Timed pool, with the clock stopped", () => {
        const early = makeTimed({ ordersCompleted: ORDERS_PER_UPGRADE - 1 })
        expect(step(early, crops).upgradeOffer).toBeNull()
        const next = step(makeTimed({ ordersCompleted: ORDERS_PER_UPGRADE }), crops)
        expect(next.upgradeOffer).toHaveLength(UPGRADE_CHOICES)
        expect(next.offersMade).toBe(1)
        for (const c of next.upgradeOffer!) {
            expect(UPGRADES.upgrades[c.id].pools).toContain("timed")
        }
        expect(step(next, crops)).toBe(next)
        const picked = apply(next, { type: "chooseUpgrade", upgradeId: next.upgradeOffer![0].id })
        expect(picked.upgradeOffer).toBeNull()
        expect(step(picked, crops).tick).toBe(next.tick + 1)
    })

    it("lets Timed reroll an offer with coins from selling", () => {
        const open = step(makeTimed({ ordersCompleted: ORDERS_PER_UPGRADE }), crops)
        expect(canReroll(open)).toBe(false)
        const rich = { ...open, coins: 100 }
        expect(canReroll(rich)).toBe(true)
        const rerolled = apply(rich, { type: "rerollOffer" })
        expect(rerolled.rerollsThisOffer).toBe(1)
        expect(rerolled.coins).toBeLessThan(100)
    })

    it("carries on with no offer when every upgrade is at maxCopies", () => {
        const all = Object.values(UPGRADES.upgrades).flatMap((u) =>
            Array.from({ length: u.maxCopies }, () =>
                own(u.id, "common", u.target === "crop" ? "carrot" : null)
            )
        )
        const state = makeState({ upgrades: all, ordersCompleted: ORDERS_PER_UPGRADE })
        const next = step(state, crops)
        expect(next.upgradeOffer).toBeNull()
        expect(next.offersMade).toBe(1)
        expect(step(next, crops).tick).toBe(next.tick + 1)
    })
})

describe("upgrades: modifiers change the rules", () => {
    it("growthPct shortens readyAt for new crops", () => {
        const state = makeState({ tick: 10, upgrades: [own("fastGrowth", "epic")] })
        const next = apply(state, { type: "plant", plot: 0, cropId: "garlic" })
        const pct = 100 + effectAmount(UPGRADES.upgrades.fastGrowth, 0, "epic")
        expect(next.plots[0]).toMatchObject({
            readyAt: 10 + scalePct(crops.garlic.growTicks, pct)
        })
    })

    it("growthPct doesn't change crops already growing", () => {
        const growing: Plot = { state: "growing", cropId: "garlic", plantedAt: 0, readyAt: 80 }
        const state = makeState({ plots: [growing], upgradeOffer: [card("fastGrowth", "epic")] })
        const next = apply(state, { type: "chooseUpgrade", upgradeId: "fastGrowth" })
        expect(next.plots[0]).toBe(growing)
    })

    it("Favorite crop speeds up and adds yield only for its crop", () => {
        const fav = UPGRADES.upgrades.favoriteCrop
        const upgrades = [own("favoriteCrop", "legendary", "carrot")]
        const growPct = 100 + effectAmount(fav, 0, "legendary")
        const bonus = effectAmount(fav, 1, "legendary")

        const planted = apply(makeState({ upgrades }), { type: "plant", plot: 0, cropId: "carrot" })
        expect(planted.plots[0]).toMatchObject({
            readyAt: scalePct(crops.carrot.growTicks, growPct)
        })
        const other = apply(makeState({ upgrades }), { type: "plant", plot: 0, cropId: "garlic" })
        expect(other.plots[0]).toMatchObject({ readyAt: crops.garlic.growTicks })

        const ready: Plot[] = [
            { state: "ready", cropId: "carrot" },
            { state: "ready", cropId: "garlic" }
        ]
        let state = makeState({ upgrades, plots: ready })
        state = apply(state, { type: "harvest", plot: 0 })
        state = apply(state, { type: "harvest", plot: 1 })
        expect(state.inventory).toEqual({
            carrot: crops.carrot.yield + bonus,
            garlic: crops.garlic.yield
        })
    })

    describe("bumperChance", () => {
        const bumper = UPGRADES.upgrades.bumperHarvest
        const ready: Plot[] = [{ state: "ready", cropId: "carrot" }]

        it("draws nothing without Bumper harvest", () => {
            const state = makeState({ plots: ready })
            const next = apply(state, { type: "harvest", plot: 0 })
            expect(next.rng).toEqual(state.rng)
            expect(next.inventory.carrot).toBe(crops.carrot.yield)
        })

        it("draws once from rng.harvest and adds a crop exactly when the roll is below the chance", () => {
            const chance = effectAmount(bumper, 0, "legendary")
            let hits = 0
            let misses = 0
            for (let seed = 0; seed < 200; seed++) {
                const state = {
                    ...createGame(seed, config),
                    plots: ready,
                    upgrades: [own("bumperHarvest", "legendary")]
                }
                const [roll, after] = randomInt(state.rng.harvest, 0, 99)
                const next = apply(state, { type: "harvest", plot: 0 })
                const extra = roll < chance ? 1 : 0
                expect(next.inventory.carrot).toBe(crops.carrot.yield + extra)
                expect(next.rng).toEqual({ ...state.rng, harvest: after })
                if (extra === 1) hits += 1
                else misses += 1
            }
            expect(hits).toBeGreaterThan(0)
            expect(misses).toBeGreaterThan(0)
        })

        it("is capped at the stat's max", () => {
            const owned = Array.from({ length: bumper.maxCopies }, () =>
                own("bumperHarvest", "legendary")
            )
            expect(modifiersFor(owned).bumperChance).toBe(UPGRADES.stats.bumperChance.max)
        })
    })

    it("coinsPerOrder adds coins on delivery", () => {
        const state = makeState({
            orders: [makeOrder()],
            inventory: { carrot: 3 },
            upgrades: [own("bigTips", "rare")]
        })
        const next = apply(state, { type: "deliver", orderId: 0 })
        const tip = effectAmount(UPGRADES.upgrades.bigTips, 0, "rare")
        expect(next.coins).toBe(DIFFICULTY.coinsPerOrder + tip)
    })

    it("orderTimePct lengthens new orders' time limit", () => {
        const state = makeState({ upgrades: [own("patientCustomers", "uncommon")] })
        const pct = 100 + effectAmount(UPGRADES.upgrades.patientCustomers, 0, "uncommon")
        const expected = scalePct(orderRulesFor(0).orderTicks, pct)
        expect(orderRules(state).orderTicks).toBe(expected)
        expect(step(state, crops).orders[0].timeLimit).toBe(expected)
    })

    it("orderTimePct lengthens new orders' time limit in Timed too", () => {
        const state = makeTimed({ upgrades: [own("patientCustomers", "uncommon")] })
        const pct = 100 + effectAmount(UPGRADES.upgrades.patientCustomers, 0, "uncommon")
        const expected = scalePct(DEFAULT_ORDER_RULES.orderTicks, pct)
        expect(orderRules(state).orderTicks).toBe(expected)
        expect(step(state, crops).orders[0].timeLimit).toBe(expected)
    })

    it("lifePricePct lowers the life price for canBuyLife and buyLife", () => {
        const upgrades = [own("lifeDiscount", "legendary")]
        const pct = 100 + effectAmount(UPGRADES.upgrades.lifeDiscount, 0, "legendary")
        const price = scalePct(lifePrice(0), pct)
        expect(price).toBeLessThan(lifePrice(0))
        expect(lifePriceFor(makeState({ upgrades }))).toBe(price)

        expect(canBuyLife(makeState({ upgrades, coins: price - 1, lives: 1 }))).toBe(false)
        const state = makeState({ upgrades, coins: price, lives: 1 })
        expect(canBuyLife(state)).toBe(true)
        expect(apply(state, { type: "buyLife" }).coins).toBe(0)
    })

    it("extraPlots adds an empty plot when picked", () => {
        const state = makeState({ upgradeOffer: [card("extraPlot", "rare")] })
        const next = apply(state, { type: "chooseUpgrade", upgradeId: "extraPlot" })
        expect(next.plots).toHaveLength(START_PLOTS + 1)
        expect(next.plots[next.plots.length - 1]).toEqual({ state: "empty" })
        expect(next.plots.slice(0, START_PLOTS)).toEqual(state.plots)
        expect(modifiersFor(next.upgrades).extraPlots).toBe(1)
    })

    it("extraPlots adds no plot past its cap", () => {
        const max = UPGRADES.stats.extraPlots.max
        const owned = Array.from({ length: max }, () => own("extraPlot", "rare"))
        const plots = Array.from({ length: START_PLOTS + max }, (): Plot => ({ state: "empty" }))
        const offer = [card("extraPlot", "rare")]
        const state = makeState({ upgrades: owned, plots, upgradeOffer: offer })
        const next = apply(state, { type: "chooseUpgrade", upgradeId: "extraPlot" })
        expect(next.plots).toBe(state.plots)
    })
})

describe("power-ups: drops and use", () => {
    const on: GameConfig = { mode: "survival", allowPowerUps: true, allowEvents: false }
    const growingPlot = (readyAt: number): Plot => ({
        state: "growing",
        cropId: "garlic",
        plantedAt: 0,
        readyAt
    })
    const readyPlot: Plot = { state: "ready", cropId: "garlic" }

    function withPowerUps(overrides: Partial<GameState> = {}): GameState {
        return { ...createGame(1, on), ...overrides }
    }

    function replacePlots(plots: Plot[], i: number, plot: Plot): Plot[] {
        return plots.map((p, j) => (j === i ? plot : p))
    }

    // A fresh Survival game with plot 0 ready to harvest.
    function readyToHarvest(seed: number, cfg: GameConfig = on): GameState {
        const s = createGame(seed, cfg)
        return { ...s, plots: replacePlots(s.plots, 0, readyPlot) }
    }

    // A seed whose first harvest drops a power-up, so these tests don't hang on one seed.
    function seedThatDrops(): number {
        for (let seed = 0; seed < 1000; seed++) {
            const next = apply(readyToHarvest(seed), { type: "harvest", plot: 0 })
            if (next.powerUps.length === 1) return seed
        }
        throw new Error("no seed drops")
    }

    const twoDraws = (rng: number) => nextValue(nextValue(rng)[1])[1]

    it("keeps a drop in a free slot and advances rng.drops by two draws", () => {
        const s = readyToHarvest(seedThatDrops())
        const next = apply(s, { type: "harvest", plot: 0 })
        expect(next.powerUps).toHaveLength(1)
        expect(next.rng.drops).toBe(twoDraws(s.rng.drops))
        expect(next.rng.orders).toBe(s.rng.orders)
        expect(next.rng.upgrades).toBe(s.rng.upgrades)
    })

    it("loses a drop when every slot is full, but still uses both draws", () => {
        const s = { ...readyToHarvest(seedThatDrops()), powerUps: ["coinBag", "coinBag"] }
        const next = apply(s, { type: "harvest", plot: 0 })
        expect(next.powerUps).toEqual(["coinBag", "coinBag"])
        expect(next.rng.drops).toBe(twoDraws(s.rng.drops))
    })

    it("Big pockets adds a third slot", () => {
        const s = {
            ...readyToHarvest(seedThatDrops()),
            powerUps: ["coinBag", "coinBag"],
            upgrades: [own("bigPockets", "rare")]
        }
        expect(apply(s, { type: "harvest", plot: 0 }).powerUps).toHaveLength(3)
    })

    it("never drops with power-ups off", () => {
        const s = readyToHarvest(seedThatDrops(), config)
        const next = apply(s, { type: "harvest", plot: 0 })
        expect(next.powerUps).toEqual([])
        expect(next.rng.drops).toBe(s.rng.drops)
    })

    it("removes the used slot and keeps the others in order", () => {
        const s = withPowerUps({ powerUps: ["orderFreeze", "coinBag", "growthBoost"] })
        expect(apply(s, { type: "usePowerUp", slot: 1 }).powerUps).toEqual([
            "orderFreeze",
            "growthBoost"
        ])
    })

    it("Ready one readies its plot, which can be harvested on the same tick", () => {
        const s = withPowerUps({
            powerUps: ["readyOne"],
            plots: replacePlots(createGame(1, on).plots, 2, growingPlot(80))
        })
        const used = apply(s, { type: "usePowerUp", slot: 0, target: 2 })
        expect(used.plots[2]).toEqual(readyPlot)
        expect(apply(used, { type: "harvest", plot: 2 }).inventory.garlic).toBeGreaterThan(0)
    })

    it("Growth boost brings growing crops 50 ticks closer and readies ones brought to now", () => {
        const plots = [growingPlot(200), growingPlot(30), { state: "empty" } as Plot, readyPlot]
        const s = withPowerUps({ tick: 10, powerUps: ["growthBoost"], plots })
        const used = apply(s, { type: "usePowerUp", slot: 0 })
        expect(used.plots[0]).toMatchObject({ state: "growing", readyAt: 150, plantedAt: -50 })
        expect(used.plots[1]).toEqual(readyPlot)
        expect(used.plots[2]).toBe(plots[2])
        expect(used.plots[3]).toBe(plots[3])
    })

    it("Coin bag adds its coins", () => {
        const s = withPowerUps({ coins: 3, powerUps: ["coinBag"] })
        expect(apply(s, { type: "usePowerUp", slot: 0 }).coins).toBe(13)
    })

    it("Order freeze holds order timers for 10 s, then they count down again", () => {
        let s = step(withPowerUps({ powerUps: ["orderFreeze"] }), crops)
        const id = s.orders[0].id
        const left = s.orders[0].expiresAt - s.tick
        s = apply(s, { type: "usePowerUp", slot: 0 })
        for (let i = 0; i < 100; i++) {
            s = step(s, crops)
            expect(s.orders.find((o) => o.id === id)!.expiresAt - s.tick).toBe(left)
        }
        s = step(s, crops)
        expect(s.orders.find((o) => o.id === id)!.expiresAt - s.tick).toBe(left - 1)
        expect(s.activeEffects).toEqual([])
    })

    it("Long-lasting stretches Order freeze, and a second freeze adds to it", () => {
        const upgrades = [own("longLasting", "legendary")]
        const s = withPowerUps({ tick: 5, upgrades, powerUps: ["orderFreeze", "orderFreeze"] })
        const once = apply(s, { type: "usePowerUp", slot: 0 })
        expect(once.activeEffects[0].endsAt).toBe(5 + 150)
        const twice = apply(once, { type: "usePowerUp", slot: 0 })
        expect(twice.activeEffects).toHaveLength(1)
        expect(twice.activeEffects[0].endsAt).toBe(5 + 300)
    })

    it("an Order freeze started on an order's last tick keeps it from failing", () => {
        const order = makeOrder({ expiresAt: 10 })
        const s = withPowerUps({ tick: 10, orders: [order], powerUps: ["orderFreeze"] })
        const next = step(apply(s, { type: "usePowerUp", slot: 0 }), crops)
        expect(next.ordersFailed).toBe(0)
        expect(next.orders.find((o) => o.id === order.id)!.expiresAt).toBe(11)
    })

    it("refuses bad uses", () => {
        const plots = replacePlots(createGame(1, on).plots, 1, growingPlot(80))
        const s = withPowerUps({ plots, powerUps: ["readyOne", "coinBag"] })
        const refused: [GameState, Action][] = [
            [
                { ...s, allowPowerUps: false, allowEvents: false },
                { type: "usePowerUp", slot: 1 }
            ],
            [s, { type: "usePowerUp", slot: 2 }],
            [s, { type: "usePowerUp", slot: -1 }],
            [s, { type: "usePowerUp", slot: 0 }],
            [s, { type: "usePowerUp", slot: 0, target: 0 }],
            [s, { type: "usePowerUp", slot: 0, target: 9 }],
            [s, { type: "usePowerUp", slot: 1, target: 1 }],
            [
                { ...s, upgradeOffer: OFFER },
                { type: "usePowerUp", slot: 1 }
            ],
            [
                { ...s, status: "ended" },
                { type: "usePowerUp", slot: 1 }
            ]
        ]
        for (const [state, action] of refused) expect(applyAction(state, action, crops)).toBeNull()
    })

    it("an open upgrade offer doesn't use up an active Order freeze", () => {
        const s = apply(withPowerUps({ powerUps: ["orderFreeze"] }), {
            type: "usePowerUp",
            slot: 0
        })
        const paused = { ...s, upgradeOffer: OFFER }
        expect(step(paused, crops)).toBe(paused)
    })

    it("using power-ups never changes the order sequence", () => {
        const plain = createGame(7, on)
        const used = apply({ ...plain, powerUps: ["growthBoost"] }, { type: "usePowerUp", slot: 0 })
        let a = plain
        let b = used
        for (let i = 0; i < 2000; i++) {
            a = step(a, crops)
            b = step(b, crops)
        }
        expect(b.rng.orders).toBe(a.rng.orders)
        expect(b.nextOrderId).toBe(a.nextOrderId)
    })
})

describe("upgrades: rules added with the second batch", () => {
    // Steps until some order is open and returns that state.
    function withOrders(s: GameState): GameState {
        let t = s
        while (t.orders.length === 0) t = step(t, crops)
        return t
    }

    it("Bigger bumper adds more crops when the bumper roll hits", () => {
        const ready: Plot = { state: "ready", cropId: "garlic" }
        const upgrades = [
            own("bumperHarvest", "legendary"),
            own("bumperHarvest", "legendary"),
            own("biggerBumper", "legendary")
        ] // 50% chance, 1 + 3 crops on a hit
        const amounts = new Set<number>()
        for (let seed = 0; seed < 40; seed++) {
            const s = { ...createGame(seed, config), plots: [ready], upgrades }
            amounts.add(apply(s, { type: "harvest", plot: 0 }).inventory.garlic)
        }
        expect(amounts).toEqual(new Set([crops.garlic.yield, crops.garlic.yield + 4]))
    })

    it("Bigger bumper is only offered once Bumper harvest is owned", () => {
        const s = makeState()
        expect(eligibleUpgrades(s, "survival", crops)).not.toContain("biggerBumper")
        const owned = makeState({ upgrades: [own("bumperHarvest")] })
        expect(eligibleUpgrades(owned, "survival", crops)).toContain("biggerBumper")
    })

    it("Small order halves new orders' amounts on a hit, from rng.shrink only", () => {
        const chance = [own("smallOrder", "legendary"), own("smallOrder", "legendary")] // 50%
        let halved = 0
        for (let seed = 0; seed < 40; seed++) {
            const plain = step(createGame(seed, timed), crops)
            const small = step({ ...createGame(seed, timed), upgrades: chance }, crops)
            expect(small.rng.orders).toBe(plain.rng.orders)
            expect(small.rng.shrink).toBe(
                [...Array(plain.orders.length)].reduce(
                    (r: number) => nextValue(r)[1],
                    plain.rng.shrink
                )
            )
            small.orders.forEach((o, i) => {
                const [cropId, n] = Object.entries(plain.orders[i].required)[0]
                const got = o.required[cropId]
                expect([n, Math.ceil(n / 2)]).toContain(got)
                expect(o.small).toBe(got !== n)
                expect(plain.orders[i].small).toBe(false)
                if (o.small) halved++
                expect(o.value).toBe(plain.orders[i].value)
            })
        }
        expect(halved).toBeGreaterThan(0)
        // Without the upgrade the stream never moves.
        expect(step(createGame(1, timed), crops).rng.shrink).toBe(createGame(1, timed).rng.shrink)
    })

    it("Sneak peek shows the order step creates next", () => {
        let s = withOrders(makeTimed({ upgrades: [own("sneakPeek", "rare")] }))
        expect(nextOrderPreview(makeTimed(), crops)).toBeNull()
        const preview = nextOrderPreview(s, crops)!
        expect(preview.id).toBe(s.nextOrderId)
        s = { ...s, orders: s.orders.slice(1) } // free a slot
        const next = step(s, crops)
        const made = next.orders[next.orders.length - 1]
        expect(made.id).toBe(preview.id)
        expect(made.required).toEqual(preview.required)
    })

    it("Early bird pays its coins only with at least half the time left", () => {
        const upgrades = [own("earlyBird", "legendary")]
        const bonus = effectAmount(UPGRADES.upgrades.earlyBird, 0, "legendary")
        const order = makeOrder({ expiresAt: 600, timeLimit: 600, small: false })
        const at = (tick: number) =>
            apply(makeState({ tick, orders: [order], inventory: { carrot: 3 }, upgrades }), {
                type: "deliver",
                orderId: 0
            }).coins
        expect(at(300)).toBe(DIFFICULTY.coinsPerOrder + bonus)
        expect(at(301)).toBe(DIFFICULTY.coinsPerOrder)
    })

    it("Steady pace slows the Survival level", () => {
        const at = DIFFICULTY.ordersPerLevel
        expect(runLevel(makeState({ ordersCompleted: at }))).toBe(1)
        const slow = makeState({ ordersCompleted: at, upgrades: [own("steadyPace", "legendary")] })
        expect(runLevel(slow)).toBe(levelFor(Math.floor((at * 100) / 125)))
        expect(runLevel(slow)).toBe(0)
        expect(orderRules(slow)).toEqual(orderRulesFor(0))
    })

    it("Extra heart raises the cap and fills the new heart in Survival, and none in Timed", () => {
        const s = makeState({ upgradeOffer: [card("extraHeart", "rare")] })
        const next = apply(s, { type: "chooseUpgrade", upgradeId: "extraHeart" })
        expect(next.lives).toBe(s.lives + 1)
        expect(maxLivesFor(next)).toBe(maxLivesFor(s) + 1)
        const t = withUpgrade(makeTimed(), own("extraHeart", "rare"))
        expect(t.lives).toBe(0)
        // Past the cap (2) a copy adds nothing.
        const two = [own("extraHeart", "rare"), own("extraHeart", "rare")]
        expect(withUpgrade(makeState({ upgrades: two }), own("extraHeart", "rare")).lives).toBe(
            MODES.survival.startLives
        )
    })

    it("Last stand speeds crops planted on the last life only", () => {
        const upgrades = [own("lastStand", "legendary")]
        const plantAt = (lives: number) =>
            apply(makeState({ lives, upgrades }), { type: "plant", plot: 0, cropId: "pumpkin" })
                .plots[0]
        expect(plantAt(2)).toMatchObject({ readyAt: crops.pumpkin.growTicks })
        expect(plantAt(1)).toMatchObject({ readyAt: scalePct(crops.pumpkin.growTicks, 75) })
    })

    it("Second chance sometimes keeps the life, rolling once per failed order", () => {
        const upgrades = [own("secondChance", "legendary"), own("secondChance", "legendary")]
        const outcomes = new Set<number>()
        for (let seed = 0; seed < 40; seed++) {
            const s = {
                ...createGame(seed, config),
                tick: 100,
                orders: [makeOrder({ expiresAt: 100 })],
                upgrades
            }
            const next = step(s, crops)
            expect(next.ordersFailed).toBe(1)
            expect(next.rng.lives).toBe(nextValue(s.rng.lives)[1])
            outcomes.add(next.lives)
        }
        expect(outcomes).toEqual(
            new Set([MODES.survival.startLives, MODES.survival.startLives - 1])
        )
        const plain = { ...makeState({ tick: 100, orders: [makeOrder({ expiresAt: 100 })] }) }
        expect(step(plain, crops).rng.lives).toBe(plain.rng.lives)
    })

    it("Second wind gives the first new order after a lost life a longer timer", () => {
        const upgrades = [own("secondWind", "legendary")]
        const s = makeState({ tick: 100, orders: [makeOrder({ expiresAt: 100 })], upgrades })
        const next = step(s, crops)
        expect(next.lives).toBe(s.lives - 1)
        const rules = orderRules(next)
        expect(next.orders[0].timeLimit).toBe(scalePct(rules.orderTicks, 150))
        expect(next.secondWind).toBe(false)
        const after = step({ ...next, orders: [] }, crops)
        expect(after.orders[0].timeLimit).toBe(rules.orderTicks)
    })
})

describe("power-ups: second batch", () => {
    const on: GameConfig = { mode: "survival", allowPowerUps: true, allowEvents: true }
    const growingPlot: Plot = { state: "growing", cropId: "garlic", plantedAt: 0, readyAt: 80 }
    const readyPlot: Plot = { state: "ready", cropId: "garlic" }

    function holding(powerUps: string[], overrides: Partial<GameState> = {}): GameState {
        return { ...createGame(1, on), powerUps, ...overrides }
    }

    it("Ready all makes every growing crop ready", () => {
        const s = holding(["readyAll"], { plots: [growingPlot, { state: "empty" }, growingPlot] })
        const next = apply(s, { type: "usePowerUp", slot: 0 })
        expect(next.plots).toEqual([readyPlot, { state: "empty" }, readyPlot])
        expect(next.powerUps).toEqual([])
    })

    it("Clean slate empties every plot", () => {
        const s = holding(["cleanSlate"], { plots: [growingPlot, readyPlot] })
        const next = apply(s, { type: "usePowerUp", slot: 0 })
        expect(next.plots).toEqual([{ state: "empty" }, { state: "empty" }])
    })

    it("Finish one fills the chosen order without crops, paying as a delivery", () => {
        const orders = [makeOrder({ id: 3 }), makeOrder({ id: 5, value: 40 })]
        const s = holding(["finishOne"], { orders, inventory: { carrot: 1 } })
        expect(applyAction(s, { type: "usePowerUp", slot: 0 }, crops)).toBeNull()
        expect(applyAction(s, { type: "usePowerUp", slot: 0, target: 4 }, crops)).toBeNull()
        const next = apply(s, { type: "usePowerUp", slot: 0, target: 5 })
        expect(next.orders.map((o) => o.id)).toEqual([3])
        expect(next.score).toBe(40)
        expect(next.ordersCompleted).toBe(1)
        expect(next.coins).toBe(DIFFICULTY.coinsPerOrder)
        expect(next.inventory).toEqual({ carrot: 1 })
    })

    it("Finish all fills every order for coins but no score", () => {
        const orders = [makeOrder({ id: 1 }), makeOrder({ id: 2 })]
        const next = apply(holding(["finishAll"], { orders }), { type: "usePowerUp", slot: 0 })
        expect(next.orders).toEqual([])
        expect(next.ordersCompleted).toBe(2)
        expect(next.score).toBe(0)
        expect(next.coins).toBe(2 * DIFFICULTY.coinsPerOrder)
    })

    it("Gold rush adds coins to deliveries for its length", () => {
        const def = POWER_UPS.powerUps.goldRush
        const s = apply(holding(["goldRush"]), { type: "usePowerUp", slot: 0 })
        expect(s.activeEffects).toEqual([
            {
                source: "goldRush",
                effect: def.effect,
                startedAt: 0,
                endsAt: def.durationTicks,
                exclude: [],
                only: null
            }
        ])
        const stocked = { ...s, orders: [makeOrder()], inventory: { carrot: 3 } }
        expect(apply(stocked, { type: "deliver", orderId: 0 }).coins).toBe(
            DIFFICULTY.coinsPerOrder + 5
        )
    })

    it("Good omen announces a good event now from rng.events, only with no event on", () => {
        const s = holding(["goodOmen"])
        const next = apply(s, { type: "usePowerUp", slot: 0 })
        expect(next.event).not.toBeNull()
        expect(EVENTS.events[next.event!.id].kind).toBe("good")
        expect(next.event!.announcedAt).toBe(s.tick)
        expect(next.rng.events).not.toBe(s.rng.events)
        expect(next.rng.orders).toBe(s.rng.orders)
        expect(applyAction(next, { type: "usePowerUp", slot: 0 }, crops)).toBeNull()
        const busy = holding(["goodOmen"], { event: next.event })
        expect(applyAction(busy, { type: "usePowerUp", slot: 0 }, crops)).toBeNull()
        const off = holding(["goodOmen"], { allowEvents: false })
        expect(applyAction(off, { type: "usePowerUp", slot: 0 }, crops)).toBeNull()
    })
})

describe("Timed combo", () => {
    const COMBO = MODES.timed.combo
    const deliver = (orderId: number): Action => ({ type: "deliver", orderId })

    // A Timed game on tick 100 with the given orders and enough carrots for all of them. The
    // orders are due on tick 100, so the speed bonus is 0 and only the combo counts.
    function ready(orders: Order[], overrides: Partial<GameState> = {}): GameState {
        const due = orders.map((o) => ({ ...o, expiresAt: 100 }))
        return makeTimed({ tick: 100, orders: due, inventory: { carrot: 99 }, ...overrides })
    }

    it("createGame starts with no streak", () => {
        for (const mode of ["survival", "timed"] as const) {
            const g = createGame(1, { mode, allowPowerUps: false, allowEvents: false })
            expect([g.combo, g.comboEndsAt, g.bestCombo]).toEqual([0, 0, 0])
        }
    })

    it("the first fill scores x1, then starts the streak and its window", () => {
        const next = apply(ready([makeOrder({ id: 0, value: 24 })]), deliver(0))
        expect(next.score).toBe(24)
        expect(next.combo).toBe(1)
        expect(next.comboEndsAt).toBe(100 + COMBO.windowTicks)
        expect(next.bestCombo).toBe(1)
    })

    it("each fill in a row scores the multiplier built so far, rounding down", () => {
        const orders = [0, 1, 2].map((id) => makeOrder({ id, value: 10 }))
        let s = ready(orders)
        s = apply(s, deliver(0))
        s = apply(s, deliver(1))
        s = apply(s, deliver(2))
        const expected = [0, 1, 2].reduce(
            (sum, combo) => sum + Math.floor((10 * comboPct(combo)) / 100),
            0
        )
        expect(s.score).toBe(expected)
        expect(s.combo).toBe(3)
        expect(s.bestCombo).toBe(3)
    })

    it("comboPct climbs by stepPct and stops at capPct", () => {
        expect(comboPct(0)).toBe(100)
        expect(comboPct(1)).toBe(100 + COMBO.stepPct)
        expect(comboPct(1000)).toBe(COMBO.capPct)
        const capped = apply(ready([makeOrder({ id: 0, value: 20 })], { combo: 1000 }), deliver(0))
        expect(capped.score).toBe(Math.floor((20 * COMBO.capPct) / 100))
    })

    it("keeps the streak through comboEndsAt and breaks it on the tick after", () => {
        // Keep orders open far into the future so none fail.
        const far = [0, 1, 2].map((id) => makeOrder({ id, expiresAt: 100_000 }))
        let s = makeTimed({ tick: 49, orders: far, nextOrderId: 3, combo: 2, comboEndsAt: 50 })
        s = step(s, crops) // tick 50
        expect(s.combo).toBe(2)
        s = step(s, crops) // tick 51
        expect(s.combo).toBe(0)
        expect(s.comboEndsAt).toBe(0)
    })

    it("a failed order breaks the combo, keeps the best, and costs no life", () => {
        const failing = makeOrder({ id: 0, expiresAt: 99 })
        const s = makeTimed({
            tick: 99,
            orders: [failing],
            nextOrderId: 1,
            combo: 4,
            comboEndsAt: 500,
            bestCombo: 6
        })
        const next = step(s, crops) // tick 100: the order fails
        expect(next.ordersFailed).toBe(1)
        expect(next.combo).toBe(0)
        expect(next.bestCombo).toBe(6)
        expect(next.lives).toBe(0)
        expect(next.status).toBe("running")
    })

    it("Finish one extends the streak; Finish all neither scores nor builds it", () => {
        const on: GameConfig = { mode: "timed", allowPowerUps: true, allowEvents: false }
        // Due this tick, so no speed bonus.
        const orders = [1, 2].map((id) => makeOrder({ id, value: 10, expiresAt: 100 }))
        const base = { ...createGame(1, on), tick: 100, orders, combo: 1, comboEndsAt: 120 }

        const one = apply(
            { ...base, powerUps: ["finishOne"] },
            {
                type: "usePowerUp",
                slot: 0,
                target: 1
            }
        )
        expect(one.score).toBe(Math.floor((10 * comboPct(1)) / 100))
        expect(one.combo).toBe(2)

        const all = apply({ ...base, powerUps: ["finishAll"] }, { type: "usePowerUp", slot: 0 })
        expect(all.score).toBe(0)
        expect([all.combo, all.comboEndsAt]).toEqual([1, 120])
    })

    it("Survival has no combo: fills score their value and leave the streak at 0", () => {
        const s = makeState({ tick: 100, orders: [makeOrder({ id: 0 })], inventory: { carrot: 3 } })
        const next = apply(s, deliver(0))
        expect(next.score).toBe(24)
        expect([next.combo, next.comboEndsAt, next.bestCombo]).toEqual([0, 0, 0])
    })
})

describe("scoring filled orders", () => {
    const deliver = (orderId: number): Action => ({ type: "deliver", orderId })

    it("adds orderPoints from the state before the fill, speed bonus included", () => {
        // 500 of 600 ticks left, with a streak of 2.
        const order = makeOrder({ id: 0, value: 40, expiresAt: 600, timeLimit: 600 })
        const s = makeTimed({ tick: 100, orders: [order], inventory: { carrot: 3 }, combo: 2 })
        const speed = Math.floor((40 * SCORING.timed.speedBonusPct * 500) / (100 * 600))
        expect(speed).toBeGreaterThan(0)
        const expected = Math.floor((40 * comboPct(2)) / 100) + speed
        expect(orderPoints(s, order)).toBe(expected)
        expect(apply(s, deliver(0)).score).toBe(expected)
    })

    it("Survival pays the level bonus past level 1", () => {
        const order = makeOrder({ id: 0, value: 40 })
        const at = (ordersCompleted: number) =>
            makeState({ tick: 100, orders: [order], inventory: { carrot: 3 }, ordersCompleted })
        expect(apply(at(0), deliver(0)).score).toBe(40)
        const level2 = at(DIFFICULTY.ordersPerLevel)
        expect(runLevel(level2)).toBe(1)
        const pct = 100 + SCORING.survival.levelBonusPct
        expect(apply(level2, deliver(0)).score - level2.score).toBe(Math.floor((40 * pct) / 100))
    })
})

describe("Timed rush waves", () => {
    const RUSH = MODES.timed.rush
    const WAVE = RUSH.atTicks[0]
    // Three regular orders that stay open, so the board is full when the wave arrives.
    const far = [0, 1, 2].map((id) => makeOrder({ id, expiresAt: 100_000 }))

    // A Timed game on the tick before `tick`, with the board full.
    function before(tick: number, overrides: Partial<GameState> = {}): GameState {
        return makeTimed({ tick: tick - 1, orders: far, nextOrderId: 3, ...overrides })
    }

    it("createGame seeds rng.rush with salt 7", () => {
        expect(createGame(1, timed).rng.rush).toBe(seedStream(1, 7))
    })

    it("adds rush.orders short, well-paid orders on a wave tick, from rng.rush", () => {
        const s = before(WAVE)
        const next = step(s, crops)
        expect(rushWaveAt(WAVE)).toBe(0)
        expect(next.orders.slice(0, 3)).toEqual(far)

        const rules = { ...orderRules(s), orderTicks: scalePct(ORDER_TICKS, RUSH.timePct) }
        let rng = s.rng.rush
        const expected: Order[] = []
        for (let i = 0; i < RUSH.orders; i++) {
            const [order, after] = createOrder(3 + i, WAVE, rng, crops, rules)
            expected.push({ ...order, value: scalePct(order.value, RUSH.valuePct), rush: true })
            rng = after
        }
        expect(next.orders.slice(3)).toEqual(expected)
        expect(next.rng.rush).toBe(rng)
        expect(next.nextOrderId).toBe(3 + RUSH.orders)
        expect(next.orders[3].timeLimit).toBe(scalePct(ORDER_TICKS, RUSH.timePct))
    })

    it("leaves rng.orders alone and adds nothing on the ticks either side", () => {
        const s = before(WAVE)
        expect(step(s, crops).rng.orders).toBe(s.rng.orders)
        for (const tick of [WAVE - 1, WAVE + 1]) {
            const t = before(tick)
            const next = step(t, crops)
            expect(next.orders).toEqual(far)
            expect(next.rng.rush).toBe(t.rng.rush)
        }
    })

    it("makes no rush orders in Survival", () => {
        const s = makeState({ tick: WAVE - 1, orders: far, nextOrderId: 3 })
        expect(step(s, crops).orders.some((o) => o.rush)).toBe(false)
    })

    it("makes no regular order until the board drops below openOrders", () => {
        let s = step(before(WAVE), crops)
        const open = s.orders.length
        // Fill one regular order: the board is still at or above openOrders, so nothing comes.
        s = apply({ ...s, inventory: { carrot: 99 } }, { type: "deliver", orderId: 0 })
        s = step(s, crops)
        expect(s.orders.length).toBe(open - 1)
        // Down to one below openOrders: a regular order fills the gap.
        s = step({ ...s, orders: s.orders.slice(0, TIMED_OPEN - 1) }, crops)
        expect(s.orders.length).toBe(TIMED_OPEN)
        expect(s.orders[TIMED_OPEN - 1].rush).toBe(false)
    })

    it("a failed rush order breaks the combo", () => {
        const rush = makeOrder({ id: 3, expiresAt: 99, rush: true })
        const s = makeTimed({
            tick: 99,
            orders: [...far, rush],
            nextOrderId: 4,
            combo: 3,
            comboEndsAt: 500
        })
        const next = step(s, crops)
        expect(next.ordersFailed).toBe(1)
        expect(next.combo).toBe(0)
    })
})

describe("storage", () => {
    const cap = MODES.survival.storageCap
    const readyPumpkin: Plot = { state: "ready", cropId: "pumpkin" }

    it("full storage refuses a harvest and the plot stays ready; selling frees it", () => {
        const full = makeState({ plots: [readyPumpkin], inventory: { garlic: cap } })
        expect(applyAction(full, { type: "harvest", plot: 0 }, crops)).toBeNull()
        const sold = applyAction(full, { type: "sellCrop", cropId: "garlic", amount: 5 }, crops)!
        expect(sold.plots[0]).toEqual(readyPumpkin)
        const harvested = applyAction(sold, { type: "harvest", plot: 0 }, crops)!
        expect(harvested.inventory.pumpkin).toBe(crops.pumpkin.yield)
        expect(harvested.plots[0]).toEqual({ state: "empty" })
    })

    it("a harvest bigger than the space left stores what fits and loses the rest", () => {
        const s = makeState({ plots: [readyPumpkin], inventory: { garlic: cap - 2 } })
        const next = applyAction(s, { type: "harvest", plot: 0 }, crops)!
        expect(next.inventory).toEqual({ garlic: cap - 2, pumpkin: 2 })
        expect(next.plots[0]).toEqual({ state: "empty" })
    })

    it("Timed uses its own cap", () => {
        const t = MODES.timed.storageCap
        const s = makeTimed({ plots: [readyPumpkin], inventory: { garlic: t } })
        expect(applyAction(s, { type: "harvest", plot: 0 }, crops)).toBeNull()
        const room = makeTimed({ plots: [readyPumpkin], inventory: { garlic: t - 1 } })
        expect(applyAction(room, { type: "harvest", plot: 0 }, crops)!.inventory.pumpkin).toBe(1)
    })
})

describe("sellCrop", () => {
    it("removes the crops and pays sellValue", () => {
        const s = makeState({ inventory: { pumpkin: 4, garlic: 1 }, coins: 2 })
        const next = applyAction(s, { type: "sellCrop", cropId: "pumpkin", amount: 3 }, crops)!
        expect(next.inventory).toEqual({ pumpkin: 1, garlic: 1 })
        expect(next.coins).toBe(2 + sellValue(crops.pumpkin, 3))
        const all = applyAction(s, { type: "sellCrop", cropId: "garlic", amount: 1 }, crops)!
        expect(all.inventory).toEqual({ pumpkin: 4 })
    })

    it.each<[string, Action]>([
        ["more than is held", { type: "sellCrop", cropId: "pumpkin", amount: 5 }],
        ["0", { type: "sellCrop", cropId: "pumpkin", amount: 0 }],
        ["a fraction", { type: "sellCrop", cropId: "pumpkin", amount: 1.5 }],
        ["an unknown crop", { type: "sellCrop", cropId: "melon", amount: 1 }],
        ["a crop not held", { type: "sellCrop", cropId: "carrot", amount: 1 }]
    ])("is refused for %s", (_, action) => {
        expect(applyAction(makeState({ inventory: { pumpkin: 4 } }), action, crops)).toBeNull()
    })

    it("selling and making fertilizer are refused while an upgrade offer is open", () => {
        const [offer] = rollOffer(makeState(), "survival", crops)
        const s = makeState({ inventory: { pumpkin: 4 }, upgradeOffer: offer })
        const sell: Action = { type: "sellCrop", cropId: "pumpkin", amount: 1 }
        expect(applyAction(s, sell, crops)).toBeNull()
        expect(applyAction(s, { type: "makeFertilizer", cropId: "pumpkin" }, crops)).toBeNull()
    })
})

describe("fertilizer", () => {
    const growing: Plot = { state: "growing", cropId: "pumpkin", plantedAt: 0, readyAt: 250 }
    // The shipped economy.json locks fertilizer behind Compost.
    const compost = [own("compost", "epic")]

    it("is refused without Compost, and works with it", () => {
        expect(ECONOMY.fertilizer.unlock).toBe("upgrade")
        const make: Action = { type: "makeFertilizer", cropId: "pumpkin" }
        const use: Action = { type: "useFertilizer", plot: 0 }
        const without = makeState({ inventory: { pumpkin: 3 }, plots: [growing], fertilizer: 1 })
        expect(applyAction(without, make, crops)).toBeNull()
        expect(applyAction(without, use, crops)).toBeNull()
        const withIt = { ...without, upgrades: compost }
        expect(applyAction(withIt, make, crops)!.fertilizer).toBe(2)
        expect(applyAction(withIt, use, crops)!.fertilizer).toBe(0)
    })

    it("makeFertilizer uses fertilizerCost crops, freeing storage, and adds 1 fertilizer", () => {
        const s = makeState({ inventory: { garlic: 5 }, upgrades: compost })
        const next = applyAction(s, { type: "makeFertilizer", cropId: "garlic" }, crops)!
        expect(next.inventory).toEqual({ garlic: 5 - crops.garlic.fertilizerCost })
        expect(next.fertilizer).toBe(1)
        const short = makeState({
            inventory: { garlic: crops.garlic.fertilizerCost - 1 },
            upgrades: compost
        })
        expect(applyAction(short, { type: "makeFertilizer", cropId: "garlic" }, crops)).toBeNull()
        expect(applyAction(s, { type: "makeFertilizer", cropId: "melon" }, crops)).toBeNull()
    })

    it("useFertilizer cuts the remaining growth by cutPct, once per planting", () => {
        const s = makeState({ tick: 50, plots: [growing], fertilizer: 2, upgrades: compost })
        const next = applyAction(s, { type: "useFertilizer", plot: 0 }, crops)!
        expect(next.plots[0]).toEqual({
            ...growing,
            readyAt: fertilizedReadyAt(growing, 50),
            fertilized: true
        })
        expect(fertilizedReadyAt(growing, 50)).toBe(
            250 - Math.floor((200 * ECONOMY.fertilizer.cutPct) / 100)
        )
        expect(next.fertilizer).toBe(1)
        expect(applyAction(next, { type: "useFertilizer", plot: 0 }, crops)).toBeNull()
    })

    it.each<[string, Partial<GameState>]>([
        ["an empty plot", { plots: [{ state: "empty" }], fertilizer: 1 }],
        ["a ready plot", { plots: [{ state: "ready", cropId: "garlic" }], fertilizer: 1 }],
        ["a plot with none held", { plots: [growing], fertilizer: 0 }]
    ])("useFertilizer is refused on %s", (_, overrides) => {
        const s = makeState({ ...overrides, upgrades: compost })
        expect(applyAction(s, { type: "useFertilizer", plot: 0 }, crops)).toBeNull()
    })

    it("a fully cut crop turns ready on the next step", () => {
        const almost: Plot = { ...growing, readyAt: 51 }
        const s = makeState({ tick: 50, plots: [almost], fertilizer: 1, upgrades: compost })
        const used = applyAction(s, { type: "useFertilizer", plot: 0 }, crops)!
        expect(step(used, crops).plots[0].state).toBe("ready")
    })

    it("held fertilizer does not count toward storage", () => {
        const s = makeState({
            plots: [{ state: "ready", cropId: "garlic" }],
            inventory: { pumpkin: MODES.survival.storageCap - 2 },
            fertilizer: 10
        })
        expect(applyAction(s, { type: "harvest", plot: 0 }, crops)!.inventory.garlic).toBe(2)
    })
})

describe("rerollOffer", () => {
    function offered(coins: number): GameState {
        const [offer, rng] = rollOffer(makeState(), "survival", crops)
        const s = makeState({ coins, upgradeOffer: offer })
        return { ...s, rng: { ...s.rng, upgrades: rng } }
    }

    it("pays the rising price, counts the reroll and redraws from rng.upgrades", () => {
        let s = offered(100)
        const paid: number[] = []
        for (let n = 0; n < 4; n++) {
            const before = s
            s = applyAction(s, { type: "rerollOffer" }, crops)!
            paid.push(before.coins - s.coins)
            const [offer, rng] = rollOffer(before, "survival", crops)
            expect(s.upgradeOffer).toEqual(offer)
            expect(s.rng.upgrades).toBe(rng)
            expect(s.rerollsThisOffer).toBe(n + 1)
        }
        expect(paid).toEqual([0, 1, 2, 3].map((n) => rerollPrice(n)))
        expect(canReroll(s)).toBe(s.coins >= rerollPriceFor(s))
    })

    it("is refused with no offer open, or with too few coins", () => {
        expect(applyAction(makeState({ coins: 100 }), { type: "rerollOffer" }, crops)).toBeNull()
        expect(applyAction(offered(rerollPrice(0) - 1), { type: "rerollOffer" }, crops)).toBeNull()
        expect(applyAction(offered(rerollPrice(0)), { type: "rerollOffer" }, crops)).not.toBeNull()
    })

    it("the price goes back to its base on the next offer", () => {
        let s = applyAction(offered(100), { type: "rerollOffer" }, crops)!
        s = applyAction(s, { type: "rerollOffer" }, crops)!
        expect(s.rerollsThisOffer).toBe(2)
        // Pick a card, then fill orders until step makes the next offer.
        const card = s.upgradeOffer!.find((c) => UPGRADES.upgrades[c.id].target === null)!
        s = applyAction(s, { type: "chooseUpgrade", upgradeId: card.id }, crops)!
        s = step({ ...s, ordersCompleted: (s.offersMade + 1) * ORDERS_PER_UPGRADE }, crops)
        expect(s.upgradeOffer).not.toBeNull()
        expect(s.rerollsThisOffer).toBe(0)
        expect(rerollPriceFor(s)).toBe(rerollPrice(0))
    })
})

describe("Timed upgrades", () => {
    const COMBO = MODES.timed.combo
    const deliver = (orderId: number): Action => ({ type: "deliver", orderId })
    const amount = (id: string, tier: Tier) => effectAmount(UPGRADES.upgrades[id], 0, tier)
    // Orders due on `tick`, so the speed bonus is 0.
    const due = (tick: number, ids: number[], value = 10) =>
        ids.map((id) => makeOrder({ id, value, expiresAt: tick }))

    it("are all in the Timed pool only", () => {
        const ids = [
            "comboKeeper",
            "comboBuilder",
            "rushPay",
            "headStart",
            "grandFinale",
            "doubleDelivery"
        ]
        for (const id of ids) expect(UPGRADES.upgrades[id].pools).toEqual(["timed"])
    })

    it("createGame starts with no forgiven misses and no open pair", () => {
        const g = createGame(1, timed)
        expect([g.comboMisses, g.pairOpenUntil]).toEqual([0, 0])
    })

    describe("Combo keeper", () => {
        const failing = (tick: number) => makeOrder({ id: 0, expiresAt: tick })
        const at = (overrides: Partial<GameState>) =>
            makeTimed({
                tick: 99,
                orders: [failing(99)],
                nextOrderId: 1,
                combo: 4,
                comboEndsAt: 500,
                ...overrides
            })

        it("forgives comboMissesForgiven failed orders per streak, then breaks", () => {
            const upgrades = [own("comboKeeper", "common")]
            expect(amount("comboKeeper", "common")).toBe(1)
            const kept = step(at({ upgrades }), crops)
            expect(kept.ordersFailed).toBe(1)
            expect([kept.combo, kept.comboMisses]).toEqual([4, 1])
            const second = step({ ...kept, orders: [failing(100)] }, crops)
            expect([second.combo, second.comboMisses, second.comboEndsAt]).toEqual([0, 0, 0])
        })

        it("breaks when more orders fail on one tick than it has left", () => {
            const two = [failing(99), makeOrder({ id: 1, expiresAt: 99 })]
            const next = step(at({ upgrades: [own("comboKeeper", "common")], orders: two }), crops)
            expect(next.combo).toBe(0)
        })

        it("does not save a streak whose window ran out", () => {
            const s = at({ upgrades: [own("comboKeeper", "legendary")], comboEndsAt: 99 })
            expect(step(s, crops).combo).toBe(0)
        })

        it("without it, the first failed order breaks the combo", () => {
            expect(step(at({}), crops).combo).toBe(0)
        })
    })

    it("Combo builder adds comboStepBonusPct per order in a row, under the same cap", () => {
        const upgrades = [own("comboBuilder", "rare")]
        const bonus = amount("comboBuilder", "rare")
        const s = makeTimed({ tick: 100, orders: due(100, [0]), inventory: { carrot: 3 } })
        const two = apply({ ...s, combo: 2, upgrades }, deliver(0))
        expect(two.score).toBe(Math.floor((10 * (100 + 2 * (COMBO.stepPct + bonus))) / 100))
        const capped = apply({ ...s, combo: 1000, upgrades }, deliver(0))
        expect(capped.score).toBe(Math.floor((10 * COMBO.capPct) / 100))
    })

    it("Head start lifts the multiplier from x1, even with no streak", () => {
        const upgrades = [own("headStart", "epic")]
        const start = amount("headStart", "epic")
        const s = makeTimed({ tick: 100, orders: due(100, [0], 20), inventory: { carrot: 3 } })
        expect(apply({ ...s, upgrades }, deliver(0)).score).toBe(
            Math.floor((20 * (100 + start)) / 100)
        )
        expect(comboPctFor({ ...s, upgrades })).toBe(100 + start)
        expect(comboPctFor({ ...s, upgrades, combo: 1000 })).toBe(COMBO.capPct)
        expect(comboPctFor(makeState({ upgrades }))).toBe(100)
    })

    it("Rush pay raises the value of rush orders, and nothing else about them", () => {
        const RUSH = MODES.timed.rush
        const WAVE = RUSH.atTicks[0]
        const far = [0, 1, 2].map((id) => makeOrder({ id, expiresAt: 100_000 }))
        const base = makeTimed({ tick: WAVE - 1, orders: far, nextOrderId: 3 })
        const plain = step(base, crops)
        const paid = step({ ...base, upgrades: [own("rushPay", "legendary")] }, crops)
        const extra = amount("rushPay", "legendary")
        expect(paid.orders.slice(0, 3)).toEqual(far)
        expect(paid.orders).toHaveLength(plain.orders.length)
        for (let i = 3; i < plain.orders.length; i++) {
            expect({ ...paid.orders[i], value: 0 }).toEqual({ ...plain.orders[i], value: 0 })
        }
        const rules = { ...orderRules(base), orderTicks: scalePct(ORDER_TICKS, RUSH.timePct) }
        const [first] = createOrder(3, WAVE, base.rng.rush, crops, rules)
        expect(paid.orders[3].value).toBe(scalePct(first.value, RUSH.valuePct + extra))
        expect(paid.orders[3].value).toBeGreaterThan(plain.orders[3].value)
    })

    describe("Grand finale", () => {
        const FINALE = MODES.timed.runTicks - MODES.timed.finaleTicks
        const at = (tick: number) =>
            makeTimed({
                tick,
                orders: due(tick, [0], 40),
                inventory: { carrot: 3 },
                upgrades: [own("grandFinale", "rare")]
            })

        it("adds finalePct to fills from the last finaleTicks on", () => {
            const pct = amount("grandFinale", "rare")
            expect(apply(at(FINALE), deliver(0)).score).toBe(Math.floor((40 * (100 + pct)) / 100))
            expect(apply(at(FINALE - 1), deliver(0)).score).toBe(40)
        })

        it("does nothing outside Timed", () => {
            expect(isFinale(makeState({ tick: FINALE }))).toBe(false)
        })
    })

    describe("Double delivery", () => {
        const PAIR = MODES.timed.pairTicks
        const ready = (upgrades: OwnedUpgrade[] = [own("doubleDelivery", "epic")]) =>
            makeTimed({
                tick: 100,
                orders: [0, 1, 2].map((id) => makeOrder({ id, value: 40, expiresAt: 100_000 })),
                inventory: { carrot: 99 },
                upgrades
            })
        const gain = (s: GameState, id: number) => apply(s, deliver(id)).score - s.score

        it("a fill opens a pair; one within pairTicks closes it with doubleDeliveryPct", () => {
            const first = apply(ready(), deliver(0))
            expect(first.pairOpenUntil).toBe(100 + PAIR)
            const later = { ...first, tick: 100 + PAIR }
            expect(isPairFill(later)).toBe(true)
            expect(fillBonusPct(later)).toBe(amount("doubleDelivery", "epic"))
            const second = apply(later, deliver(1))
            expect(second.pairOpenUntil).toBe(0)
            // The third fill starts a new pair rather than pairing again.
            const third = apply(second, deliver(2))
            expect(third.pairOpenUntil).toBe(100 + PAIR + PAIR)
            expect(gain(later, 1)).toBe(orderPoints(later, later.orders[0]))
            expect(gain(later, 1)).toBeGreaterThan(gain({ ...later, upgrades: [] }, 1))
        })

        it("a fill after the window does not pair", () => {
            const first = apply(ready(), deliver(0))
            const late = { ...first, tick: 101 + PAIR }
            expect(isPairFill(late)).toBe(false)
            expect(fillBonusPct(late)).toBe(0)
            expect(apply(late, deliver(1)).pairOpenUntil).toBe(101 + PAIR + PAIR)
        })

        it("Finish all neither pays nor changes the pair", () => {
            const on: GameConfig = { mode: "timed", allowPowerUps: true, allowEvents: false }
            const s: GameState = {
                ...createGame(1, on),
                tick: 100,
                pairOpenUntil: 150,
                upgrades: [own("doubleDelivery", "epic")],
                orders: due(100, [0, 1]),
                powerUps: ["finishAll"]
            }
            const all = apply(s, { type: "usePowerUp", slot: 0 })
            expect(all.pairOpenUntil).toBe(150)
            expect(all.score).toBe(0)
        })
    })
})

describe("Bigger barn, Premium produce and Miracle grow", () => {
    const readyPumpkin: Plot = { state: "ready", cropId: "pumpkin" }
    const amount = (id: string, tier: Tier) => effectAmount(UPGRADES.upgrades[id], 0, tier)

    it("Bigger barn raises the storage cap in both modes", () => {
        const extra = amount("biggerBarn", "rare")
        const upgrades = [own("biggerBarn", "rare")]
        expect(storageCap(makeState({ upgrades }))).toBe(MODES.survival.storageCap + extra)
        expect(storageCap(makeTimed({ upgrades }))).toBe(MODES.timed.storageCap + extra)
        // A harvest that wouldn't fit without it now fits.
        const full = { plots: [readyPumpkin], inventory: { garlic: MODES.survival.storageCap } }
        expect(applyAction(makeState(full), { type: "harvest", plot: 0 }, crops)).toBeNull()
        const roomy = applyAction(
            makeState({ ...full, upgrades }),
            { type: "harvest", plot: 0 },
            crops
        )!
        expect(roomy.inventory.pumpkin).toBe(Math.min(crops.pumpkin.yield, extra))
    })

    it("Bigger barn stops being offered once storageBonus is capped", () => {
        const max = UPGRADES.stats.storageBonus.max
        const legendary = amount("biggerBarn", "legendary")
        const copies = Array.from({ length: Math.ceil(max / legendary) }, () =>
            own("biggerBarn", "legendary")
        )
        expect(modifiersFor(copies).storageBonus).toBe(max)
        expect(eligibleUpgrades(makeState(), "survival", crops)).toContain("biggerBarn")
        expect(eligibleUpgrades(makeState({ upgrades: copies }), "survival", crops)).not.toContain(
            "biggerBarn"
        )
    })

    it("Premium produce raises what sellCrop pays", () => {
        const upgrades = [own("premiumProduce", "legendary")]
        const pct = 100 + amount("premiumProduce", "legendary")
        const s = makeState({ inventory: { pumpkin: 8 }, coins: 0, upgrades })
        const next = applyAction(s, { type: "sellCrop", cropId: "pumpkin", amount: 8 }, crops)!
        expect(next.coins).toBe(sellValue(crops.pumpkin, 8, ECONOMY, pct))
        expect(next.coins).toBeGreaterThan(sellValue(crops.pumpkin, 8))
        expect(sellValueFor(s, crops.pumpkin, 8)).toBe(next.coins)
    })

    describe("Miracle grow", () => {
        const growing: Plot = { state: "growing", cropId: "pumpkin", plantedAt: 0, readyAt: 900 }
        const owned = (overrides: Partial<GameState> = {}) =>
            makeState({
                tick: 100,
                plots: [growing, { state: "empty" }],
                upgrades: [own("miracleGrow", "rare")],
                ...overrides
            })
        const use = (plot: number): Action => ({ type: "useMiracleGrow", plot })

        it("starts ready and is shown only once owned", () => {
            expect(createGame(1, config).miracleReadyAt).toBe(0)
            expect(canUseMiracleGrow(makeState({ tick: 100 }))).toBe(false)
            expect(canUseMiracleGrow(owned())).toBe(true)
            expect(miracleTargets(owned())).toEqual([0])
        })

        it("finishes a growing plot and starts the recharge, shorter at higher tiers", () => {
            const next = apply(owned(), use(0))
            expect(next.plots[0]).toEqual({ state: "ready", cropId: "pumpkin" })
            const seconds = 60 + effectAmount(UPGRADES.upgrades.miracleGrow, 1, "rare")
            expect(UPGRADES.stats.miracleRechargeSeconds.base).toBe(60)
            expect(miracleRechargeTicks(next)).toBe(seconds * TICKS_PER_SECOND)
            expect(next.miracleReadyAt).toBe(100 + seconds * TICKS_PER_SECOND)
            const legendary = owned({ upgrades: [own("miracleGrow", "legendary")] })
            expect(miracleRechargeTicks(legendary)).toBeLessThan(miracleRechargeTicks(next))
        })

        it("is refused while recharging, then works again on miracleReadyAt", () => {
            const used = apply(owned({ plots: [growing, growing] }), use(0))
            expect(applyAction(used, use(1), crops)).toBeNull()
            expect(miracleTargets(used)).toEqual([])
            const later = { ...used, tick: used.miracleReadyAt - 1 }
            expect(applyAction(later, use(1), crops)).toBeNull()
            expect(
                applyAction({ ...later, tick: used.miracleReadyAt }, use(1), crops)
            ).not.toBeNull()
        })

        it("refuses without the upgrade, on a plot that isn't growing, a bad index, or an open offer", () => {
            expect(applyAction(owned({ upgrades: [] }), use(0), crops)).toBeNull()
            expect(applyAction(owned(), use(1), crops)).toBeNull()
            expect(applyAction(owned(), use(7), crops)).toBeNull()
            expect(applyAction(owned({ upgradeOffer: OFFER }), use(0), crops)).toBeNull()
        })

        it("the recharge waits while an offer is open, since it counts ticks", () => {
            const used = apply(owned(), use(0))
            const open = { ...used, upgradeOffer: OFFER }
            expect(step(open, crops)).toBe(open)
            expect(canUseMiracleGrow({ ...used, tick: used.miracleReadyAt })).toBe(true)
        })
    })
})

describe("power-ups: Day 9", () => {
    const readyPlot: Plot = { state: "ready", cropId: "garlic" }
    const far = [0, 1, 2].map((id) => makeOrder({ id, expiresAt: 100_000 }))

    // Steps `s` until its tick is `tick`.
    function stepTo(s: GameState, tick: number): GameState {
        let out = s
        while (out.tick < tick) out = step(out, crops)
        return out
    }

    describe("Combo freeze", () => {
        const DURATION = POWER_UPS.powerUps.comboFreeze.durationTicks!

        function streak(overrides: Partial<GameState> = {}): GameState {
            return makeTimed({
                allowPowerUps: true,
                powerUps: ["comboFreeze"],
                combo: 2,
                comboEndsAt: 5,
                orders: far,
                nextOrderId: 3,
                ...overrides
            })
        }

        it("is refused with no streak", () => {
            const s = streak({ combo: 0, comboEndsAt: 0 })
            expect(applyAction(s, { type: "usePowerUp", slot: 0 }, crops)).toBeNull()
        })

        it("holds the combo window still for its length", () => {
            const frozen = apply(streak(), { type: "usePowerUp", slot: 0 })
            const held = stepTo(frozen, 5 + DURATION)
            expect(held.combo).toBe(2)
            expect(held.comboEndsAt).toBe(5 + DURATION)
            expect(step(held, crops).combo).toBe(0)
            // Without it the streak breaks on tick 6.
            expect(stepTo(streak(), 6).combo).toBe(0)
        })

        it("does not stop order timers, so a failed order still breaks the streak", () => {
            const orders = [...far.slice(0, 2), makeOrder({ id: 2, expiresAt: 2 })]
            const frozen = apply(streak({ orders }), { type: "usePowerUp", slot: 0 })
            const after = stepTo(frozen, 3)
            expect(after.ordersFailed).toBe(1)
            expect(after.combo).toBe(0)
        })
    })

    describe("Auto harvest", () => {
        const growingPlot: Plot = { state: "growing", cropId: "garlic", plantedAt: 0, readyAt: 3 }

        function holding(overrides: Partial<GameState> = {}): GameState {
            return makeState({
                allowPowerUps: true,
                powerUps: ["autoHarvest"],
                plots: [readyPlot, growingPlot, { state: "empty" }, { state: "empty" }],
                ...overrides
            })
        }

        it("harvests ready crops on the next steps, and the harvests roll drops", () => {
            const s = apply(holding(), { type: "usePowerUp", slot: 0 })
            const first = step(s, crops)
            expect(first.plots[0]).toEqual({ state: "empty" })
            expect(first.inventory).toEqual({ garlic: 2 })
            expect(first.rng.drops).not.toBe(s.rng.drops)
            const later = stepTo(first, 3)
            expect(later.plots[1]).toEqual({ state: "empty" })
            expect(later.inventory).toEqual({ garlic: 4 })
        })

        it("leaves crops ready with storage full", () => {
            const full = holding()
            const s = apply(
                { ...full, inventory: { garlic: storageCap(full) } },
                { type: "usePowerUp", slot: 0 }
            )
            expect(step(s, crops).plots[0]).toEqual(readyPlot)
        })

        it("leaves crops alone once it ends", () => {
            const s = apply(holding({ plots: [{ state: "empty" }] }), {
                type: "usePowerUp",
                slot: 0
            })
            const ended = stepTo(s, POWER_UPS.powerUps.autoHarvest.durationTicks!)
            const next = step({ ...ended, plots: [readyPlot] }, crops)
            expect(next.plots[0]).toEqual(readyPlot)
        })
    })

    describe("Giant order", () => {
        const GIANT = { orders: 2, coinsPct: 150 }

        function holding(overrides: Partial<GameState> = {}): GameState {
            return makeState({
                allowPowerUps: true,
                powerUps: ["giantOrder"],
                tick: 100,
                orders: [
                    makeOrder({ id: 0, required: { carrot: 3 }, value: 24, expiresAt: 600 }),
                    makeOrder({
                        id: 1,
                        required: { carrot: 2, garlic: 1 },
                        value: 20,
                        expiresAt: 300,
                        tip: 4
                    })
                ],
                nextOrderId: 2,
                ...overrides
            })
        }

        it("is refused with no order open and while a giant order is open", () => {
            const none = holding({ orders: [] })
            expect(applyAction(none, { type: "usePowerUp", slot: 0 }, crops)).toBeNull()
            const once = apply(holding({ powerUps: ["giantOrder", "giantOrder"] }), {
                type: "usePowerUp",
                slot: 0
            })
            expect(applyAction(once, { type: "usePowerUp", slot: 0 }, crops)).toBeNull()
        })

        it("merges every open order into one, drawing nothing", () => {
            const s = holding()
            const next = apply(s, { type: "usePowerUp", slot: 0 })
            // Time left: 500 + 200, times 150%.
            expect(next.orders).toEqual([
                {
                    id: 2,
                    required: { carrot: 5, garlic: 1 },
                    value: 44,
                    expiresAt: 100 + 1050,
                    timeLimit: 1050,
                    small: false,
                    rush: false,
                    tip: 4,
                    mixed: false,
                    giant: GIANT
                }
            ])
            expect(next.nextOrderId).toBe(3)
            expect(next.rng).toBe(s.rng)
        })

        it("merges rush orders too", () => {
            const rush = makeOrder({ id: 1, rush: true, value: 36, expiresAt: 400 })
            const s = holding({ orders: [makeOrder({ id: 0 }), rush] })
            const giant = apply(s, { type: "usePowerUp", slot: 0 }).orders[0]
            expect(giant.rush).toBe(false)
            expect(giant.value).toBe(24 + 36)
            expect(giant.required).toEqual({ carrot: 6 })
        })

        it("blocks new orders while open, and the board fills again after it is filled", () => {
            const s = apply(holding(), { type: "usePowerUp", slot: 0 })
            const waited = stepTo(s, 200)
            expect(waited.orders).toHaveLength(1)
            expect(waited.rng.orders).toBe(s.rng.orders)

            const stocked = { ...waited, inventory: { carrot: 5, garlic: 1 } }
            const filled = apply(stocked, { type: "deliver", orderId: 2 })
            expect(filled.ordersCompleted).toBe(1)
            expect(filled.coins).toBe(scalePct(DIFFICULTY.coinsPerOrder * 2, 150) + 4)
            const refilled = step(filled, crops)
            expect(refilled.orders).toHaveLength(orderRules(refilled).maxOpenOrders)
        })

        it("skips a rush wave that comes due while it is open", () => {
            const WAVE = MODES.timed.rush.atTicks[0]
            const giant = makeOrder({ id: 4, expiresAt: 100_000, giant: GIANT })
            const s = makeTimed({ tick: WAVE - 1, orders: [giant], nextOrderId: 5 })
            const next = step(s, crops)
            expect(next.orders).toEqual([giant])
            expect(next.rng.rush).toBe(s.rng.rush)
        })

        it("failed in Survival: one life, then one more open order until the penalty ends", () => {
            const giant = makeOrder({ id: 4, expiresAt: 100, giant: GIANT })
            const s = makeState({ tick: 100, orders: [giant], nextOrderId: 5 })
            const next = step(s, crops)
            const PENALTY = MODES.survival.giantPenalty
            expect(next.ordersFailed).toBe(1)
            expect(next.lives).toBe(s.lives - 1)
            expect(next.giantPenaltyUntil).toBe(101 + PENALTY.ticks)
            const base = orderRulesFor(runLevel(next)).maxOpenOrders
            expect(next.orders).toHaveLength(base + PENALTY.extraOrders)
            const at = (tick: number) => orderRules({ ...next, tick }).maxOpenOrders
            expect(at(100 + PENALTY.ticks)).toBe(base + PENALTY.extraOrders)
            expect(at(101 + PENALTY.ticks)).toBe(base)
        })

        it("failed in Timed: no order arrives for the penalty, then the board fills again", () => {
            const giant = makeOrder({ id: 4, expiresAt: 100, giant: GIANT })
            const s = makeTimed({ tick: 100, orders: [giant], nextOrderId: 5 })
            const next = step(s, crops)
            const until = 101 + MODES.timed.giantPenalty.ticks
            expect(next.ordersFailed).toBe(1)
            expect(next.orders).toEqual([])
            expect(next.giantPenaltyUntil).toBe(until)
            expect(stepTo(next, until - 1).orders).toEqual([])
            expect(stepTo(next, until).orders).toHaveLength(MODES.timed.openOrders)
        })
    })
})
