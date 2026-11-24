import { describe, it, expect } from "vitest"
import { createOrder, canFulfill, fulfill, isExpired, timeLeft } from "./orders"
import { buildCropTable } from "./plot"
import { seedRNG, nextValue } from "./mulberry"
import {
    ORDER_TICKS,
    ORDER_MIN_AMOUNT,
    ORDER_MAX_AMOUNT,
    DEFAULT_ORDER_RULES
} from "./game_constants"
import type { Crop, Order, OrderRules } from "./types"

const cropList: Crop[] = [
    { id: "garlic", growTicks: 80, yield: 2, value: 2, fertilizerCost: 4 },
    { id: "carrot", growTicks: 150, yield: 2, value: 8, fertilizerCost: 2 },
    { id: "pumpkin", growTicks: 250, yield: 5, value: 12, fertilizerCost: 1 }
]
const crops = buildCropTable(cropList)

const SEEDS = Array.from({ length: 300 }, (_, i) => i)

describe("createOrder", () => {
    it("uses the given id and expires ORDER_TICKS after now", () => {
        const [order] = createOrder(7, 100, seedRNG(1), crops)
        expect(order.id).toBe(7)
        expect(order.expiresAt).toBe(100 + ORDER_TICKS)
    })

    it("asks for exactly one crop that exists in the table", () => {
        for (const seed of SEEDS) {
            const [order] = createOrder(0, 0, seedRNG(seed), crops)
            const ids = Object.keys(order.required)
            expect(ids).toHaveLength(1)
            expect(crops).toHaveProperty(ids[0])
        }
    })

    it("keeps the amount in range and prices it as amount x crop value", () => {
        for (const seed of SEEDS) {
            const [order] = createOrder(0, 0, seedRNG(seed), crops)
            const [cropId, amount] = Object.entries(order.required)[0]
            expect(Number.isInteger(amount)).toBe(true)
            expect(amount).toBeGreaterThanOrEqual(ORDER_MIN_AMOUNT)
            expect(amount).toBeLessThanOrEqual(ORDER_MAX_AMOUNT)
            expect(order.value).toBe(amount * crops[cropId].value)
        }
    })

    it("produces every crop and every amount across many seeds", () => {
        const seenCrops = new Set<string>()
        const seenAmounts = new Set<number>()
        for (const seed of SEEDS) {
            const [order] = createOrder(0, 0, seedRNG(seed), crops)
            const [cropId, amount] = Object.entries(order.required)[0]
            seenCrops.add(cropId)
            seenAmounts.add(amount)
        }
        expect([...seenCrops].sort()).toEqual(Object.keys(crops).sort())
        for (let a = ORDER_MIN_AMOUNT; a <= ORDER_MAX_AMOUNT; a++) {
            expect(seenAmounts.has(a)).toBe(true)
        }
    })

    it("is deterministic", () => {
        expect(createOrder(3, 50, seedRNG(42), crops)).toEqual(
            createOrder(3, 50, seedRNG(42), crops)
        )
    })

    it("advances the RNG state exactly twice", () => {
        const start = seedRNG(42)
        const [, afterOne] = nextValue(start)
        const [, afterTwo] = nextValue(afterOne)
        const [, returned] = createOrder(0, 0, start, crops)
        expect(returned).toBe(afterTwo)
    })

    it("does not depend on the order of the crop list", () => {
        const reversed = buildCropTable([...cropList].reverse())
        for (const seed of SEEDS) {
            expect(createOrder(0, 0, seedRNG(seed), reversed)).toEqual(
                createOrder(0, 0, seedRNG(seed), crops)
            )
        }
    })

    it("throws for an empty crop table", () => {
        expect(() => createOrder(0, 0, seedRNG(1), {})).toThrow()
    })

    it("records its time limit", () => {
        const [order] = createOrder(0, 100, seedRNG(1), crops)
        expect(order.timeLimit).toBe(ORDER_TICKS)
    })
})

describe("createOrder with rules", () => {
    const rules: OrderRules = { maxOpenOrders: 3, orderTicks: 250, minAmount: 7, maxAmount: 9 }

    it("uses the rules' time limit", () => {
        const [order] = createOrder(0, 100, seedRNG(1), crops, rules)
        expect(order.expiresAt).toBe(350)
        expect(order.timeLimit).toBe(250)
    })

    it("keeps the amount in the rules' range and reaches every value", () => {
        const seen = new Set<number>()
        for (const seed of SEEDS) {
            const [order] = createOrder(0, 0, seedRNG(seed), crops, rules)
            const [cropId, amount] = Object.entries(order.required)[0]
            expect(amount).toBeGreaterThanOrEqual(7)
            expect(amount).toBeLessThanOrEqual(9)
            expect(order.value).toBe(amount * crops[cropId].value)
            seen.add(amount)
        }
        expect([...seen].sort()).toEqual([7, 8, 9])
    })

    it("still uses exactly two draws", () => {
        const start = seedRNG(42)
        const [, afterOne] = nextValue(start)
        const [, afterTwo] = nextValue(afterOne)
        expect(createOrder(0, 0, start, crops, rules)[1]).toBe(afterTwo)
    })

    it("defaults to DEFAULT_ORDER_RULES", () => {
        for (const seed of SEEDS.slice(0, 20)) {
            expect(createOrder(1, 5, seedRNG(seed), crops)).toEqual(
                createOrder(1, 5, seedRNG(seed), crops, DEFAULT_ORDER_RULES)
            )
        }
    })
})

const garlicOrder: Order = {
    id: 0,
    required: { garlic: 3 },
    value: 6,
    expiresAt: 600,
    timeLimit: 600,
    small: false,
    rush: false,
    tip: 0
}
const mixedOrder: Order = {
    id: 1,
    required: { garlic: 2, carrot: 1 },
    value: 12,
    expiresAt: 600,
    timeLimit: 600,
    small: false,
    rush: false,
    tip: 0
}

describe("canFulfill", () => {
    it("is true with exactly enough or more", () => {
        expect(canFulfill(garlicOrder, { garlic: 3 })).toBe(true)
        expect(canFulfill(garlicOrder, { garlic: 10, carrot: 1 })).toBe(true)
    })

    it("is false when short or when the crop is missing", () => {
        expect(canFulfill(garlicOrder, { garlic: 2 })).toBe(false)
        expect(canFulfill(garlicOrder, { carrot: 5 })).toBe(false)
        expect(canFulfill(garlicOrder, {})).toBe(false)
    })

    it("checks every crop in the order", () => {
        expect(canFulfill(mixedOrder, { garlic: 2, carrot: 1 })).toBe(true)
        expect(canFulfill(mixedOrder, { garlic: 2 })).toBe(false)
        expect(canFulfill(mixedOrder, { carrot: 1 })).toBe(false)
    })
})

describe("fulfill", () => {
    it("subtracts the required amounts and keeps other crops", () => {
        expect(fulfill(garlicOrder, { garlic: 5, pumpkin: 2 })).toEqual({ garlic: 2, pumpkin: 2 })
    })

    it("removes crops that drop to zero", () => {
        expect(fulfill(garlicOrder, { garlic: 3, carrot: 1 })).toEqual({ carrot: 1 })
        expect(fulfill(mixedOrder, { garlic: 2, carrot: 1 })).toEqual({})
    })

    it("returns null when short", () => {
        expect(fulfill(garlicOrder, { garlic: 2 })).toBeNull()
        expect(fulfill(mixedOrder, { garlic: 5 })).toBeNull()
    })

    it("never changes the inventory passed in", () => {
        const inventory = { garlic: 5, carrot: 1 }
        fulfill(garlicOrder, inventory)
        fulfill(garlicOrder, { garlic: 1 })
        expect(inventory).toEqual({ garlic: 5, carrot: 1 })
    })
})

describe("isExpired and timeLeft", () => {
    it("is open through expiresAt and expired from the tick after", () => {
        expect(isExpired(garlicOrder, 599)).toBe(false)
        expect(isExpired(garlicOrder, 600)).toBe(false)
        expect(isExpired(garlicOrder, 601)).toBe(true)
        expect(isExpired(garlicOrder, 700)).toBe(true)
    })

    it("counts down to zero and stays there", () => {
        expect(timeLeft(garlicOrder, 0)).toBe(600)
        expect(timeLeft(garlicOrder, 599)).toBe(1)
        expect(timeLeft(garlicOrder, 600)).toBe(0)
        expect(timeLeft(garlicOrder, 700)).toBe(0)
    })
})
