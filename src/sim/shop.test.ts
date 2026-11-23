import { describe, it, expect } from "vitest"
import {
    validateShop,
    SHOP,
    isShopDue,
    isShopPaused,
    shopPool,
    rollStock,
    openShop,
    itemPrice,
    restockPrice,
    sellRefund,
    sellBlock,
    canBuy,
    canBuyAny
} from "./shop"
import { createGame, applyAction, step } from "./main"
import { buildCropTable } from "./plot"
import { TICKS_PER_SECOND, TIERS } from "./game_constants"
import { MODES } from "./modes"
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

// A state with a pausing shop open on its first visit, holding `stock`.
function inShop(stock: ShopItem[], overrides: Partial<GameState> = {}, config = survival) {
    return makeState(
        { coins: 500, shopVisits: 1, shop: { stock, restocks: 0, closesAt: null }, ...overrides },
        config
    )
}

function apply(state: GameState, action: Action): GameState {
    const next = applyAction(state, action, crops)
    if (next === null) throw new Error(`expected ${JSON.stringify(action)} to succeed`)
    return next
}

const ORDERS = SHOP.modes.survival.open as { kind: "orders"; every: number; offset: number }
const SECONDS = SHOP.modes.timed.open as { kind: "seconds"; at: number[] }

// ---------------------------------------------------------------------------------------------

describe("validateShop", () => {
    it("accepts the shipped shop.json, with no closing time on a pausing shop", () => {
        const config = validateShop(rawShop)
        expect(config.modes.survival.pauses).toBe(true)
        expect(config.modes.survival.openTicks).toBeNull()
        expect(config.tierPrice.common).toBe(rawShop.tierPrice.common)
    })

    it("turns openSeconds into openTicks for a running shop", () => {
        const raw = structuredClone(rawShop) as Raw
        raw.timed = { ...raw.timed, pauses: false, openSeconds: 12 }
        expect(validateShop(raw).modes.timed.openTicks).toBe(12 * TICKS_PER_SECOND)
    })

    type Raw = Record<string, any> // eslint-disable-line @typescript-eslint/no-explicit-any
    const bad: [string, (raw: Raw) => unknown][] = [
        ["a missing mode", (r) => delete r.timed],
        ["an unknown open kind", (r) => (r.survival.open = { kind: "daily" })],
        ["every 0", (r) => (r.survival.open.every = 0)],
        ["a negative offset", (r) => (r.survival.open.offset = -1)],
        ["seconds that don't rise", (r) => (r.timed.open.at = [100, 100])],
        ["a second below 1", (r) => (r.timed.open.at = [0])],
        ["pauses that isn't a boolean", (r) => (r.survival.pauses = "yes")],
        ["openSeconds on a pausing shop", (r) => (r.survival.openSeconds = 10)],
        ["no openSeconds on a running shop", (r) => (r.survival.pauses = false)],
        ["a negative stock size", (r) => (r.stock.upgrades = -1)],
        ["a missing life flag", (r) => delete r.stock.life],
        ["a missing tier price", (r) => delete r.tierPrice.epic],
        ["an extra tier price", (r) => (r.tierPrice.mythic = 99)],
        ["a tier price of 0", (r) => (r.tierPrice.common = 0)],
        ["a tier price lower than the one before", (r) => (r.tierPrice.legendary = 1)],
        ["a fractional rise", (r) => (r.priceRise.perCopyPct = 2.5)],
        ["a restock base of 0", (r) => (r.restock.base = 0)],
        ["a restock growth below 1", (r) => (r.restock.growth = 0.5)],
        ["a refund above 100%", (r) => (r.sellRefundPct = 101)],
        ["a negative interest cap", (r) => (r.interestMaxCoins = -1)]
    ]
    it.each(bad)("throws for %s", (_, change) => {
        const raw = structuredClone(rawShop) as Raw
        change(raw)
        expect(() => validateShop(raw)).toThrow(/shop config/)
    })
})

// ---------------------------------------------------------------------------------------------

describe("shop schedule", () => {
    it("Survival: due from `offset` filled orders, then every `every` more", () => {
        expect(isShopDue(makeState({ ordersCompleted: ORDERS.offset - 1 }))).toBe(false)
        expect(isShopDue(makeState({ ordersCompleted: ORDERS.offset }))).toBe(true)
        const after = { ordersCompleted: ORDERS.offset + ORDERS.every - 1, shopVisits: 1 }
        expect(isShopDue(makeState(after))).toBe(false)
        expect(isShopDue(makeState({ ...after, ordersCompleted: after.ordersCompleted + 1 }))).toBe(
            true
        )
    })

    it("opens a pausing shop on the step after the offset-th filled order", () => {
        // offersMade is set so no free pick is due on the same step.
        const state = makeState({ ordersCompleted: ORDERS.offset, offersMade: 99 })
        const next = step(state, crops)
        expect(next.shop).not.toBeNull()
        expect(next.shop!.closesAt).toBeNull()
        expect(next.shopVisits).toBe(1)
        expect(isShopPaused(next)).toBe(true)
    })

    it("opens the shop on the step after the pick when an offer is due at the same time", () => {
        const state = makeState({ ordersCompleted: ORDERS.offset + 2, offersMade: 1 })
        const offered = step(state, crops)
        expect(offered.upgradeOffer).not.toBeNull()
        expect(offered.shop).toBeNull()
        const c = offered.upgradeOffer![0]
        const def = UPGRADES.upgrades[c.id]
        const picked = apply(offered, {
            type: "chooseUpgrade",
            upgradeId: c.id,
            ...(def.target === "crop" ? { target: "carrot" } : {})
        })
        const next = step(picked, crops)
        expect(next.shop).not.toBeNull()
        expect(next.tick).toBe(picked.tick + 1)
    })

    it("stops the clock and every non-shop action while a pausing shop is open", () => {
        const open = inShop([])
        expect(step(open, crops)).toBe(open)
        expect(applyAction(open, { type: "plant", plot: 0, cropId: "garlic" }, crops)).toBeNull()
        expect(applyAction(open, { type: "buyLife" }, crops)).toBeNull()
        const closed = apply(open, { type: "closeShop" })
        expect(closed.shop).toBeNull()
        expect(step(closed, crops).tick).toBe(open.tick + 1)
    })

    it("Timed: opens on the tick of each second in `at`, once each", () => {
        const [first] = SECONDS.at
        const before = makeState({ tick: first * TICKS_PER_SECOND - 2 }, timed)
        const one = step(before, crops)
        expect(one.shop).toBeNull()
        const two = step(one, crops)
        expect(two.tick).toBe(first * TICKS_PER_SECOND)
        expect(two.shop).not.toBeNull()
        // After the last listed second nothing more is due.
        const last = SECONDS.at[SECONDS.at.length - 1] * TICKS_PER_SECOND
        const done = makeState({ tick: last + 50, shopVisits: SECONDS.at.length }, timed)
        expect(isShopDue(done)).toBe(false)
    })

    it("a running shop keeps the clock going and closes on closesAt", () => {
        const running: ShopConfig = {
            ...SHOP,
            modes: { ...SHOP.modes, timed: { ...SHOP.modes.timed, pauses: false, openTicks: 3 } }
        }
        const opened = openShop(makeState({ tick: 100, shopVisits: 2 }, timed), crops, running)
        expect(opened.shop!.closesAt).toBe(103)
        expect(isShopPaused(opened)).toBe(false)
        // Other actions work while it is open.
        expect(applyAction(opened, { type: "plant", plot: 0, cropId: "garlic" }, crops)).not.toBe(
            null
        )
        let s = step(opened, crops)
        expect(s.tick).toBe(101)
        expect(s.shop).not.toBeNull()
        s = step(step(s, crops), crops)
        expect(s.tick).toBe(103)
        expect(s.shop).toBeNull()
    })

    it("an offer opened over a running shop stops its closing time too", () => {
        const opened = {
            ...makeState({ tick: 100 }, timed),
            shop: { stock: [], restocks: 0, closesAt: 101 },
            upgradeOffer: [{ id: "fastGrowth", tier: "common" as Tier }]
        }
        expect(step(opened, crops)).toBe(opened)
        expect(applyAction(opened, { type: "closeShop" }, crops)).toBeNull()
    })

    it("never opens in Puzzle, and the run ending closes a running shop", () => {
        const puzzle = makeState({ ordersCompleted: 50 }, { ...survival, mode: "puzzle" })
        expect(isShopDue(puzzle)).toBe(false)
        const end = makeState(
            {
                tick: MODES.timed.runTicks - 1,
                shopVisits: 2,
                shop: { stock: [], restocks: 0, closesAt: MODES.timed.runTicks + 50 }
            },
            timed
        )
        const ended = step(end, crops)
        expect(ended.status).toBe("ended")
        expect(ended.shop).toBeNull()
    })
})

// ---------------------------------------------------------------------------------------------

describe("rollStock", () => {
    it("gives different upgrade cards, then power-ups, then a life in Survival only", () => {
        const [stock] = rollStock(makeState({ shopVisits: 1 }), crops)
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

    it("stocks shop-only upgrades, never another mode's, never maxed-out ones or Coin bag", () => {
        const seen = new Set<string>()
        const maxed = Array.from({ length: UPGRADES.upgrades.fastGrowth.maxCopies }, () =>
            own("fastGrowth")
        )
        for (let seed = 1; seed <= 200; seed++) {
            const [stock] = rollStock(makeState({ upgrades: maxed }, survival, seed), crops)
            for (const item of stock) if (item.kind !== "life") seen.add(item.id)
        }
        expect(seen.has("extraPlot")).toBe(true)
        expect(seen.has("discountCard")).toBe(true)
        expect(seen.has("comboKeeper")).toBe(false) // Timed only
        expect(seen.has("fastGrowth")).toBe(false) // at maxCopies
        expect(seen.has("coinBag")).toBe(false)
        expect(seen.has("promotion")).toBe(true) // fastGrowth copies can be promoted
    })

    it("stocks no power-ups with power-ups off", () => {
        const off = makeState({}, { ...survival, allowPowerUps: false })
        expect(rollStock(off, crops)[0].some((i) => i.kind === "powerUp")).toBe(false)
    })

    it("draws only from rng.shop", () => {
        const state = makeState({ ordersCompleted: ORDERS.offset })
        const opened = openShop(state, crops)
        expect(opened.rng.shop).not.toBe(state.rng.shop)
        expect({ ...opened.rng, shop: 0 }).toEqual({ ...state.rng, shop: 0 })
    })

    it("restocking never changes later orders or offers", () => {
        const base = inShop([card("bigTips")])
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
        expect(b.nextOrderId).toBe(a.nextOrderId)
    })
})

// ---------------------------------------------------------------------------------------------

describe("prices", () => {
    const tp = SHOP.tierPrice
    const { perCopyPct, perVisitPct } = SHOP.priceRise

    it("an upgrade costs its tier's price, rising per copy owned and per earlier visit", () => {
        expect(itemPrice(inShop([card("bigTips")]), 0)).toBe(tp.common)
        expect(itemPrice(inShop([card("bigTips", "epic")]), 0)).toBe(tp.epic)
        const copies = inShop([card("bigTips")], { upgrades: [own("bigTips"), own("bigTips")] })
        expect(itemPrice(copies, 0)).toBe(Math.round((tp.common * (100 + 2 * perCopyPct)) / 100))
        const later = inShop([card("bigTips")], { shopVisits: 3 })
        expect(itemPrice(later, 0)).toBe(Math.round((tp.common * (100 + 2 * perVisitPct)) / 100))
    })

    it("each rise turns off at 0", () => {
        const flat: ShopConfig = { ...SHOP, priceRise: { perCopyPct: 0, perVisitPct: 0 } }
        const state = inShop([card("bigTips")], { upgrades: [own("bigTips")], shopVisits: 4 })
        expect(itemPrice(state, 0, flat)).toBe(tp.common)
    })

    it("Discount card lowers prices at once, in the same visit", () => {
        const state = inShop([card("discountCard", "legendary"), card("bigTips", "rare")])
        const bought = apply(state, { type: "buyItem", slot: 0 })
        expect(itemPrice(bought, 1)).toBe(Math.round((tp.rare * 80) / 100))
    })

    it("a power-up rises per visit only; a life costs lifePriceFor", () => {
        const item: ShopItem = { kind: "powerUp", id: "readyOne", sold: false }
        const base = POWER_UPS.powerUps.readyOne.shopPrice
        expect(itemPrice(inShop([item]), 0)).toBe(base)
        const visit3 = inShop([item], { shopVisits: 3 })
        expect(itemPrice(visit3, 0)).toBe(Math.round((base * (100 + 2 * perVisitPct)) / 100))
        const life = inShop([{ kind: "life", sold: false }], { lives: 1 })
        expect(itemPrice(life, 0)).toBe(lifePriceFor(life))
        const bought = apply(life, { type: "buyItem", slot: 0 })
        expect(lifePriceFor(bought)).toBeGreaterThan(lifePriceFor(life))
    })

    it("restocks cost 5, 8, 11, 17 and reset on the next visit; Free restock makes one free", () => {
        let state = inShop([card("bigTips")])
        const prices: number[] = []
        for (let i = 0; i < 4; i++) {
            prices.push(restockPrice(state))
            state = apply(state, { type: "restockShop" })
        }
        expect(prices).toEqual([5, 8, 11, 17])
        const next = openShop(apply(state, { type: "closeShop" }), crops)
        expect(restockPrice(next)).toBe(5)
        const free = inShop([], { upgrades: [own("freeRestock", "rare")] })
        expect(restockPrice(free)).toBe(0)
        expect(restockPrice(apply(free, { type: "restockShop" }))).toBe(5)
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

describe("shop actions", () => {
    it("buyItem takes the price, marks the slot sold and adds the upgrade", () => {
        const state = inShop([card("bigTips", "rare")])
        const price = itemPrice(state, 0)!
        const next = apply(state, { type: "buyItem", slot: 0 })
        expect(next.coins).toBe(state.coins - price)
        expect(next.shop!.stock[0].sold).toBe(true)
        expect(next.upgrades).toEqual([own("bigTips", "rare")])
        expect(applyAction(next, { type: "buyItem", slot: 0 }, crops)).toBeNull()
    })

    it("buys a targeted upgrade onto the chosen plot, and Extra plot adds a plot", () => {
        const state = inShop([card("richSoil", "rare"), card("extraPlot", "rare")])
        expect(applyAction(state, { type: "buyItem", slot: 0 }, crops)).toBeNull()
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
        const refused = (state: GameState, action: Action) =>
            expect(applyAction(state, action, crops)).toBeNull()
        refused(makeState({ coins: 500 }), { type: "buyItem", slot: 0 }) // shop closed
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
        expect(applyAction(full, { type: "sellUpgrade", index: 0 }, crops)).toBeNull()
    })

    it("restockShop replaces the stock and is refused without the coins", () => {
        const state = inShop([{ ...card("bigTips"), sold: true }])
        const next = apply(state, { type: "restockShop" })
        expect(next.shop!.restocks).toBe(1)
        expect(next.shop!.stock.every((i) => !i.sold)).toBe(true)
        expect(next.coins).toBe(state.coins - 5)
        expect(applyAction({ ...state, coins: 4 }, { type: "restockShop" }, crops)).toBeNull()
        expect(applyAction(makeState(), { type: "closeShop" }, crops)).toBeNull()
    })

    it("Interest adds its % of held coins on opening, up to interestMaxCoins", () => {
        const owned = [own("interest", "legendary")] // 12%
        expect(openShop(makeState({ coins: 50, upgrades: owned }), crops).coins).toBe(56)
        const rich = openShop(makeState({ coins: 1000, upgrades: owned }), crops)
        expect(rich.coins).toBe(1000 + SHOP.interestMaxCoins)
        expect(openShop(makeState({ coins: 50 }), crops).coins).toBe(50)
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
        const lucky = makeState({ upgrades: [own("luckyStars", "legendary")], shopVisits: 1 })
        const plain = makeState({ shopVisits: 1 })
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
        expect(applyAction(state, { type: "buyItem", slot: 0, target: 0 }, crops)).toBeNull()
        expect(applyAction(state, { type: "buyItem", slot: 0 }, crops)).toBeNull()
    })

    it("Promotion skips non-tiered and capped copies, and isn't stocked with nothing to raise", () => {
        expect(promotionTargets([own("extraPlot", "rare")])).toEqual([])
        const capped = Array.from({ length: 4 }, () => own("fastGrowth", "legendary"))
        expect(promotionTargets([...capped, own("fastGrowth")])).toEqual([])
        expect(shopPool(makeState(), crops)).not.toContain("promotion")
        expect(shopPool(makeState({ upgrades: [own("bigTips")] }), crops)).toContain("promotion")
    })
})
