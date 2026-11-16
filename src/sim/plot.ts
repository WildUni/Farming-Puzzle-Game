import { Plot, Crop, CropTable } from "./types"

// Turns the crop list from crops.json into a lookup table keyed by id.
function buildCropTable(crops: Crop[]): CropTable {
    return Object.fromEntries(crops.map((c) => [c.id, c]))
}

// Returns null if the plot is busy or the crop id is unknown,
// so an unknown id never gets into a plot.
function plant(plot: Plot, cropId: string, now: number, crops: CropTable): Plot | null {
    if (plot.state !== 'empty') return null
    if (!Object.prototype.hasOwnProperty.call(crops, cropId)) return null
    return {
        state: 'growing',
        cropId,
        plantedAt: now
    }
}

function harvest(plot: Plot): { plot: Plot; cropId: string } | null {
    if (plot.state !== 'ready') return null
    return {
        plot: {
            state: 'empty'
        },
        cropId: plot.cropId
    }
}

// Growth progress from 0 (empty / just planted) to 1 (ready).
function progress(plot: Plot, now: number, crops: CropTable): number {
    if (plot.state === 'ready') return 1
    if (plot.state !== 'growing') return 0
    const ticksPassed = now - plot.plantedAt
    const ticksRequired = crops[plot.cropId].growTicks
    return Math.min(1, ticksPassed / ticksRequired)
}

function updateGrowth(plot: Plot, now: number, crops: CropTable): Plot {
    if (plot.state !== 'growing') return plot
    return progress(plot, now, crops) >= 1 ? { state: 'ready', cropId: plot.cropId } : plot
}

export {
    buildCropTable,
    plant,
    harvest,
    progress,
    updateGrowth
}
