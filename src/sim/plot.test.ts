import { describe, it, expect } from "vitest"
import { buildCropTable, plant, harvest, progress, updateGrowth } from "./plot"
import type { Plot } from "./types"

const crops = buildCropTable([
    { id: "garlic", growTicks: 80, yield: 2, value: 2, fertilizerCost: 4 },
    { id: "pumpkin", growTicks: 250, yield: 5, value: 12, fertilizerCost: 1 }
])

const empty: Plot = { state: "empty" }
const growingGarlic: Plot = { state: "growing", cropId: "garlic", plantedAt: 0, readyAt: 80 }
const readyGarlic: Plot = { state: "ready", cropId: "garlic" }

describe("buildCropTable", () => {
    it("keys crops by id", () => {
        expect(crops.garlic.growTicks).toBe(80)
        expect(crops.pumpkin.yield).toBe(5)
    })

    it.each([0, 1.5, undefined])("throws for a fertilizerCost of %s", (cost) => {
        const bad = { id: "garlic", growTicks: 80, yield: 2, value: 2, fertilizerCost: cost }
        expect(() => buildCropTable([bad as never])).toThrow(/fertilizerCost/)
    })
})

describe("plant", () => {
    it("plants on an empty plot and fixes the ready tick", () => {
        expect(plant(empty, "garlic", 10, crops)).toEqual({
            state: "growing",
            cropId: "garlic",
            plantedAt: 10,
            readyAt: 90
        })
    })

    it("applies growthPct to the ready tick", () => {
        expect(plant(empty, "garlic", 10, crops, 50)).toMatchObject({ readyAt: 10 + 40 })
        expect(plant(empty, "garlic", 10, crops, 85)).toMatchObject({ readyAt: 10 + 68 })
    })

    it("rejects a busy plot", () => {
        expect(plant(growingGarlic, "pumpkin", 10, crops)).toBeNull()
        expect(plant(readyGarlic, "pumpkin", 10, crops)).toBeNull()
    })

    it("rejects an unknown crop id", () => {
        expect(plant(empty, "tomato", 10, crops)).toBeNull()
        expect(plant(empty, "toString", 10, crops)).toBeNull()
    })
})

describe("harvest", () => {
    it("empties a ready plot and returns the crop", () => {
        expect(harvest(readyGarlic)).toEqual({ plot: { state: "empty" }, cropId: "garlic" })
    })

    it("rejects a plot that isn't ready", () => {
        expect(harvest(empty)).toBeNull()
        expect(harvest(growingGarlic)).toBeNull()
    })
})

describe("progress", () => {
    it("is 0 for an empty plot and 1 for a ready plot", () => {
        expect(progress(empty, 100)).toBe(0)
        expect(progress(readyGarlic, 100)).toBe(1)
    })

    it("grows linearly and stays at 1 once done", () => {
        expect(progress(growingGarlic, 0)).toBe(0)
        expect(progress(growingGarlic, 40)).toBe(0.5)
        expect(progress(growingGarlic, 200)).toBe(1)
    })

    it("is 1 when readyAt equals plantedAt", () => {
        const instant: Plot = { state: "growing", cropId: "garlic", plantedAt: 30, readyAt: 30 }
        expect(progress(instant, 30)).toBe(1)
    })
})

describe("updateGrowth", () => {
    it("turns ready at exactly growTicks, not before", () => {
        expect(updateGrowth(growingGarlic, 79)).toBe(growingGarlic)
        expect(updateGrowth(growingGarlic, 80)).toEqual(readyGarlic)
    })

    it("uses the stored readyAt, not the crop's growTicks", () => {
        const early: Plot = { state: "growing", cropId: "garlic", plantedAt: 0, readyAt: 50 }
        expect(updateGrowth(early, 49)).toBe(early)
        expect(updateGrowth(early, 50)).toEqual(readyGarlic)
    })

    it("turns a plot with readyAt === plantedAt ready on the next update", () => {
        const instant: Plot = { state: "growing", cropId: "garlic", plantedAt: 30, readyAt: 30 }
        expect(updateGrowth(instant, 31)).toEqual(readyGarlic)
    })

    it("leaves empty and ready plots unchanged", () => {
        expect(updateGrowth(empty, 80)).toBe(empty)
        expect(updateGrowth(readyGarlic, 80)).toBe(readyGarlic)
    })
})
