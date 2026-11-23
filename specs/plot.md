# plot.ts

Rules for a single plot, plus building the crop table. Each function works on one `Plot` and returns a new plot instead of changing the one it was given.

## Plot lifecycle

```
empty --plant--> growing --updateGrowth (now reaches readyAt)--> ready --harvest--> empty
```

## Exports

### `buildCropTable(crops: Crop[]): CropTable`

Turns the list in `src/data/crops.json` into a table keyed by crop id. Run it once when the game loads.

### `plant(plot, cropId, now, crops, growthPct = 100): Plot | null`

- Returns `{ state: 'growing', cropId, plantedAt: now, readyAt: now + scalePct(growTicks, growthPct) }` (see [upgrades.md](upgrades.md)). At the default 100% that is `now + growTicks`.
- The ready tick is fixed when the crop is planted. Growth-speed upgrades only affect crops planted after them. Power-ups and events move a growing crop's `readyAt` and `plantedAt` through `effects.ts` instead (see [effects.md](effects.md)).
- Returns `null` if the plot is not empty.
- Returns `null` if `cropId` is not in the crop table. Only the table's own keys count, so ids like `"toString"` are rejected. This keeps unknown ids out of plots, so later lookups can trust them.

### `harvest(plot): { plot: Plot, cropId: string } | null`

- Returns an empty plot and the id of the crop harvested.
- Returns `null` if the plot is not ready.
- Does not touch the inventory. The caller looks up the crop's `yield` and adds it.

### `progress(plot, now): number`

Growth progress from 0 to 1, for progress bars and for `updateGrowth`.

| Plot state | Result                                                                                |
| ---------- | ------------------------------------------------------------------------------------- |
| `empty`    | `0`                                                                                   |
| `growing`  | `(now - plantedAt) / (readyAt - plantedAt)`, capped at `1`; `1` once `now >= readyAt` |
| `ready`    | `1`                                                                                   |

The `now >= readyAt` check comes first, so a plot whose `readyAt` was pulled back to `plantedAt` never divides by zero.

### `updateGrowth(plot, now): Plot`

- Turns a growing plot into `{ state: 'ready', cropId }` once `now >= readyAt`.
- Returns the **same object** for any plot that doesn't change. The renderer can use `oldPlot !== newPlot` to tell which plots to redraw.

## Tested

- Planting works on an empty plot, sets `readyAt` to `now + growTicks`, and is rejected on busy plots and for unknown crop ids.
- With `growthPct` 50, `readyAt` is `now + round(growTicks / 2)`.
- Harvesting empties a ready plot and is rejected otherwise.
- `progress` is 0, 0.5 and 1 at the start, halfway and past the end, and 1 for ready plots.
- Garlic (80 ticks) turns ready at tick 80 and not at 79.
- Empty and ready plots come back unchanged.
- A plot uses its stored `readyAt`, not the crop's current `growTicks` (a plot with a shorter `readyAt` turns ready early).
- A plot with `readyAt === plantedAt` has progress 1 and turns ready on the next update.

## Open items

- [x] Store the ready tick on the plot (`readyAt`) so growth-speed upgrades and instant-grow power-ups don't change crops retroactively.
- [ ] Plot modifiers (weeds, blocked plots).
- [x] Fertilizer (Day 6): `Crop.fertilizerCost`, checked by `buildCropTable` (throws for a value that isn't a whole number `>= 1`), and a `fertilized` flag on growing plots (see [economy.md](economy.md)).
- [x] Effects that change speed _while_ a crop grows move `readyAt` and `plantedAt` together, a little each tick (see [effects.md](effects.md)), so `progress` keeps working without a stored progress field.
