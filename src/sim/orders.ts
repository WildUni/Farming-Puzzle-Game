import type { Order, CropTable, RNGState } from "./types"
import { nextInt } from "./mulberry"
import { ORDER_TICKS, ORDER_MIN_AMOUNT, ORDER_MAX_AMOUNT } from "./game_constants"

type Inventory = Record<string, number>  // cropId -> amount held

// Whole number from min to max inclusive, plus the next RNG state.
// TODO: move to mulberry.ts as nextInt(state, min, max) once nextInt is renamed.
function randomInt(rng: RNGState, min: number, max: number): [number, RNGState] {
    const [v, next] = nextInt(rng)
    return [min + Math.floor(v * (max - min + 1)), next]
}

// Creates a random single-crop order. Uses exactly two random draws:
// the first picks the crop, the second picks the amount.
function createOrder(id: number, now: number, rng: RNGState, crops: CropTable): [Order, RNGState] {
    const ids = Object.keys(crops).sort()
    if (ids.length === 0) throw new Error("createOrder: crop table is empty")

    const [index, afterCrop] = randomInt(rng, 0, ids.length - 1)
    const cropId = ids[index]
    const [amount, afterAmount] = randomInt(afterCrop, ORDER_MIN_AMOUNT, ORDER_MAX_AMOUNT)

    const order: Order = {
        id,
        required: { [cropId]: amount },
        value: amount * crops[cropId].value,
        expiresAt: now + ORDER_TICKS
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

function isExpired(order: Order, now: number): boolean {
    return now >= order.expiresAt
}

function timeLeft(order: Order, now: number): number {
    return Math.max(0, order.expiresAt - now)
}

export {
    createOrder,
    canFulfill,
    fulfill,
    isExpired,
    timeLeft
}
