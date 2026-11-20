import type { Plot, Crop, CropTable } from "./types"
import { scalePct } from "./upgrades"

// Turns the crop list from crops.json into a lookup table keyed by id.
function buildCropTable(crops: Crop[]): CropTable {
    return Object.fromEntries(crops.map((c) => [c.id, c]))
}

// Returns null if the plot is busy or the crop id is unknown,
// so an unknown id never gets into a plot. The ready tick is fixed here, with the
// run's growthPct modifier applied (100 = normal speed).
function plant(
    plot: Plot,
    cropId: string,
    now: number,
    crops: CropTable,
    growthPct: number = 100
): Plot | null {
    if (plot.state !== "empty") return null
    if (!Object.prototype.hasOwnProperty.call(crops, cropId)) return null
    return {
        state: "growing",
        cropId,
        plantedAt: now,
        readyAt: now + scalePct(crops[cropId].growTicks, growthPct)
    }
}

function harvest(plot: Plot): { plot: Plot; cropId: string } | null {
    if (plot.state !== "ready") return null
    return {
        plot: {
            state: "empty"
        },
        cropId: plot.cropId
    }
}

// Growth progress from 0 (empty / just planted) to 1 (ready).
// Checks readyAt first, so readyAt === plantedAt never divides by zero.
function progress(plot: Plot, now: number): number {
    if (plot.state === "ready") return 1
    if (plot.state !== "growing") return 0
    if (now >= plot.readyAt) return 1
    return (now - plot.plantedAt) / (plot.readyAt - plot.plantedAt)
}

// Returns the same object for any plot that doesn't change.
function updateGrowth(plot: Plot, now: number): Plot {
    if (plot.state !== "growing") return plot
    return now >= plot.readyAt ? { state: "ready", cropId: plot.cropId } : plot
}

export { buildCropTable, plant, harvest, progress, updateGrowth }
