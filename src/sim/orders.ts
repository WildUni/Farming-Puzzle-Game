import type { Order, OrderRules, CropTable, RNGState, Inventory, GameState } from "./types"
import { pick, randomInt } from "./mulberry"
import { DEFAULT_ORDER_RULES } from "./game_constants"

// Creates a random single-crop order. Uses exactly two random draws:
// the first picks the crop, the second picks the amount.
// `rules` sets the time limit and amount range (maxOpenOrders is step's concern).
function createOrder(
    id: number,
    now: number,
    rng: RNGState,
    crops: CropTable,
    rules: OrderRules = DEFAULT_ORDER_RULES
): [Order, RNGState] {
    const ids = Object.keys(crops).sort()
    if (ids.length === 0) throw new Error("createOrder: crop table is empty")

    const [cropId, afterCrop] = pick(rng, ids)
    const [amount, afterAmount] = randomInt(afterCrop, rules.minAmount, rules.maxAmount)

    const order: Order = {
        id,
        required: { [cropId]: amount },
        value: amount * crops[cropId].value,
        expiresAt: now + rules.orderTicks,
        timeLimit: rules.orderTicks,
        small: false,
        rush: false,
        tip: 0,
        giant: null
    }
    return [order, afterAmount]
}

function canFulfill(order: Order, inventory: Inventory): boolean {
    return Object.entries(order.required).every(
        ([cropId, amount]) => (inventory[cropId] ?? 0) >= amount
    )
}

// Returns a new inventory with the order's crops removed, or null if short.
// Crops that drop to 0 are deleted so "missing" always means 0.
function fulfill(order: Order, inventory: Inventory): Inventory | null {
    if (!canFulfill(order, inventory)) return null
    const result: Inventory = { ...inventory }
    for (const [cropId, amount] of Object.entries(order.required)) {
        const left = result[cropId] - amount
        if (left === 0) delete result[cropId]
        else result[cropId] = left
    }
    return result
}

// expiresAt is the last tick the order can be filled, so it fails on the tick after.
function isExpired(order: Order, now: number): boolean {
    return now > order.expiresAt
}

// Ticks left after the current one. 0 on the last tick the order can still be filled.
function timeLeft(order: Order, now: number): number {
    return Math.max(0, order.expiresAt - now)
}

// True while a Giant order is open.
function giantOpen(state: GameState): boolean {
    return state.orders.some((o) => o.giant !== null)
}

// True when step and Emergency order make no new orders: a Giant order is open, or Timed's
// failed-Giant-order penalty is running.
function ordersBlocked(state: GameState): boolean {
    return giantOpen(state) || (state.mode === "timed" && state.tick < state.giantPenaltyUntil)
}

export { createOrder, canFulfill, fulfill, isExpired, timeLeft, giantOpen, ordersBlocked }
