import { describe, it, expect } from "vitest";
import { buildCropTable, plant, harvest, progress, updateGrowth } from "./plot";
import type { Plot } from "./types";

const crops = buildCropTable([
    { id: "garlic", growTicks: 80, yield: 2, value: 2 },
    { id: "pumpkin", growTicks: 250, yield: 5, value: 12 },
]);

const empty: Plot = { state: "empty" };
const growingGarlic: Plot = { state: "growing", cropId: "garlic", plantedAt: 0 };
const readyGarlic: Plot = { state: "ready", cropId: "garlic" };

describe("buildCropTable", () => {
    it("keys crops by id", () => {
        expect(crops.garlic.growTicks).toBe(80);
        expect(crops.pumpkin.yield).toBe(5);
    });
});

describe("plant", () => {
    it("plants on an empty plot", () => {
        expect(plant(empty, "garlic", 10, crops)).toEqual({
            state: "growing",
            cropId: "garlic",
            plantedAt: 10,
        });
    });

    it("rejects a busy plot", () => {
        expect(plant(growingGarlic, "pumpkin", 10, crops)).toBeNull();
        expect(plant(readyGarlic, "pumpkin", 10, crops)).toBeNull();
    });

    it("rejects an unknown crop id", () => {
        expect(plant(empty, "tomato", 10, crops)).toBeNull();
        expect(plant(empty, "toString", 10, crops)).toBeNull();
    });
});

describe("harvest", () => {
    it("empties a ready plot and returns the crop", () => {
        expect(harvest(readyGarlic)).toEqual({ plot: { state: "empty" }, cropId: "garlic" });
    });

    it("rejects a plot that isn't ready", () => {
        expect(harvest(empty)).toBeNull();
        expect(harvest(growingGarlic)).toBeNull();
    });
});

describe("progress", () => {
    it("is 0 for an empty plot and 1 for a ready plot", () => {
        expect(progress(empty, 100, crops)).toBe(0);
        expect(progress(readyGarlic, 100, crops)).toBe(1);
    });

    it("grows linearly and stays at 1 once done", () => {
        expect(progress(growingGarlic, 0, crops)).toBe(0);
        expect(progress(growingGarlic, 40, crops)).toBe(0.5);
        expect(progress(growingGarlic, 200, crops)).toBe(1);
    });
});

describe("updateGrowth", () => {
    it("turns ready at exactly growTicks, not before", () => {
        expect(updateGrowth(growingGarlic, 79, crops)).toBe(growingGarlic);
        expect(updateGrowth(growingGarlic, 80, crops)).toEqual(readyGarlic);
    });

    it("leaves empty and ready plots unchanged", () => {
        expect(updateGrowth(empty, 80, crops)).toBe(empty);
        expect(updateGrowth(readyGarlic, 80, crops)).toBe(readyGarlic);
    });
});
