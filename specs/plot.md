# plot.ts

Rules for a single plot, plus building the crop table. Each function works on one `Plot` and returns a new plot instead of changing the one it was given.

## Plot lifecycle

```
empty --plant--> growing --updateGrowth (progress reaches 1)--> ready --harvest--> empty
```

## Exports

### `buildCropTable(crops: Crop[]): CropTable`

Turns the list in `src/data/crops.json` into a table keyed by crop id. Run it once when the game loads.

### `plant(plot, cropId, now, crops): Plot | null`

- Returns `{ state: 'growing', cropId, plantedAt: now }`.
- Returns `null` if the plot is not empty.
- Returns `null` if `cropId` is not in the crop table. Only the table's own keys count, so ids like `"toString"` are rejected. This keeps unknown ids out of plots, so later lookups can trust them.

### `harvest(plot): { plot: Plot, cropId: string } | null`

- Returns an empty plot and the id of the crop harvested.
- Returns `null` if the plot is not ready.
- Does not touch the inventory. The caller looks up the crop's `yield` and adds it.

### `progress(plot, now, crops): number`

Growth progress from 0 to 1, for progress bars and for `updateGrowth`.

| Plot state | Result                                         |
| ---------- | ---------------------------------------------- |
| `empty`    | `0`                                            |
| `growing`  | `(now - plantedAt) / growTicks`, capped at `1` |
| `ready`    | `1`                                            |

### `updateGrowth(plot, now, crops): Plot`

- Turns a growing plot into `{ state: 'ready', cropId }` once its progress reaches 1, which happens exactly at `plantedAt + growTicks`.
- Returns the **same object** for any plot that doesn't change. The renderer can use `oldPlot !== newPlot` to tell which plots to redraw.

## Tested

- Planting works on an empty plot and is rejected on busy plots and for unknown crop ids.
- Harvesting empties a ready plot and is rejected otherwise.
- `progress` is 0, 0.5 and 1 at the start, halfway and past the end, and 1 for ready plots.
- Garlic (80 ticks) turns ready at tick 80 and not at 79.
- Empty and ready plots come back unchanged.

## Open items

- [ ] Plot modifiers (fertilizer, weeds, blocked plots). Once growth speed can change, `plantedAt` should be replaced by a `progress` field that `step` increases each tick.
