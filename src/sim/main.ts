import type {
    RNGSeed,
    GameConfig,
    GameState,
    Plot,
    Action,
    Inventory,
    CropTable,
    Order,
    OrderRules,
    Pool,
    OwnedUpgrade,
    RNGState
} from "./types"
import { randomInt, seedRNG, seedStream } from "./mulberry"
import {
    START_PLOTS,
    DEFAULT_ORDER_RULES,
    ORDERS_PER_UPGRADE,
    TICKS_PER_SECOND
} from "./game_constants"
import { plant, harvest, updateGrowth } from "./plot"
import { createOrder, fulfill, isExpired, timeLeft } from "./orders"
import { DIFFICULTY, runLevel, orderRulesFor, lifePrice } from "./difficulty"
import { MODES, rushWaveAt } from "./modes"
import { isPairFill, orderPoints } from "./scoring"
import {
    UPGRADES,
    modifiersFor,
    modifiersAt,
    plantGrowthPct,
    scalePct,
    rollOffer,
    validTargets
} from "./upgrades"
import {
    tickEffects,
    startEffect,
    cutGrowth,
    finishGrowth,
    finishAll,
    clearField,
    harvestBlocked,
    scareCrows,
    harvestBonusAt,
    deliverBonusAt
} from "./effects"
import { EVENTS, announceEvent, gapTicks, startEvent } from "./events"
import { POWER_UPS, rollDrop, canUsePowerUp, durationFor } from "./powerups"
import {
    storageFree,
    sellValueFor,
    fertilizerAllowed,
    fertilizedReadyAt,
    rerollPrice
} from "./economy"

// Salts for the separate streams. The orders stream uses the seed itself (see specs/mulberry.md).
const UPGRADE_STREAM_SALT = 1
const HARVEST_STREAM_SALT = 2
const DROPS_STREAM_SALT = 3
const EVENTS_STREAM_SALT = 4
const LIVES_STREAM_SALT = 5
const SHRINK_STREAM_SALT = 6
const RUSH_STREAM_SALT = 7

function createGame(seed: RNGSeed, config: GameConfig): GameState {
    return {
        mode: config.mode,
        status: "running",
        tick: 0,
        rng: {
            orders: seedRNG(seed),
            upgrades: seedStream(seed, UPGRADE_STREAM_SALT),
            harvest: seedStream(seed, HARVEST_STREAM_SALT),
            drops: seedStream(seed, DROPS_STREAM_SALT),
            events: seedStream(seed, EVENTS_STREAM_SALT),
            lives: seedStream(seed, LIVES_STREAM_SALT),
            shrink: seedStream(seed, SHRINK_STREAM_SALT),
            rush: seedStream(seed, RUSH_STREAM_SALT)
        },
        plots: Array.from({ length: START_PLOTS }, (): Plot => ({ state: "empty" })),
        inventory: {},
        orders: [],
        nextOrderId: 0,
        score: 0,
        ordersCompleted: 0,
        ordersFailed: 0,
        lives: config.mode === "survival" ? MODES.survival.startLives : 0,
        coins: 0,
        livesBought: 0,
        upgrades: [],
        upgradeOffer: null,
        offersMade: 0,
        allowPowerUps: config.allowPowerUps,
        powerUps: [],
        activeEffects: [],
        allowEvents: config.allowEvents,
        event: null,
        nextEventAt: EVENTS.firstEventTicks,
        secondWind: false,
        combo: 0,
        comboEndsAt: 0,
        comboMisses: 0,
        pairOpenUntil: 0,
        bestCombo: 0,
        fertilizer: 0,
        rerollsThisOffer: 0,
        miracleReadyAt: 0
    }
}

// The rules step uses for new orders: the current level in Survival (slowed by Steady pace),
// fixed otherwise, with Timed keeping MODES.timed.openOrders open. Survival and Timed order
// timers are scaled by the orderTimePct upgrade modifier (Patient customers).
function orderRules(state: GameState): OrderRules {
    if (state.mode === "puzzle") return DEFAULT_ORDER_RULES
    const rules =
        state.mode === "timed"
            ? { ...DEFAULT_ORDER_RULES, maxOpenOrders: MODES.timed.openOrders }
            : orderRulesFor(runLevel(state))
    const { orderTimePct } = modifiersFor(state.upgrades)
    return { ...rules, orderTicks: scalePct(rules.orderTicks, orderTimePct) }
}

// Price of the next life, with the lifePricePct upgrade modifier applied.
function lifePriceFor(state: GameState): number {
    return scalePct(lifePrice(state.livesBought), modifiersFor(state.upgrades).lifePricePct)
}

// Most lives a Survival run can hold: MODES.survival.maxLives plus Extra heart's extraLives.
function maxLivesFor(state: GameState): number {
    return MODES.survival.maxLives + modifiersFor(state.upgrades).extraLives
}

// True when a buyLife action would succeed. The buy button uses this.
function canBuyLife(state: GameState): boolean {
    return (
        state.mode === "survival" &&
        state.status === "running" &&
        state.upgradeOffer === null &&
        state.lives < maxLivesFor(state) &&
        state.coins >= lifePriceFor(state)
    )
}

// True if i is a whole number pointing at an existing plot.
function isPlotIndex(state: GameState, i: number): boolean {
    return Number.isInteger(i) && i >= 0 && i < state.plots.length
}

// Copy of plots with one plot swapped out. Untouched plots are shared.
function replacePlot(plots: Plot[], i: number, plot: Plot): Plot[] {
    return plots.map((p, j) => (j === i ? plot : p))
}

// True when `amount` is a whole number >= 1 and the player holds at least that many of a known
// crop.
function holds(state: GameState, crops: CropTable, cropId: string, amount: number): boolean {
    return (
        Object.prototype.hasOwnProperty.call(crops, cropId) &&
        Number.isInteger(amount) &&
        amount >= 1 &&
        (state.inventory[cropId] ?? 0) >= amount
    )
}

// Inventory with `amount` of a crop taken out; a crop at 0 is removed.
function takeCrops(state: GameState, cropId: string, amount: number): Inventory {
    const { [cropId]: held, ...rest } = state.inventory
    const left = held - amount
    return left > 0 ? { ...rest, [cropId]: left } : rest
}

// Ticks Miracle grow takes to recharge after a use: miracleRechargeSeconds, in ticks.
function miracleRechargeTicks(state: GameState): number {
    return modifiersFor(state.upgrades).miracleRechargeSeconds * TICKS_PER_SECOND
}

// True when Miracle grow is owned and charged, and the run is taking moves. It still needs a
// growing plot (miracleTargets) to be used.
function canUseMiracleGrow(state: GameState): boolean {
    return (
        state.status === "running" &&
        state.upgradeOffer === null &&
        modifiersFor(state.upgrades).miracleGrow > 0 &&
        state.tick >= state.miracleReadyAt
    )
}

// Plots Miracle grow can finish now: the growing ones, or none while it can't be used.
function miracleTargets(state: GameState): number[] {
    if (!canUseMiracleGrow(state)) return []
    return state.plots.flatMap((p, i) => (p.state === "growing" ? [i] : []))
}

// Price of the next reroll of the open offer.
function rerollPriceFor(state: GameState): number {
    return rerollPrice(state.rerollsThisOffer)
}

// True when a rerollOffer action would succeed. The reroll button uses this.
function canReroll(state: GameState): boolean {
    return (
        state.status === "running" &&
        state.upgradeOffer !== null &&
        offerPool(state) !== null &&
        state.coins >= rerollPriceFor(state)
    )
}

// Applies one player move. Returns a new state, or null if the move isn't allowed.
// Never changes `state` or `tick`; only harvest (rng.harvest and rng.drops) and rerollOffer
// (rng.upgrades) draw. See specs/main.md.
function applyAction(state: GameState, action: Action, crops: CropTable): GameState | null {
    if (state.status === "ended") return null
    // While an upgrade offer is open the clock is stopped; only the pick and rerolls are allowed.
    if (
        state.upgradeOffer !== null &&
        action.type !== "chooseUpgrade" &&
        action.type !== "rerollOffer"
    ) {
        return null
    }

    switch (action.type) {
        case "plant": {
            if (!isPlotIndex(state, action.plot)) return null
            const growthPct = plantGrowthPct(state, action.plot, action.cropId)
            const planted = plant(
                state.plots[action.plot],
                action.cropId,
                state.tick,
                crops,
                growthPct
            )
            if (planted === null) return null
            return { ...state, plots: replacePlot(state.plots, action.plot, planted) }
        }

        case "harvest": {
            if (!isPlotIndex(state, action.plot)) return null
            // Crows: no harvesting on this plot while they're here.
            if (harvestBlocked(state.activeEffects, action.plot, state.tick)) return null
            // Full storage: refused, and the plot stays ready.
            const free = storageFree(state)
            if (free === 0) return null
            const result = harvest(state.plots[action.plot])
            if (result === null) return null
            const { plot, cropId } = result
            const { yieldBonus, bumperChance, bumperExtra } = modifiersAt(state.upgrades, {
                plot: action.plot,
                cropId
            })
            // Bumper harvest: one roll from rng.harvest, only when there is a chance at all.
            // Bigger bumper raises how many crops a hit adds.
            let bumper = 0
            let rng = state.rng
            if (bumperChance > 0) {
                const [roll, next] = randomInt(state.rng.harvest, 0, 99)
                if (roll < bumperChance) bumper = bumperExtra
                rng = { ...state.rng, harvest: next }
            }
            // Worms add their crops while they work.
            const worms = harvestBonusAt(state.activeEffects, action.plot, state.tick)
            // Only what fits is stored; the rest is lost.
            const amount = Math.min(free, crops[cropId].yield + yieldBonus + bumper + worms)
            // Power-up drop: rolled from rng.drops whether or not a slot is free.
            const [drop, dropsRng] = rollDrop(state)
            rng = { ...rng, drops: dropsRng }
            const keep =
                drop !== null && state.powerUps.length < modifiersFor(state.upgrades).powerUpSlots
            return {
                ...state,
                rng,
                plots: replacePlot(state.plots, action.plot, plot),
                inventory: {
                    ...state.inventory,
                    [cropId]: (state.inventory[cropId] ?? 0) + amount
                },
                powerUps: keep ? [...state.powerUps, drop] : state.powerUps
            }
        }

        case "scareCrows": {
            if (!isPlotIndex(state, action.plot)) return null
            const activeEffects = scareCrows(state.activeEffects, action.plot, state.tick)
            if (activeEffects === null) return null
            return { ...state, activeEffects }
        }

        case "deliver": {
            const order = state.orders.find((o) => o.id === action.orderId)
            if (order === undefined || isExpired(order, state.tick)) return null
            const inventory = fulfill(order, state.inventory)
            if (inventory === null) return null
            return completeOrder({ ...state, inventory }, order, true)
        }

        case "sellCrop": {
            if (!holds(state, crops, action.cropId, action.amount)) return null
            return {
                ...state,
                inventory: takeCrops(state, action.cropId, action.amount),
                coins: state.coins + sellValueFor(state, crops[action.cropId], action.amount)
            }
        }

        case "makeFertilizer": {
            if (!fertilizerAllowed(state)) return null
            if (!Object.prototype.hasOwnProperty.call(crops, action.cropId)) return null
            const cost = crops[action.cropId].fertilizerCost
            if (!holds(state, crops, action.cropId, cost)) return null
            return {
                ...state,
                inventory: takeCrops(state, action.cropId, cost),
                fertilizer: state.fertilizer + 1
            }
        }

        case "useFertilizer": {
            if (!fertilizerAllowed(state) || state.fertilizer < 1) return null
            if (!isPlotIndex(state, action.plot)) return null
            const plot = state.plots[action.plot]
            if (plot.state !== "growing" || plot.fertilized === true) return null
            const fertilized: Plot = {
                ...plot,
                readyAt: fertilizedReadyAt(plot, state.tick),
                fertilized: true
            }
            return {
                ...state,
                plots: replacePlot(state.plots, action.plot, fertilized),
                fertilizer: state.fertilizer - 1
            }
        }

        case "useMiracleGrow": {
            if (!canUseMiracleGrow(state) || !isPlotIndex(state, action.plot)) return null
            const ready = finishGrowth(state.plots[action.plot])
            if (ready === null) return null
            return {
                ...state,
                plots: replacePlot(state.plots, action.plot, ready),
                miracleReadyAt: state.tick + miracleRechargeTicks(state)
            }
        }

        case "rerollOffer": {
            if (!canReroll(state)) return null
            const [offer, upgrades] = rollOffer(state, offerPool(state)!, crops)
            if (offer.length === 0) return null
            return {
                ...state,
                coins: state.coins - rerollPriceFor(state),
                rerollsThisOffer: state.rerollsThisOffer + 1,
                upgradeOffer: offer,
                rng: { ...state.rng, upgrades }
            }
        }

        case "buyLife": {
            if (!canBuyLife(state)) return null
            return {
                ...state,
                coins: state.coins - lifePriceFor(state),
                lives: state.lives + 1,
                livesBought: state.livesBought + 1
            }
        }

        case "chooseUpgrade": {
            const card = state.upgradeOffer?.find((c) => c.id === action.upgradeId)
            if (card === undefined) return null
            const def = UPGRADES.upgrades[card.id]
            const target = action.target ?? null
            if (def.target === null) {
                if (target !== null) return null
            } else {
                const valid = validTargets(state.upgrades, card.id, state.plots.length, crops)
                if (target === null || !valid.includes(target)) return null
            }
            return {
                ...withUpgrade(state, { id: card.id, tier: card.tier, target }),
                upgradeOffer: null
            }
        }

        case "usePowerUp": {
            const target = action.target ?? null
            if (!canUsePowerUp(state, action.slot, target)) return null
            const def = POWER_UPS.powerUps[state.powerUps[action.slot]]
            const used: GameState = {
                ...state,
                powerUps: state.powerUps.filter((_, i) => i !== action.slot)
            }
            const effect = def.effect
            switch (effect.kind) {
                case "finishGrowth": {
                    // canUsePowerUp checked the target is a growing plot.
                    const ready = finishGrowth(state.plots[target as number])!
                    return { ...used, plots: replacePlot(state.plots, target as number, ready) }
                }
                case "cutGrowth":
                    return { ...used, plots: cutGrowth(state.plots, effect.ticks, state.tick) }
                case "grantCoins":
                    return { ...used, coins: state.coins + effect.amount }
                case "finishAll":
                    return { ...used, plots: finishAll(state.plots) }
                case "clearField":
                    return { ...used, plots: clearField(state.plots) }
                case "fillOrder": {
                    // canUsePowerUp checked the target is an open order's id.
                    const order = state.orders.find((o) => o.id === target)!
                    return completeOrder(used, order, true)
                }
                case "fillAllOrders":
                    return state.orders.reduce((s, o) => completeOrder(s, o, false), used)
                case "goodEvent": {
                    // canUsePowerUp checked no event is announced or running.
                    const [event, events] = announceEvent(state, EVENTS, "good")
                    if (event === null) return null
                    return { ...used, event, rng: { ...state.rng, events } }
                }
                case "growthRate":
                case "orderRate":
                case "deliverBonus":
                    return {
                        ...used,
                        activeEffects: startEffect(
                            state.activeEffects,
                            def.id,
                            effect,
                            state.tick,
                            durationFor(def, state.upgrades)!
                        )
                    }
            }
            return null
        }

        default:
            // An unknown action type (from a bad log) is refused, not thrown.
            return null
    }
}

// Fills `order`: removes it, adds 1 to ordersCompleted, adds orderPoints to score when `scored`
// (level, combo and speed bonuses, from the state before the fill), and pays coins (Survival and
// Timed alike, for now): the base pay, Big tips, Generous customer / Gold rush, and Early bird
// when at least half the order's time is left. deliver and the Finish power-ups use it. In Timed a scored fill then
// extends the streak (see withCombo).
function completeOrder(state: GameState, order: Order, scored: boolean): GameState {
    const combo = state.mode === "timed" && scored
    const points = scored ? orderPoints(state, order) : 0
    const m = modifiersFor(state.upgrades)
    const early = timeLeft(order, state.tick) * 2 >= order.timeLimit ? m.earlyBirdCoins : 0
    const pay =
        DIFFICULTY.coinsPerOrder +
        m.coinsPerOrder +
        deliverBonusAt(state.activeEffects, state.tick) +
        early
    const filled: GameState = {
        ...state,
        orders: state.orders.filter((o) => o.id !== order.id),
        score: scored ? state.score + points : state.score,
        ordersCompleted: state.ordersCompleted + 1,
        coins: state.mode === "puzzle" ? state.coins : state.coins + pay
    }
    return combo ? withCombo(filled, state) : filled
}

// One more order in the streak: combo + 1, the window restarts from this tick, best combo kept.
// Double delivery: a fill that pairs with the one before closes the pair; any other fill opens
// one for MODES.timed.pairTicks. `before` is the state before the fill.
function withCombo(state: GameState, before: GameState): GameState {
    const combo = state.combo + 1
    return {
        ...state,
        combo,
        comboEndsAt: state.tick + MODES.timed.combo.windowTicks,
        bestCombo: Math.max(state.bestCombo, combo),
        pairOpenUntil: isPairFill(before) ? 0 : state.tick + MODES.timed.pairTicks
    }
}

// Adds one owned copy, plus any plots and lives it adds: plots.length always equals
// START_PLOTS + extraPlots (clamped), so a copy past the cap adds no plot. In Survival, a rise
// in extraLives (Extra heart) raises the lives cap and fills the new hearts.
function withUpgrade(state: GameState, copy: OwnedUpgrade): GameState {
    const before = modifiersFor(state.upgrades).extraLives
    const upgrades = [...state.upgrades, copy]
    const after = modifiersFor(upgrades)
    const wanted = START_PLOTS + after.extraPlots
    const added = Array.from({ length: Math.max(0, wanted - state.plots.length) }, (): Plot => ({
        state: "empty"
    }))
    const lives =
        state.mode === "survival"
            ? state.lives + Math.max(0, after.extraLives - before)
            : state.lives
    return {
        ...state,
        upgrades,
        lives,
        plots: added.length > 0 ? [...state.plots, ...added] : state.plots
    }
}

// Creates one new order: createOrder from `ordersRng` (two draws), then, with Small order, one
// roll from `shrinkRng` that halves every amount (rounding up) when it hits. Its value stays.
function makeOrder(
    state: GameState,
    id: number,
    now: number,
    ordersRng: RNGState,
    shrinkRng: RNGState,
    crops: CropTable,
    rules: OrderRules
): [Order, RNGState, RNGState] {
    const [order, afterOrders] = createOrder(id, now, ordersRng, crops, rules)
    const chance = modifiersFor(state.upgrades).smallOrderChance
    if (chance <= 0) return [order, afterOrders, shrinkRng]
    const [roll, afterShrink] = randomInt(shrinkRng, 0, 99)
    if (roll >= chance) return [order, afterOrders, afterShrink]
    const required = Object.fromEntries(
        Object.entries(order.required).map(([cropId, n]) => [cropId, Math.ceil(n / 2)])
    )
    return [{ ...order, required, small: true }, afterOrders, afterShrink]
}

// The rules for the next new order: Second wind stretches its time after a lost life.
function nextOrderRules(state: GameState, rules: OrderRules, secondWind: boolean): OrderRules {
    if (!secondWind) return rules
    const pct = modifiersFor(state.upgrades).secondWindPct
    return { ...rules, orderTicks: scalePct(rules.orderTicks, pct) }
}

// Sneak peek: the order step would create next, as things stand now (a level-up or another
// change before it arrives can still change its amount or time). null without Sneak peek, or
// once the run has ended.
function nextOrderPreview(state: GameState, crops: CropTable): Order | null {
    if (state.status === "ended" || modifiersFor(state.upgrades).sneakPeek <= 0) return null
    const rules = nextOrderRules(state, orderRules(state), state.secondWind)
    const [order] = makeOrder(
        state,
        state.nextOrderId,
        state.tick,
        state.rng.orders,
        state.rng.shrink,
        crops,
        rules
    )
    return order
}

// True when the run should end on this tick. Puzzle has no end rule yet.
function isRunOver(state: GameState): boolean {
    switch (state.mode) {
        case "timed":
            return state.tick >= MODES.timed.runTicks
        case "survival":
            return state.lives <= 0
        case "puzzle":
            return false
    }
}

// The pool free picks draw from in this mode, or null when the mode makes no offers.
// Survival and Timed each draw from their own pool; Puzzle makes no offers.
function offerPool(state: GameState): Pool | null {
    return state.mode === "puzzle" ? null : state.mode
}

// True when enough orders are filled for the next upgrade offer.
function isOfferDue(state: GameState): boolean {
    return (
        offerPool(state) !== null &&
        state.ordersCompleted >= (state.offersMade + 1) * ORDERS_PER_UPGRADE
    )
}

// Moves the game forward one tick. Returns a new state, or `state` itself once ended
// or while an upgrade offer is open. See specs/main.md for the order of the steps.
function step(state: GameState, crops: CropTable): GameState {
    if (state.status === "ended" || state.upgradeOffer !== null) return state

    // 1. Tick
    const tick = state.tick + 1

    // 2. Events: the announced one starts on its startsAt tick, and is cleared once it ends
    const ticked: GameState = { ...state, tick }
    let ev = startEvent(ticked, crops, orderRules(ticked))
    if (ev.event !== null && tick >= ev.event.endsAt) {
        ev = { ...ev, event: null, nextEventAt: tick + gapTicks(ev) }
    }

    // 3. Effects move crops' and orders' deadlines before growth and failures are checked
    const moved = tickEffects(ev.activeEffects, ev.plots, ev.orders, tick)

    // 4. Growth
    const plots = moved.plots.map((p) => updateGrowth(p, tick))

    // 5. Failed orders
    const open = moved.orders.filter((o) => !isExpired(o, tick))
    const failed = moved.orders.length - open.length
    const ordersFailed = state.ordersFailed + failed
    // Survival: each failed order costs a life, never going below 0. Second chance rolls once
    // per failed order from rng.lives and saves the life when it hits. A lost life turns on
    // Second wind for the next new order.
    let lives = state.lives
    let livesRng = ev.rng.lives
    let secondWind = ev.secondWind
    if (state.mode === "survival" && failed > 0) {
        const chance = modifiersFor(state.upgrades).secondChance
        let lost = 0
        for (let i = 0; i < failed; i++) {
            if (chance > 0) {
                const [roll, after] = randomInt(livesRng, 0, 99)
                livesRng = after
                if (roll < chance) continue
            }
            lost += 1
        }
        lives = Math.max(0, lives - lost)
        if (lost > 0) secondWind = true
    }
    // Timed: a failed order breaks the combo, and so does a window with no order filled.
    // Combo keeper forgives up to comboMissesForgiven failed orders per streak.
    let comboMisses = ev.comboMisses
    let comboBroken = ev.combo > 0 && tick > ev.comboEndsAt
    if (ev.combo > 0 && failed > 0 && !comboBroken) {
        const forgiven = modifiersFor(state.upgrades).comboMissesForgiven
        if (comboMisses + failed <= forgiven) comboMisses += failed
        else comboBroken = true
    }
    if (comboBroken) comboMisses = 0

    const next: GameState = {
        ...ev,
        tick,
        plots,
        orders: open,
        ordersFailed,
        lives,
        secondWind,
        combo: comboBroken ? 0 : ev.combo,
        comboEndsAt: comboBroken ? 0 : ev.comboEndsAt,
        comboMisses,
        rng: { ...ev.rng, lives: livesRng },
        activeEffects: moved.active
    }

    // 6. End of run
    if (isRunOver(next)) return { ...next, status: "ended" }

    // 7. New orders, using the rules for the current difficulty
    const rules = orderRules(next)
    const orders = [...next.orders]
    let ordersRng = next.rng.orders
    let shrinkRng = next.rng.shrink
    let rushRng = next.rng.rush
    let nextOrderId = next.nextOrderId
    let wind = next.secondWind
    // Timed rush wave: short, well-paid orders from rng.rush, added past maxOpenOrders. They
    // count toward it, so regular orders wait until the board drops back below it.
    if (next.mode === "timed" && rushWaveAt(tick) !== null) {
        const rush = MODES.timed.rush
        const rushRules = { ...rules, orderTicks: scalePct(rules.orderTicks, rush.timePct) }
        for (let i = 0; i < rush.orders; i++) {
            const [order, afterRush, afterShrink] = makeOrder(
                next,
                nextOrderId,
                tick,
                rushRng,
                shrinkRng,
                crops,
                rushRules
            )
            const valuePct = rush.valuePct + modifiersFor(next.upgrades).rushValuePct
            orders.push({ ...order, value: scalePct(order.value, valuePct), rush: true })
            rushRng = afterRush
            shrinkRng = afterShrink
            nextOrderId += 1
        }
    }
    while (orders.length < rules.maxOpenOrders) {
        const [order, afterOrders, afterShrink] = makeOrder(
            next,
            nextOrderId,
            tick,
            ordersRng,
            shrinkRng,
            crops,
            nextOrderRules(next, rules, wind)
        )
        orders.push(order)
        ordersRng = afterOrders
        shrinkRng = afterShrink
        nextOrderId += 1
        wind = false
    }

    const withOrders: GameState = {
        ...next,
        orders,
        nextOrderId,
        secondWind: wind,
        rng: { ...next.rng, orders: ordersRng, shrink: shrinkRng, rush: rushRng }
    }

    // 8. Event announcement, from its own stream after the orders
    const announced = announceDue(withOrders)

    // 9. Upgrade offer, drawn from its own stream after the orders
    const pool = offerPool(announced)
    if (pool === null || !isOfferDue(announced)) return announced
    const [offer, upgradesRng] = rollOffer(announced, pool, crops)
    return {
        ...announced,
        rng: { ...announced.rng, upgrades: upgradesRng },
        upgradeOffer: offer.length > 0 ? offer : null,
        offersMade: announced.offersMade + 1,
        rerollsThisOffer: 0
    }
}

// Announces the next event when one is due; with nothing eligible, tries again a gap later.
function announceDue(state: GameState): GameState {
    if (!state.allowEvents || state.event !== null || state.tick < state.nextEventAt) return state
    const [event, events] = announceEvent(state)
    const rng = { ...state.rng, events }
    if (event === null) return { ...state, rng, nextEventAt: state.tick + gapTicks(state) }
    return { ...state, rng, event }
}

export {
    createGame,
    applyAction,
    step,
    canBuyLife,
    canReroll,
    rerollPriceFor,
    canUseMiracleGrow,
    miracleTargets,
    miracleRechargeTicks,
    orderRules,
    lifePriceFor,
    maxLivesFor,
    withUpgrade,
    nextOrderPreview
}
