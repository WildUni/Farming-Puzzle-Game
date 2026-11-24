import { describe, it, expect } from "vitest"
import {
    validateShop,
    SHOP,
    isShopOpen,
    canOpenShop,
    shopPool,
    rollStock,
    interestFor,
    itemPrice,
    restockPrice,
    sellRefund,
    sellBlock,
    canBuy,
    canBuyAny,
    canRestock,
    isMaxed,
    ordersPerFreeRestock,
    restockBankCap,
    restocksPerCycle,
    ordersToFreeRestock,
    withFilledOrder
} from "./shop"
import { createGame, applyAction, step } from "./main"
import { buildCropTable } from "./plot"
import { TICKS_PER_SECOND, TIERS } from "./game_constants"
import { lifePriceFor } from "./difficulty"
import { storageCap } from "./economy"
import { UPGRADES, luckyWeights, modifiersFor, promotionTargets, rollOffer } from "./upgrades"
import { POWER_UPS } from "./powerups"
import rawShop from "../data/shop.json"
import type {
    Action,
    GameConfig,
    GameState,
    OwnedUpgrade,
    ShopConfig,
    ShopItem,
    ShopState,
    Tier
} from "./types"

const crops = buildCropTable([
    { id: "garlic", growTicks: 80, yield: 2, value: 2, fertilizerCost: 4 },
    { id: "carrot", growTicks: 150, yield: 2, value: 8, fertilizerCost: 2 }
])

const survival: GameConfig = { mode: "survival", allowPowerUps: true, allowEvents: false }
const timed: GameConfig = { mode: "timed", allowPowerUps: true, allowEvents: false }

function makeState(overrides: Partial<GameState> = {}, config = survival, seed = 1): GameState {
    return { ...createGame(seed, config), ...overrides }
}

function own(id: string, tier: Tier = "common", target: number | string | null = null) {
    return { id, tier, target } satisfies OwnedUpgrade
}

function card(id: string, tier: Tier = "common"): ShopItem {
    return { kind: "upgrade", id, tier, sold: false }
}

function shopState(overrides: Partial<ShopState> = {}): ShopState {
    return { open: true, stock: [], freeRestocks: 0, restockProgress: 0, ...overrides }
}

// A state with the shop open, holding `stock`.
function inShop(stock: ShopItem[], overrides: Partial<GameState> = {}, config = survival) {
    return makeState({ coins: 500, shop: shopState({ stock }), ...overrides }, config)
}

function apply(state: GameState, action: Action): GameState {
    const next = applyAction(state, action, crops)
    if (next === null) throw new Error(`expected ${JSON.stringify(action)} to succeed`)
    return next
}

function refused(state: GameState, action: Action) {
    expect(applyAction(state, action, crops)).toBeNull()
}

// Steps once so an order is open, then delivers the first open order. offersMade is high so no
// free pick gets in the way; lives are high so the run never ends.
function deliverOne(state: GameState): GameState {
    let s = step({ ...state, lives: 99, offersMade: 999 }, crops)
    const order = s.orders[0]
    s = { ...s, inventory: { ...order.required } }
    return apply(s, { type: "deliver", orderId: order.id })
}

function deliverMany(state: GameState, n: number): GameState {
    let s = state
    for (let i = 0; i < n; i++) s = deliverOne(s)
    return s
}

const EVERY = SHOP.modes.survival.ordersPerFreeRestock
const CAP = SHOP.restock.bankCap

// ---------------------------------------------------------------------------------------------

describe("validateShop", () => {
    it("accepts the shipped shop.json", () => {
        const config = validateShop(rawShop)
        expect(config.modes.survival.ordersPerFreeRestock).toBe(7)
        expect(config.modes.timed.ordersPerFreeRestock).toBe(7)
        expect(config.restock).toEqual({ price: 10, bankCap: 2 })
        expect(config.tierPrice.common).toBe(rawShop.tierPrice.common)
    })

    it("turns interest.everySeconds into everyTicks", () => {
        expect(validateShop(rawShop).interest.everyTicks).toBe(30 * TICKS_PER_SECOND)
    })

    type Raw = Record<string, any> // eslint-disable-line @typescript-eslint/no-explicit-any
    const bad: [string, (raw: Raw) => unknown][] = [
        ["a missing mode", (r) => delete r.timed],
        ["ordersPerFreeRestock of 0", (r) => (r.survival.ordersPerFreeRestock = 0)],
        ["a fractional ordersPerFreeRestock", (r) => (r.timed.ordersPerFreeRestock = 1.5)],
        ["a negative stock size", (r) => (r.stock.upgrades = -1)],
        ["a missing life flag", (r) => delete r.stock.life],
        ["a missing tier price", (r) => delete r.tierPrice.epic],
        ["an extra tier price", (r) => (r.tierPrice.mythic = 99)],
        ["a tier price of 0", (r) => (r.tierPrice.common = 0)],
        ["a tier price lower than the one before", (r) => (r.tierPrice.legendary = 1)],
        ["a fractional rise", (r) => (r.priceRise.perCopyPct = 2.5)],
        ["a negative progress rise", (r) => (r.priceRise.perProgressPct = -1)],
        ["progressOrders of 0", (r) => (r.priceRise.progressOrders = 0)],
        ["a restock price of 0", (r) => (r.restock.price = 0)],
        ["a bank cap of 0", (r) => (r.restock.bankCap = 0)],
        ["no restock settings", (r) => delete r.restock],
        ["a refund above 100%", (r) => (r.sellRefundPct = 101)],
        ["a negative interest cap", (r) => (r.interest.maxCoins = -1)],
        ["an interest period of 0", (r) => (r.interest.everySeconds = 0)],
        ["no interest settings", (r) => delete r.interest]
    ]
    it.each(bad)("throws for %s", (_, change) => {
        const raw = structuredClone(rawShop) as Raw
        change(raw)
        expect(() => validateShop(raw)).toThrow(/shop config/)
    })
})

// ---------------------------------------------------------------------------------------------

describe("opening and closing", () => {
    it("a new run starts with the shop closed, no stock, an empty bank, Interest one period in", () => {
        const state = makeState()
        expect(state.shop).toEqual({
            open: false,
            stock: null,
            freeRestocks: 0,
            restockProgress: 0
        })
        expect(isShopOpen(state)).toBe(false)
        expect(state.nextInterestAt).toBe(SHOP.interest.everyTicks)
    })

    it("openShop draws the first stock once; closing and opening again keeps it", () => {
        const state = makeState()
        const opened = apply(state, { type: "openShop" })
        expect(isShopOpen(opened)).toBe(true)
        expect(opened.shop.stock).not.toBeNull()
        expect(opened.rng.shop).not.toBe(state.rng.shop)
        const closed = apply(opened, { type: "closeShop" })
        expect(closed.shop.open).toBe(false)
        expect(closed.shop.stock).toEqual(opened.shop.stock)
        const again = apply(closed, { type: "openShop" })
        expect(again.shop.stock).toEqual(opened.shop.stock)
        expect(again.rng.shop).toBe(opened.rng.shop)
    })

    it("while open, step stops; selling crops and making fertilizer work; board moves don't", () => {
        const plots = [
            { state: "empty" },
            { state: "ready", cropId: "garlic" },
            { state: "growing", cropId: "garlic", plantedAt: 0, readyAt: 50 },
            { state: "empty" }
        ] as GameState["plots"]
        const open = inShop([], {
            plots,
            inventory: { carrot: 10, garlic: 10 },
            upgrades: [own("compost", "epic")],
            fertilizer: 1,
            powerUps: ["growthBoost"],
            lives: 1
        })
        expect(step(open, crops)).toBe(open)
        expect(
            apply(open, { type: "sellCrop", cropId: "carrot", amount: 2 }).inventory.carrot
        ).toBe(8)
        expect(apply(open, { type: "makeFertilizer", cropId: "carrot" }).fertilizer).toBe(2)
        refused(open, { type: "plant", plot: 0, cropId: "garlic" })
        refused(open, { type: "harvest", plot: 1 })
        refused(open, { type: "useFertilizer", plot: 2 })
        refused(open, { type: "usePowerUp", slot: 0 })
        refused(open, { type: "buyLife" })
        const withOrder = { ...open, orders: step(makeState(), crops).orders }
        refused(withOrder, { type: "deliver", orderId: withOrder.orders[0].id })
    })

    it("openShop is refused with an offer open, when already open, after the end and in Puzzle", () => {
        const offer = makeState({ upgradeOffer: [{ id: "bigTips", tier: "common" }] })
        refused(offer, { type: "openShop" })
        expect(canOpenShop(offer)).toBe(false)
        refused(inShop([]), { type: "openShop" })
        refused(makeState({ status: "ended" }), { type: "openShop" })
        refused(makeState({}, { ...survival, mode: "puzzle" }), { type: "openShop" })
        expect(canOpenShop(makeState({}, timed))).toBe(true)
    })

    it("closeShop is refused when closed; time moves again after it", () => {
        refused(makeState(), { type: "closeShop" })
        const open = inShop([])
        const closed = apply(open, { type: "closeShop" })
        expect(step(closed, crops).tick).toBe(open.tick + 1)
    })

    it("buyItem, sellUpgrade and restockShop are refused with the shop closed", () => {
        const closed = makeState({
            coins: 500,
            upgrades: [own("bigTips")],
            shop: shopState({ open: false, stock: [card("bigTips")], freeRestocks: 1 })
        })
        refused(closed, { type: "buyItem", slot: 0 })
        refused(closed, { type: "sellUpgrade", index: 0 })
        refused(closed, { type: "restockShop" })
    })

    it("opening the shop pays no Interest", () => {
        const owned = [own("interest", "legendary")]
        expect(apply(makeState({ coins: 50, upgrades: owned }), { type: "openShop" }).coins).toBe(
            50
        )
    })
})

// ---------------------------------------------------------------------------------------------

describe("free restocks", () => {
    it("every 7th filled order adds one; the bank stops at 2 and full-bank orders don't count", () => {
        expect(EVERY).toBe(7)
        let s = deliverMany(makeState(), EVERY - 1)
        expect(s.shop.freeRestocks).toBe(0)
        expect(s.shop.restockProgress).toBe(EVERY - 1)
        expect(ordersToFreeRestock(s)).toBe(1)
        s = deliverOne(s)
        expect(s.shop.freeRestocks).toBe(1)
        expect(s.shop.restockProgress).toBe(0)
        s = deliverMany(s, EVERY)
        expect(s.shop.freeRestocks).toBe(CAP)
        expect(ordersToFreeRestock(s)).toBeNull()
        s = deliverMany(s, 3)
        expect(s.shop).toMatchObject({ freeRestocks: CAP, restockProgress: 0 })
    })

    it("Finish one and Finish all count each order they fill", () => {
        const one = step(makeState({ lives: 99, offersMade: 999, powerUps: ["finishOne"] }), crops)
        const filled = apply(one, { type: "usePowerUp", slot: 0, target: one.orders[0].id })
        expect(filled.shop.restockProgress).toBe(1)
        let s = makeState({ lives: 99, offersMade: 999, ordersCompleted: 30 })
        for (let i = 0; i < 2000 && s.orders.length < 2; i++) s = step(s, crops)
        expect(s.orders.length).toBeGreaterThanOrEqual(2)
        const all = apply({ ...s, powerUps: ["finishAll"] }, { type: "usePowerUp", slot: 0 })
        expect(all.shop.restockProgress).toBe(s.orders.length)
    })

    it("Timed counts filled orders too; Puzzle never does", () => {
        expect(withFilledOrder(makeState({}, timed)).shop.restockProgress).toBe(1)
        const puzzle = makeState({}, { ...survival, mode: "puzzle" })
        expect(withFilledOrder(puzzle)).toBe(puzzle)
        expect(ordersToFreeRestock(puzzle)).toBeNull()
    })

    it("Free restock adds two per cycle, still capped", () => {
        const upgrades = [own("freeRestock", "rare")]
        expect(restocksPerCycle(makeState({ upgrades }))).toBe(2)
        const almost = makeState({ upgrades, shop: shopState({ restockProgress: EVERY - 1 }) })
        expect(withFilledOrder(almost).shop.freeRestocks).toBe(2)
        const one = { ...almost, shop: { ...almost.shop, freeRestocks: 1 } }
        expect(withFilledOrder(one).shop.freeRestocks).toBe(CAP)
    })

    it("Fast restock lowers the orders needed, never below 1", () => {
        const fast = makeState({ upgrades: [own("fastRestock", "legendary")] })
        expect(modifiersFor(fast.upgrades).restockOrdersCut).toBe(3)
        expect(ordersPerFreeRestock(fast)).toBe(EVERY - 3)
        const capped = makeState({
            upgrades: [own("fastRestock", "legendary"), own("fastRestock", "legendary")]
        })
        expect(ordersPerFreeRestock(capped)).toBe(EVERY - 4) // the stat caps at 4
        const tiny: ShopConfig = {
            ...SHOP,
            modes: { ...SHOP.modes, survival: { ordersPerFreeRestock: 2 } }
        }
        expect(ordersPerFreeRestock(capped, tiny)).toBe(1)
    })

    it("Rain check raises the cap", () => {
        const rain = makeState({
            upgrades: [own("rainCheck", "rare")],
            shop: shopState({ open: false, freeRestocks: CAP, restockProgress: EVERY - 1 })
        })
        expect(restockBankCap(rain)).toBe(CAP + 1)
        expect(withFilledOrder(rain).shop.freeRestocks).toBe(CAP + 1)
    })

    it("restockShop uses a banked free restock before coins, then costs restock.price", () => {
        const state = inShop([card("bigTips")], { shop: shopState({ stock: [], freeRestocks: 1 }) })
        expect(restockPrice(state)).toBe(0)
        const free = apply(state, { type: "restockShop" })
        expect(free.coins).toBe(state.coins)
        expect(free.shop.freeRestocks).toBe(0)
        expect(restockPrice(free)).toBe(SHOP.restock.price)
        const paid = apply(free, { type: "restockShop" })
        expect(paid.coins).toBe(state.coins - SHOP.restock.price)
        // The paid price never rises.
        expect(restockPrice(paid)).toBe(SHOP.restock.price)
        const poor = { ...paid, coins: SHOP.restock.price - 1 }
        expect(canRestock(poor)).toBe(false)
        refused(poor, { type: "restockShop" })
        // With a free one banked, no coins are needed.
        expect(canRestock({ ...state, coins: 0 })).toBe(true)
    })

    it("a restock redraws every slot, sold ones and the life slot included", () => {
        const opened = apply(makeState({ coins: 500, lives: 1 }), { type: "openShop" })
        const life = opened.shop.stock!.length - 1
        const bought = apply(opened, { type: "buyItem", slot: life })
        expect(bought.shop.stock![life].sold).toBe(true)
        const next = apply(bought, { type: "restockShop" })
        expect(next.shop.stock!.every((i) => !i.sold)).toBe(true)
        expect(next.shop.stock![life].kind).toBe("life")
        expect(next.rng.shop).not.toBe(bought.rng.shop)
    })
})

// ---------------------------------------------------------------------------------------------

describe("stock", () => {
    it("gives different upgrade cards, then power-ups, then a life in Survival only", () => {
        const [stock] = rollStock(makeState(), crops)
        const upgrades = stock.filter((i) => i.kind === "upgrade")
        expect(upgrades).toHaveLength(SHOP.stock.upgrades)
        expect(new Set(upgrades.map((i) => (i as { id: string }).id)).size).toBe(upgrades.length)
        expect(stock.map((i) => i.kind)).toEqual([
            ...Array(SHOP.stock.upgrades).fill("upgrade"),
            ...Array(SHOP.stock.powerUps).fill("powerUp"),
            "life"
        ])
        const [timedStock] = rollStock(makeState({}, timed), crops)
        expect(timedStock.some((i) => i.kind === "life")).toBe(false)
        expect(stock.every((i) => !i.sold)).toBe(true)
    })

    it("stocks shop-only upgrades, never another mode's, maxed-out ones, Coin bag or Merchant call", () => {
        const seen = new Set<string>()
        const maxed = Array.from({ length: UPGRADES.upgrades.fastGrowth.maxCopies }, () =>
            own("fastGrowth")
        )
        for (let seed = 1; seed <= 300; seed++) {
            const [stock] = rollStock(makeState({ upgrades: maxed }, survival, seed), crops)
            for (const item of stock) if (item.kind !== "life") seen.add(item.id)
        }
        expect(seen.has("extraPlot")).toBe(true)
        expect(seen.has("discountCard")).toBe(true)
        expect(seen.has("fastRestock")).toBe(true)
        expect(seen.has("rainCheck")).toBe(true)
        expect(seen.has("comboKeeper")).toBe(false) // Timed only
        expect(seen.has("fastGrowth")).toBe(false) // at maxCopies
        expect(seen.has("coinBag")).toBe(false)
        expect(seen.has("merchantCall")).toBe(false)
        expect(seen.has("readyOne")).toBe(true)
        expect(seen.has("promotion")).toBe(true) // fastGrowth copies can be promoted
    })

    it("stocks no power-ups with power-ups off", () => {
        const off = makeState({}, { ...survival, allowPowerUps: false })
        expect(rollStock(off, crops)[0].some((i) => i.kind === "powerUp")).toBe(false)
    })

    it("a stocked upgrade that gets capped afterwards stays, Maxed, and can't be bought", () => {
        const max = UPGRADES.upgrades.bigTips.maxCopies
        const state = inShop([card("bigTips"), card("discountCard")])
        expect(isMaxed(state, 0, crops)).toBe(false)
        const full = { ...state, upgrades: Array.from({ length: max }, () => own("bigTips")) }
        expect(isMaxed(full, 0, crops)).toBe(true)
        expect(full.shop.stock![0].kind).toBe("upgrade")
        expect(canBuyAny(full, 0, crops)).toBe(false)
        refused(full, { type: "buyItem", slot: 0 })
        expect(isMaxed(full, 1, crops)).toBe(false)
        // A sold card isn't Maxed, nor a power-up.
        const sold = { ...full, shop: shopState({ stock: [{ ...card("bigTips"), sold: true }] }) }
        expect(isMaxed(sold, 0, crops)).toBe(false)
    })

    it("draws only from rng.shop: restocking never changes later orders, offers or drops", () => {
        const base = apply(makeState({ coins: 500 }), { type: "openShop" })
        const state = makeState()
        expect({ ...base.rng, shop: 0 }).toEqual({ ...state.rng, shop: 0 })
        const restocked = apply(base, { type: "restockShop" })
        const run = (s: GameState) => {
            s = apply(s, { type: "closeShop" })
            for (let i = 0; i < 300; i++) s = step({ ...s, lives: 99, orders: [] }, crops)
            return s
        }
        const a = run(base)
        const b = run(restocked)
        expect(b.rng.orders).toBe(a.rng.orders)
        expect(b.rng.upgrades).toBe(a.rng.upgrades)
        expect(b.rng.drops).toBe(a.rng.drops)
        expect(b.nextOrderId).toBe(a.nextOrderId)
    })
})

// ---------------------------------------------------------------------------------------------

describe("prices", () => {
    const tp = SHOP.tierPrice
    const { perCopyPct, perProgressPct, progressOrders } = SHOP.priceRise

    it("an upgrade costs its tier's price, rising per copy owned and per progress step", () => {
        expect(itemPrice(inShop([card("bigTips")]), 0)).toBe(tp.common)
        expect(itemPrice(inShop([card("bigTips", "epic")]), 0)).toBe(tp.epic)
        const copies = inShop([card("bigTips")], { upgrades: [own("bigTips"), own("bigTips")] })
        expect(itemPrice(copies, 0)).toBe(Math.round((tp.common * (100 + 2 * perCopyPct)) / 100))
        const almost = inShop([card("bigTips")], { ordersCompleted: 2 * progressOrders - 1 })
        expect(itemPrice(almost, 0)).toBe(Math.round((tp.common * (100 + perProgressPct)) / 100))
        const later = inShop([card("bigTips")], { ordersCompleted: 2 * progressOrders })
        expect(itemPrice(later, 0)).toBe(Math.round((tp.common * (100 + 2 * perProgressPct)) / 100))
    })

    it("each rise turns off at 0", () => {
        const flat: ShopConfig = {
            ...SHOP,
            priceRise: { perCopyPct: 0, perProgressPct: 0, progressOrders }
        }
        const state = inShop([card("bigTips")], { upgrades: [own("bigTips")], ordersCompleted: 40 })
        expect(itemPrice(state, 0, flat)).toBe(tp.common)
    })

    it("Discount card lowers prices at once", () => {
        const state = inShop([card("discountCard", "legendary"), card("bigTips", "rare")])
        const bought = apply(state, { type: "buyItem", slot: 0 })
        expect(itemPrice(bought, 1)).toBe(Math.round((tp.rare * 80) / 100))
    })

    it("a power-up rises with progress only; a life costs lifePriceFor", () => {
        const item: ShopItem = { kind: "powerUp", id: "readyOne", sold: false }
        const base = POWER_UPS.powerUps.readyOne.shopPrice
        expect(itemPrice(inShop([item]), 0)).toBe(base)
        const later = inShop([item], { ordersCompleted: 2 * progressOrders })
        expect(itemPrice(later, 0)).toBe(Math.round((base * (100 + 2 * perProgressPct)) / 100))
        const life = inShop([{ kind: "life", sold: false }], { lives: 1 })
        expect(itemPrice(life, 0)).toBe(lifePriceFor(life))
        const bought = apply(life, { type: "buyItem", slot: 0 })
        expect(lifePriceFor(bought)).toBeGreaterThan(lifePriceFor(life))
    })

    it("a sold copy refunds sellRefundPct of its tier's price, rounded down", () => {
        for (const tier of TIERS) {
            expect(sellRefund(own("bigTips", tier))).toBe(
                Math.floor((tp[tier] * SHOP.sellRefundPct) / 100)
            )
        }
    })
})

// ---------------------------------------------------------------------------------------------

describe("Interest", () => {
    const PERIOD = SHOP.interest.everyTicks
    const owned = [own("interest", "legendary")] // 12%
    // A state one tick before the next Interest payment.
    const due = (overrides: Partial<GameState> = {}) =>
        makeState({ tick: PERIOD - 1, upgrades: owned, ...overrides })

    it("a new run's first payment is one period in", () => {
        expect(PERIOD).toBe(30 * TICKS_PER_SECOND)
        expect(makeState().nextInterestAt).toBe(PERIOD)
    })

    it("pays its % of held coins on nextInterestAt, up to interest.maxCoins", () => {
        const paid = step(due({ coins: 50 }), crops)
        expect(paid.coins).toBe(56)
        expect(paid.nextInterestAt).toBe(2 * PERIOD)
        expect(step(due({ coins: 1000 }), crops).coins).toBe(1000 + SHOP.interest.maxCoins)
        expect(interestFor(makeState({ coins: 1000, upgrades: owned }))).toBe(
            SHOP.interest.maxCoins
        )
        expect(step(due({ coins: 50, tick: PERIOD - 2 }), crops).coins).toBe(50)
    })

    it("moves the timer on with no Interest owned, paying nothing", () => {
        const paid = step(due({ coins: 50, upgrades: [] }), crops)
        expect(paid.coins).toBe(50)
        expect(paid.nextInterestAt).toBe(2 * PERIOD)
    })

    it("pays nothing while the shop is open, since play time doesn't pass", () => {
        const open = due({ coins: 50, shop: shopState() })
        expect(step(open, crops)).toBe(open)
    })
})

// ---------------------------------------------------------------------------------------------

describe("buying and selling", () => {
    it("buyItem takes the price, marks the slot sold and adds the upgrade", () => {
        const state = inShop([card("bigTips", "rare")])
        const price = itemPrice(state, 0)!
        const next = apply(state, { type: "buyItem", slot: 0 })
        expect(next.coins).toBe(state.coins - price)
        expect(next.shop.stock![0].sold).toBe(true)
        expect(next.upgrades).toEqual([own("bigTips", "rare")])
        refused(next, { type: "buyItem", slot: 0 })
    })

    it("buys a targeted upgrade onto the chosen plot, and Extra plot adds a plot", () => {
        const state = inShop([card("richSoil", "rare"), card("extraPlot", "rare")])
        refused(state, { type: "buyItem", slot: 0 })
        const soil = apply(state, { type: "buyItem", slot: 0, target: 1 })
        expect(soil.upgrades).toEqual([own("richSoil", "rare", 1)])
        const plot = apply(soil, { type: "buyItem", slot: 1 })
        expect(plot.plots).toHaveLength(state.plots.length + 1)
    })

    it("buys a power-up into a free slot and a life up to the cap", () => {
        const pu: ShopItem = { kind: "powerUp", id: "readyOne", sold: false }
        const state = inShop([pu, { kind: "life", sold: false }], { lives: 1 })
        const next = apply(apply(state, { type: "buyItem", slot: 0 }), { type: "buyItem", slot: 1 })
        expect(next.powerUps).toEqual(["readyOne"])
        expect(next.lives).toBe(2)
        expect(next.livesBought).toBe(1)
    })

    it("refuses buyItem in each case", () => {
        const stock = [card("bigTips"), { kind: "powerUp", id: "readyOne", sold: false } as const]
        refused(inShop(stock), { type: "buyItem", slot: 5 })
        refused(inShop(stock), { type: "buyItem", slot: 0.5 })
        refused(inShop(stock, { coins: 1 }), { type: "buyItem", slot: 0 })
        refused(inShop(stock), { type: "buyItem", slot: 0, target: 1 }) // untargeted
        const maxed = Array.from({ length: 5 }, () => own("bigTips"))
        refused(inShop(stock, { upgrades: maxed }), { type: "buyItem", slot: 0 })
        refused(inShop(stock, { powerUps: ["readyOne", "readyOne"] }), { type: "buyItem", slot: 1 })
        refused(inShop([{ kind: "life", sold: false }]), { type: "buyItem", slot: 0 }) // full lives
        expect(canBuyAny(inShop(stock, { coins: 1 }), 0, crops)).toBe(false)
        expect(canBuy(inShop(stock), 0, null, crops)).toBe(true)
    })

    it("sellUpgrade removes the copy, pays its refund and frees a copy and a target", () => {
        const state = inShop([], {
            upgrades: [own("bigTips", "epic"), own("greenhouse", "rare", 0)]
        })
        const next = apply(state, { type: "sellUpgrade", index: 0 })
        expect(next.upgrades).toEqual([own("greenhouse", "rare", 0)])
        expect(next.coins).toBe(state.coins + sellRefund(own("bigTips", "epic")))
    })

    it("refuses sellUpgrade in each case, saying why", () => {
        expect(sellBlock(makeState({ upgrades: [own("bigTips")] }), 0)).toBe("closed")
        expect(sellBlock(inShop([], { upgrades: [own("bigTips")] }), 1)).toBe("closed")
        expect(sellBlock(inShop([], { upgrades: [own("extraHeart", "rare")] }), 0)).toBe(
            "notSellable"
        )
        const bumper = [own("bumperHarvest"), own("biggerBumper")]
        expect(sellBlock(inShop([], { upgrades: bumper }), 0)).toBe("required")
        expect(sellBlock(inShop([], { upgrades: [...bumper, own("bumperHarvest")] }), 0)).toBeNull()
        const barn = inShop([], { upgrades: [own("biggerBarn")] })
        const full = { ...barn, inventory: { garlic: storageCap(barn) } }
        expect(sellBlock(full, 0)).toBe("storage")
        refused(full, { type: "sellUpgrade", index: 0 })
    })
})

// ---------------------------------------------------------------------------------------------

describe("shop-only upgrades", () => {
    it("Rich soil adds a crop to harvests on its plot only", () => {
        const ready = [
            { state: "ready", cropId: "garlic" },
            { state: "ready", cropId: "garlic" }
        ] as GameState["plots"]
        const state = makeState({ plots: ready, upgrades: [own("richSoil", "rare", 1)] })
        expect(apply(state, { type: "harvest", plot: 0 }).inventory.garlic).toBe(2)
        expect(apply(state, { type: "harvest", plot: 1 }).inventory.garlic).toBe(3)
    })

    it("Quick soil takes its seconds off crops planted on its plot only, leaving at least 1 tick", () => {
        const state = makeState({ upgrades: [own("quickSoil", "rare", 0)] })
        const cut = 5 * TICKS_PER_SECOND
        const on = apply(state, { type: "plant", plot: 0, cropId: "carrot" }).plots[0]
        const off = apply(state, { type: "plant", plot: 1, cropId: "carrot" }).plots[1]
        expect(on).toMatchObject({ readyAt: 150 - cut })
        expect(off).toMatchObject({ readyAt: 150 })
        const tiny = buildCropTable([
            { id: "seed", growTicks: 3, yield: 1, value: 1, fertilizerCost: 1 }
        ])
        const planted = applyAction(state, { type: "plant", plot: 0, cropId: "seed" }, tiny)!
        expect(planted.plots[0]).toMatchObject({ readyAt: 1 })
    })

    it("Auto-harvester harvests its plot on the step it turns ready, and waits on full storage", () => {
        const growing = [
            { state: "growing", cropId: "garlic", plantedAt: 0, readyAt: 1 },
            { state: "growing", cropId: "garlic", plantedAt: 0, readyAt: 1 }
        ] as GameState["plots"]
        const state = makeState({ plots: growing, upgrades: [own("autoHarvester", "epic", 0)] })
        const next = step(state, crops)
        expect(next.plots[0].state).toBe("empty")
        expect(next.plots[1].state).toBe("ready")
        expect(next.inventory.garlic).toBe(2)
        const full = step({ ...state, inventory: { carrot: storageCap(state) } }, crops)
        expect(full.plots[0].state).toBe("ready")
    })

    it("Lucky stars shifts free-pick weights and leaves shop stock alone", () => {
        expect(luckyWeights(0)).toEqual({
            common: 40,
            uncommon: 30,
            rare: 15,
            epic: 10,
            legendary: 5
        })
        expect(luckyWeights(60)).toEqual({
            common: 40,
            uncommon: 48,
            rare: 33,
            epic: 28,
            legendary: 17
        })
        // Owning Lucky stars changes offers but not the stock drawn from the same stream state.
        const lucky = makeState({ upgrades: [own("luckyStars", "legendary")] })
        const plain = makeState()
        expect(modifiersFor(lucky.upgrades).tierLuck).toBe(30)
        const tiersOf = (s: GameState) => {
            const counts: Record<string, number> = {}
            for (let seed = 1; seed <= 300; seed++) {
                const [offer] = rollOffer(
                    { ...s, rng: { ...s.rng, upgrades: seed } },
                    "survival",
                    crops
                )
                for (const c of offer) counts[c.tier] = (counts[c.tier] ?? 0) + 1
            }
            return counts
        }
        expect(tiersOf(lucky).common).toBeLessThan(tiersOf(plain).common)
        const stockTiers = (s: GameState) =>
            rollStock({ ...s, upgrades: [] }, crops)[0].map((i) =>
                i.kind === "upgrade" ? i.tier : i.kind
            )
        expect(stockTiers(lucky)).toEqual(stockTiers(plain))
    })

    it("Promotion raises an owned copy one tier in place and respects the stat cap", () => {
        // bumperChance caps at 50: legendary 25 + epic 18 + common 5 = 48.
        const near = [
            own("bumperHarvest", "legendary"),
            own("bumperHarvest", "epic"),
            own("bumperHarvest")
        ]
        const state = inShop([card("promotion", "epic")], { upgrades: near })
        expect(promotionTargets(near)).toEqual([1, 2]) // never the legendary copy
        const next = apply(state, { type: "buyItem", slot: 0, target: 2 })
        expect(next.upgrades[2]).toEqual(own("bumperHarvest", "uncommon"))
        expect(next.upgrades).toHaveLength(3)
        expect(modifiersFor(next.upgrades).bumperChance).toBe(50) // only what was left
        refused(state, { type: "buyItem", slot: 0, target: 0 })
        refused(state, { type: "buyItem", slot: 0 })
    })

    it("Promotion skips non-tiered and capped copies, and isn't stocked with nothing to raise", () => {
        expect(promotionTargets([own("extraPlot", "rare")])).toEqual([])
        const capped = Array.from({ length: 4 }, () => own("fastGrowth", "legendary"))
        expect(promotionTargets([...capped, own("fastGrowth")])).toEqual([])
        expect(shopPool(makeState(), crops)).not.toContain("promotion")
        expect(shopPool(makeState({ upgrades: [own("bigTips")] }), crops)).toContain("promotion")
    })
})
