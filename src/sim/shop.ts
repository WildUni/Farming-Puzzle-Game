// The shop: when it opens, its stock, prices, refunds and what can be bought or sold. The
// actions themselves live in main.ts. See specs/shop.md.
import type {
    CropTable,
    GameState,
    OwnedUpgrade,
    Pool,
    RNGState,
    ShopConfig,
    ShopItem,
    ShopModeConfig,
    ShopOpenRule,
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

function has(obj: Record<string, unknown>, key: string): boolean {
    return Object.prototype.hasOwnProperty.call(obj, key)
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

function validateOpen(raw: unknown, at: string): ShopOpenRule {
    const open = object(raw, at)
    switch (open.kind) {
        case "orders":
            return {
                kind: "orders",
                every: wholeAtLeast(open.every, 1, `${at}.every`),
                offset: wholeAtLeast(open.offset, 0, `${at}.offset`)
            }
        case "seconds": {
            const at_ = open.at
            if (!Array.isArray(at_)) fail(`${at}.at`, "a list of whole numbers >= 1")
            const seconds = at_.map((v: unknown, i) => wholeAtLeast(v, 1, `${at}.at[${i}]`))
            for (let i = 1; i < seconds.length; i++) {
                if (seconds[i] <= seconds[i - 1]) fail(`${at}.at`, "strictly rising")
            }
            return { kind: "seconds", at: seconds }
        }
        case "never":
            return { kind: "never" }
        default:
            return fail(`${at}.kind`, `"orders", "seconds" or "never"`)
    }
}

function validateMode(raw: unknown, at: string): ShopModeConfig {
    const mode = object(raw, at)
    const open = validateOpen(mode.open, `${at}.open`)
    if (typeof mode.pauses !== "boolean") fail(`${at}.pauses`, "true or false")
    let openTicks: number | null = null
    if (mode.pauses) {
        if (has(mode, "openSeconds")) fail(`${at}.openSeconds`, "left out when pauses is true")
    } else {
        if (!has(mode, "openSeconds")) fail(`${at}.openSeconds`, "given when pauses is false")
        openTicks = wholeAtLeast(mode.openSeconds, 1, `${at}.openSeconds`) * TICKS_PER_SECOND
    }
    return { open, pauses: mode.pauses, openTicks }
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
    const growth = restock.growth
    if (typeof growth !== "number" || !Number.isFinite(growth) || growth < 1) {
        fail("restock.growth", "a number >= 1")
    }
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
            perVisitPct: wholeAtLeast(rise.perVisitPct, 0, "priceRise.perVisitPct")
        },
        restock: { base: wholeAtLeast(restock.base, 1, "restock.base"), growth },
        sellRefundPct,
        interestMaxCoins: wholeAtLeast(root.interestMaxCoins, 0, "interestMaxCoins")
    }
}

const SHOP: ShopConfig = validateShop(rawShop)

// ---------------------------------------------------------------------------------------------
// Opening

// The mode's shop settings, or null for Puzzle (no shop).
function modeConfig(state: GameState, config: ShopConfig): ShopModeConfig | null {
    return state.mode === "puzzle" ? null : config.modes[state.mode]
}

// True while a shop that stops the clock is open.
function isShopPaused(state: GameState): boolean {
    return state.shop !== null && state.shop.closesAt === null
}

// True when the mode's open rule says the next visit is due.
function isShopDue(state: GameState, config: ShopConfig = SHOP): boolean {
    const mode = modeConfig(state, config)
    if (mode === null) return false
    const open = mode.open
    switch (open.kind) {
        case "orders":
            return state.ordersCompleted >= open.offset + state.shopVisits * open.every
        case "seconds":
            return (
                state.shopVisits < open.at.length &&
                state.tick >= open.at[state.shopVisits] * TICKS_PER_SECOND
            )
        case "never":
            return false
    }
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
// coins (selling coins for coins).
function stockablePowerUps(state: GameState): string[] {
    if (!state.allowPowerUps) return []
    return dropTable(state).filter((id) => POWER_UPS.powerUps[id].effect.kind !== "grantCoins")
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

// Coins Interest adds when a visit starts.
function interestFor(state: GameState, config: ShopConfig = SHOP): number {
    const { interestPct } = modifiersFor(state.upgrades)
    return Math.min(Math.floor((state.coins * interestPct) / 100), config.interestMaxCoins)
}

// Starts a visit: counts it, pays Interest, then draws the stock.
function openShop(state: GameState, crops: CropTable, config: ShopConfig = SHOP): GameState {
    const mode = modeConfig(state, config)
    const counted: GameState = {
        ...state,
        shopVisits: state.shopVisits + 1,
        coins: state.coins + interestFor(state, config)
    }
    const [stock, shopRng] = rollStock(counted, crops, config)
    const closesAt = mode === null || mode.pauses ? null : state.tick + mode.openTicks!
    return {
        ...counted,
        rng: { ...counted.rng, shop: shopRng },
        shop: { stock, restocks: 0, closesAt }
    }
}

// ---------------------------------------------------------------------------------------------
// Prices

// The % every price rises by for the visits before this one.
function visitRisePct(state: GameState, config: ShopConfig): number {
    return 100 + config.priceRise.perVisitPct * Math.max(0, state.shopVisits - 1)
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
                    visitRisePct(state, config) *
                    shopPricePct) /
                1000000
            return Math.max(1, Math.round(raw))
        }
        case "powerUp": {
            const base = POWER_UPS.powerUps[item.id].shopPrice
            const raw = (base * visitRisePct(state, config) * shopPricePct) / 10000
            return Math.max(1, Math.round(raw))
        }
        case "life":
            return lifePriceFor(state)
    }
}

// The next restock's price this visit: free while Free restock has some left.
function restockPrice(state: GameState, config: ShopConfig = SHOP): number {
    const restocks = state.shop?.restocks ?? 0
    const free = modifiersFor(state.upgrades).freeRestocks
    if (restocks < free) return 0
    const { base, growth } = config.restock
    return Math.round(base * growth ** (restocks - free))
}

// What selling one owned copy pays back.
function sellRefund(copy: OwnedUpgrade, config: ShopConfig = SHOP): number {
    return Math.floor((config.tierPrice[copy.tier] * config.sellRefundPct) / 100)
}

// ---------------------------------------------------------------------------------------------
// What can be done

// The item in `slot` of the open shop, or null for a closed shop or a bad slot.
function stockItem(state: GameState, slot: number): ShopItem | null {
    if (state.shop === null || !Number.isInteger(slot)) return null
    if (slot < 0 || slot >= state.shop.stock.length) return null
    return state.shop.stock[slot]
}

// True when shop actions can be taken right now: the run is on, the shop is open, and no
// upgrade offer is waiting.
function shopUsable(state: GameState): boolean {
    return state.status === "running" && state.shop !== null && state.upgradeOffer === null
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

type SellBlock = "closed" | "notSellable" | "required" | "storage"

// Why sellUpgrade { index } would be refused, or null when it would succeed.
function sellBlock(state: GameState, index: number): SellBlock | null {
    if (!shopUsable(state)) return "closed"
    if (!Number.isInteger(index) || index < 0 || index >= state.upgrades.length) return "closed"
    const copy = state.upgrades[index]
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
    SHOP,
    isShopPaused,
    isShopDue,
    shopPool,
    rollStock,
    interestFor,
    openShop,
    itemPrice,
    restockPrice,
    sellRefund,
    stockItem,
    buyTargets,
    needsTarget,
    canBuy,
    canBuyAny,
    sellBlock,
    canSell,
    canRestock
}
export type { SellBlock }
