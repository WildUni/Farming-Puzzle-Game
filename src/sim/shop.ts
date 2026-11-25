// The shop: opening it, its stock, the free restock bank, prices, refunds and what can be
// bought or sold. The actions themselves live in main.ts. See specs/shop.md.
import type {
    CropTable,
    GameState,
    OwnedUpgrade,
    Pool,
    RNGState,
    ShopConfig,
    ShopItem,
    ShopModeConfig,
    Tier,
    UpgradeTarget
} from "./types"
import { TICKS_PER_SECOND, TIERS } from "./game_constants"
import { randomInt } from "./mulberry"
import {
    UPGRADES,
    copyCount,
    eligibleUpgrades,
    modifiersFor,
    plainWeights,
    promotionTargets,
    rollCards,
    validTargets
} from "./upgrades"
import { POWER_UPS, dropTable } from "./powerups"
import { lifePriceFor, maxLivesFor } from "./difficulty"
import { storageCap, storageUsed } from "./economy"
import rawShop from "../data/shop.json"

// ---------------------------------------------------------------------------------------------
// Validation

function isObject(v: unknown): v is Record<string, unknown> {
    return typeof v === "object" && v !== null && !Array.isArray(v)
}

function fail(field: string, rule: string): never {
    throw new Error(`shop config: ${field} must be ${rule}`)
}

function wholeAtLeast(v: unknown, min: number, field: string): number {
    if (typeof v !== "number" || !Number.isInteger(v) || v < min) {
        fail(field, `a whole number >= ${min}`)
    }
    return v
}

function object(v: unknown, field: string): Record<string, unknown> {
    if (!isObject(v)) fail(field, "an object")
    return v
}

function validateMode(raw: unknown, at: string): ShopModeConfig {
    const mode = object(raw, at)
    return {
        ordersPerFreeRestock: wholeAtLeast(
            mode.ordersPerFreeRestock,
            1,
            `${at}.ordersPerFreeRestock`
        )
    }
}

// Checks a parsed JSON value and returns it typed. Throws naming the bad field.
function validateShop(raw: unknown): ShopConfig {
    const root = object(raw, "the file")
    const modes = {
        survival: validateMode(root.survival, "survival"),
        timed: validateMode(root.timed, "timed")
    }

    const stock = object(root.stock, "stock")
    if (typeof stock.life !== "boolean") fail("stock.life", "true or false")

    const tierPrice = object(root.tierPrice, "tierPrice")
    for (const k of Object.keys(tierPrice)) {
        if (!(TIERS as string[]).includes(k)) fail("tierPrice", `only ${TIERS.join(", ")}`)
    }
    const prices = {} as Record<Tier, number>
    TIERS.forEach((t, i) => {
        prices[t] = wholeAtLeast(tierPrice[t], 1, `tierPrice.${t}`)
        if (i > 0 && prices[t] < prices[TIERS[i - 1]]) {
            fail(`tierPrice.${t}`, `at least tierPrice.${TIERS[i - 1]}`)
        }
    })

    const rise = object(root.priceRise, "priceRise")
    const restock = object(root.restock, "restock")
    const interest = object(root.interest, "interest")
    const sellRefundPct = wholeAtLeast(root.sellRefundPct, 0, "sellRefundPct")
    if (sellRefundPct > 100) fail("sellRefundPct", "a whole number from 0 to 100")

    return {
        modes,
        stock: {
            upgrades: wholeAtLeast(stock.upgrades, 0, "stock.upgrades"),
            powerUps: wholeAtLeast(stock.powerUps, 0, "stock.powerUps"),
            life: stock.life
        },
        tierPrice: prices,
        priceRise: {
            perCopyPct: wholeAtLeast(rise.perCopyPct, 0, "priceRise.perCopyPct"),
            perProgressPct: wholeAtLeast(rise.perProgressPct, 0, "priceRise.perProgressPct"),
            progressOrders: wholeAtLeast(rise.progressOrders, 1, "priceRise.progressOrders")
        },
        restock: {
            price: wholeAtLeast(restock.price, 1, "restock.price"),
            bankCap: wholeAtLeast(restock.bankCap, 1, "restock.bankCap")
        },
        sellRefundPct,
        interest: {
            everyTicks:
                wholeAtLeast(interest.everySeconds, 1, "interest.everySeconds") * TICKS_PER_SECOND,
            maxCoins: wholeAtLeast(interest.maxCoins, 0, "interest.maxCoins")
        }
    }
}

const SHOP: ShopConfig = validateShop(rawShop)

// ---------------------------------------------------------------------------------------------
// Opening

// The mode's shop settings, or null for Puzzle (no shop).
function modeConfig(state: GameState, config: ShopConfig): ShopModeConfig | null {
    return state.mode === "puzzle" ? null : config.modes[state.mode]
}

// True while the shop page is open. The clock is stopped and only shop and storage actions work.
function isShopOpen(state: GameState): boolean {
    return state.shop.open
}

// True when openShop would succeed: the run is on, the mode has a shop, no upgrade offer is
// waiting (the pick comes first) and the shop is closed.
function canOpenShop(state: GameState, config: ShopConfig = SHOP): boolean {
    return (
        state.status === "running" &&
        modeConfig(state, config) !== null &&
        state.upgradeOffer === null &&
        !state.shop.open
    )
}

// The pools the shop draws upgrades from: the mode's own plus "shop".
function shopPools(state: GameState): Pool[] {
    return state.mode === "puzzle" ? ["shop"] : [state.mode, "shop"]
}

// Ids the shop can stock now, sorted.
function shopPool(state: GameState, crops: CropTable): string[] {
    return eligibleUpgrades(state, shopPools(state), crops)
}

// Power-ups the shop can stock: those that can drop in this run, except ones that only give
// coins (selling coins for coins) or a restock (which Restock already sells).
function stockablePowerUps(state: GameState): string[] {
    if (!state.allowPowerUps) return []
    return dropTable(state).filter((id) => {
        const kind = POWER_UPS.powerUps[id].effect.kind
        return kind !== "grantCoins" && kind !== "grantRestock"
    })
}

// A new stock from rng.shop: upgrade cards (two draws each, plain tier weights), then power-ups
// (one weighted draw each, no repeats), then the life slot in Survival.
function rollStock(
    state: GameState,
    crops: CropTable,
    config: ShopConfig = SHOP
): [ShopItem[], RNGState] {
    const [cards, afterCards] = rollCards(
        shopPool(state, crops),
        state.rng.shop,
        config.stock.upgrades,
        plainWeights()
    )
    let rng = afterCards
    const items: ShopItem[] = cards.map((c) => ({ kind: "upgrade", ...c, sold: false }))

    let left = stockablePowerUps(state)
    for (let n = 0; n < config.stock.powerUps && left.length > 0; n++) {
        const total = left.reduce((sum, id) => sum + POWER_UPS.powerUps[id].weight, 0)
        const [roll, after] = randomInt(rng, 0, total - 1)
        rng = after
        let r = roll
        let chosen = left[left.length - 1]
        for (const id of left) {
            const w = POWER_UPS.powerUps[id].weight
            if (r < w) {
                chosen = id
                break
            }
            r -= w
        }
        items.push({ kind: "powerUp", id: chosen, sold: false })
        left = left.filter((id) => id !== chosen)
    }

    if (state.mode === "survival" && config.stock.life) items.push({ kind: "life", sold: false })
    return [items, rng]
}

// Coins the next Interest payment adds: interestPct of held coins, up to interest.maxCoins.
function interestFor(state: GameState, config: ShopConfig = SHOP): number {
    const { interestPct } = modifiersFor(state.upgrades)
    return Math.min(Math.floor((state.coins * interestPct) / 100), config.interest.maxCoins)
}

// Interest's clock, run by step once per tick of play (step doesn't run while the shop is
// open, so the clock stops then). On nextInterestAt it pays interestFor (0 with no Interest
// owned) and the timer moves on by interest.everyTicks.
function withInterest(state: GameState, config: ShopConfig = SHOP): GameState {
    if (state.tick < state.nextInterestAt) return state
    return {
        ...state,
        coins: state.coins + interestFor(state, config),
        nextInterestAt: state.nextInterestAt + config.interest.everyTicks
    }
}

// Opens the shop page. The first time, draws the first stock from rng.shop. null when
// canOpenShop is false.
function openShop(state: GameState, crops: CropTable, config: ShopConfig = SHOP): GameState | null {
    if (!canOpenShop(state, config)) return null
    if (state.shop.stock !== null) return { ...state, shop: { ...state.shop, open: true } }
    const [stock, shopRng] = rollStock(state, crops, config)
    return {
        ...state,
        rng: { ...state.rng, shop: shopRng },
        shop: { ...state.shop, open: true, stock }
    }
}

// ---------------------------------------------------------------------------------------------
// Free restocks

// Filled orders that earn the next free restock: the mode's number less Fast restock, at least 1.
function ordersPerFreeRestock(state: GameState, config: ShopConfig = SHOP): number {
    const mode = modeConfig(state, config)
    if (mode === null) return 1
    const { restockOrdersCut } = modifiersFor(state.upgrades)
    return Math.max(1, mode.ordersPerFreeRestock - restockOrdersCut)
}

// Free restocks each cycle of filled orders adds: 1, plus Free restock.
function restocksPerCycle(state: GameState): number {
    return 1 + modifiersFor(state.upgrades).freeRestockBonus
}

// The most free restocks the bank holds: restock.bankCap, plus Rain check.
function restockBankCap(state: GameState, config: ShopConfig = SHOP): number {
    return config.restock.bankCap + modifiersFor(state.upgrades).restockBankBonus
}

// True while the bank holds as many free restocks as it can.
function isBankFull(state: GameState, config: ShopConfig = SHOP): boolean {
    return state.shop.freeRestocks >= restockBankCap(state, config)
}

// Counts one filled order toward the next free restock. With the bank full, or in Puzzle,
// nothing changes.
function withFilledOrder(state: GameState, config: ShopConfig = SHOP): GameState {
    if (modeConfig(state, config) === null || isBankFull(state, config)) return state
    const shop = state.shop
    const progress = shop.restockProgress + 1
    if (progress < ordersPerFreeRestock(state, config)) {
        return { ...state, shop: { ...shop, restockProgress: progress } }
    }
    const freeRestocks = Math.min(
        restockBankCap(state, config),
        shop.freeRestocks + restocksPerCycle(state)
    )
    return { ...state, shop: { ...shop, restockProgress: 0, freeRestocks } }
}

// Filled orders still needed for the next free restock, or null while the bank is full (and
// in Puzzle).
function ordersToFreeRestock(state: GameState, config: ShopConfig = SHOP): number | null {
    if (modeConfig(state, config) === null || isBankFull(state, config)) return null
    return Math.max(1, ordersPerFreeRestock(state, config) - state.shop.restockProgress)
}

// ---------------------------------------------------------------------------------------------
// Prices

// The % every price rises by with run progress: perProgressPct per progressOrders filled orders.
function progressPct(state: GameState, config: ShopConfig): number {
    const { perProgressPct, progressOrders } = config.priceRise
    return 100 + perProgressPct * Math.floor(state.ordersCompleted / progressOrders)
}

// What stock[slot] costs now, or null for a bad slot. Worked out live, never stored.
function itemPrice(state: GameState, slot: number, config: ShopConfig = SHOP): number | null {
    const item = stockItem(state, slot)
    if (item === null) return null
    const { shopPricePct } = modifiersFor(state.upgrades)
    switch (item.kind) {
        case "upgrade": {
            const copies = copyCount(state.upgrades, item.id)
            const perCopy = 100 + config.priceRise.perCopyPct * copies
            const raw =
                (config.tierPrice[item.tier] *
                    perCopy *
                    progressPct(state, config) *
                    shopPricePct) /
                1000000
            return Math.max(1, Math.round(raw))
        }
        case "powerUp": {
            const base = POWER_UPS.powerUps[item.id].shopPrice
            const raw = (base * progressPct(state, config) * shopPricePct) / 10000
            return Math.max(1, Math.round(raw))
        }
        case "life":
            return lifePriceFor(state)
    }
}

// The next restock's price: 0 while a free restock is banked, else restock.price.
function restockPrice(state: GameState, config: ShopConfig = SHOP): number {
    return state.shop.freeRestocks > 0 ? 0 : config.restock.price
}

// What selling one owned copy pays back.
function sellRefund(copy: OwnedUpgrade, config: ShopConfig = SHOP): number {
    return Math.floor((config.tierPrice[copy.tier] * config.sellRefundPct) / 100)
}

// ---------------------------------------------------------------------------------------------
// What can be done

// The item in `slot` of the stock, or null before the first stock or for a bad slot.
function stockItem(state: GameState, slot: number): ShopItem | null {
    const stock = state.shop.stock
    if (stock === null || !Number.isInteger(slot)) return null
    if (slot < 0 || slot >= stock.length) return null
    return stock[slot]
}

// True when shop actions can be taken right now: the run is on, the shop is open, and no
// upgrade offer is waiting.
function shopUsable(state: GameState): boolean {
    return state.status === "running" && state.shop.open && state.upgradeOffer === null
}

// Where a buy of the upgrade in `slot` may go: [null] for untargeted, plot indexes or crop ids
// for targeted ones, owned-copy indexes for Promotion. [] when it can't be bought.
function buyTargets(state: GameState, slot: number, crops: CropTable): UpgradeTarget[] {
    const item = stockItem(state, slot)
    if (item === null || item.kind !== "upgrade") return []
    if (!shopPool(state, crops).includes(item.id)) return []
    const def = UPGRADES.upgrades[item.id]
    if (def.kind === "instant") return promotionTargets(state.upgrades)
    return validTargets(state.upgrades, item.id, state.plots.length, crops)
}

// True for an unsold upgrade card that can't be bought any more (capped, or out of copies).
function isMaxed(state: GameState, slot: number, crops: CropTable): boolean {
    const item = stockItem(state, slot)
    if (item === null || item.kind !== "upgrade" || item.sold) return false
    return buyTargets(state, slot, crops).length === 0
}

// True when the upgrade in `slot` needs the player to choose where it goes.
function needsTarget(state: GameState, slot: number): boolean {
    const item = stockItem(state, slot)
    if (item === null || item.kind !== "upgrade") return false
    const def = UPGRADES.upgrades[item.id]
    return def.kind === "instant" || def.target !== null
}

// True when buyItem { slot, target } would succeed.
function canBuy(
    state: GameState,
    slot: number,
    target: UpgradeTarget,
    crops: CropTable,
    config: ShopConfig = SHOP
): boolean {
    if (!shopUsable(state)) return false
    const item = stockItem(state, slot)
    if (item === null || item.sold) return false
    const price = itemPrice(state, slot, config)
    if (price === null || state.coins < price) return false
    switch (item.kind) {
        case "upgrade": {
            const targets = buyTargets(state, slot, crops)
            if (!needsTarget(state, slot)) return target === null && targets.includes(null)
            return target !== null && targets.includes(target)
        }
        case "powerUp":
            return (
                target === null &&
                state.allowPowerUps &&
                state.powerUps.length < modifiersFor(state.upgrades).powerUpSlots
            )
        case "life":
            return target === null && state.mode === "survival" && state.lives < maxLivesFor(state)
    }
}

// True when the player could buy the item in `slot` with some target (the Buy button).
function canBuyAny(state: GameState, slot: number, crops: CropTable): boolean {
    if (!needsTarget(state, slot)) return canBuy(state, slot, null, crops)
    return buyTargets(state, slot, crops).some((t) => canBuy(state, slot, t, crops))
}

type SellBlock = "closed" | "fake" | "notSellable" | "required" | "storage"

// Why sellUpgrade { index } would be refused, or null when it would succeed.
function sellBlock(state: GameState, index: number): SellBlock | null {
    if (!shopUsable(state)) return "closed"
    if (!Number.isInteger(index) || index < 0 || index >= state.upgrades.length) return "closed"
    const copy = state.upgrades[index]
    if (copy.fakeOrdersLeft !== undefined) return "fake"
    const def = UPGRADES.upgrades[copy.id]
    if (!def.sellable) return "notSellable"
    const rest = state.upgrades.filter((_, i) => i !== index)
    if (copyCount(rest, copy.id) === 0) {
        const needed = rest.some((u) => UPGRADES.upgrades[u.id].requires.includes(copy.id))
        if (needed) return "required"
    }
    if (storageUsed(state) > storageCap({ ...state, upgrades: rest })) return "storage"
    return null
}

// True for an upgrade card the Fake merchant marked. The screen labels it only with Keen eye.
function isFakeCard(state: GameState, slot: number): boolean {
    const item = stockItem(state, slot)
    return item !== null && item.kind === "upgrade" && item.fakeOrders !== undefined
}

// True when sellUpgrade { index } would succeed.
function canSell(state: GameState, index: number): boolean {
    return sellBlock(state, index) === null
}

// True when restockShop would succeed.
function canRestock(state: GameState, config: ShopConfig = SHOP): boolean {
    return shopUsable(state) && state.coins >= restockPrice(state, config)
}

export {
    validateShop,
    isFakeCard,
    SHOP,
    isShopOpen,
    canOpenShop,
    shopPool,
    rollStock,
    interestFor,
    withInterest,
    openShop,
    ordersPerFreeRestock,
    restocksPerCycle,
    restockBankCap,
    isBankFull,
    withFilledOrder,
    ordersToFreeRestock,
    itemPrice,
    restockPrice,
    sellRefund,
    stockItem,
    buyTargets,
    isMaxed,
    needsTarget,
    canBuy,
    canBuyAny,
    sellBlock,
    canSell,
    canRestock
}
export type { SellBlock }
