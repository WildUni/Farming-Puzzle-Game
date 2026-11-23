# economy.ts

The in-run economy (Day 6): the storage cap, selling crops, fertilizer and paid upgrade rerolls. Coins also buy lives (see [difficulty.md](difficulty.md)) and, from Day 8, shop items.

The numbers live in three places, so tuning never needs a code change:

- `src/data/economy.json`: sell price, fertilizer and reroll numbers, loaded and checked by `economy.ts`.
- `src/data/crops.json`: each crop's `fertilizerCost` (see [plot.md](plot.md)).
- `src/data/modes.json`: each mode's `storageCap` (see [modes.md](modes.md)). The two modes have separate caps so they can be tuned apart, even while they hold the same number.

## `src/data/economy.json`

```json
{
    "sellPricePct": 25,
    "fertilizer": { "unlock": "upgrade", "cutPct": 50 },
    "reroll": { "base": 5, "growth": 1.5 }
}
```

| Field               | Meaning                                                                                                     |
| ------------------- | ----------------------------------------------------------------------------------------------------------- |
| `sellPricePct`      | A crop sells for this % of its `value`. Whole number from 1 to 100                                          |
| `fertilizer.unlock` | `"basic"`: anyone can make and use fertilizer. `"upgrade"`: only with the `fertilizerUnlocked` stat above 0 |
| `fertilizer.cutPct` | Fertilizer removes this % of a crop's remaining growth time, rounded down. Whole number from 1 to 100       |
| `reroll.base`       | Price of the first reroll of an offer. Whole number `>= 1`                                                  |
| `reroll.growth`     | Each later reroll of the same offer costs this many times the one before. Number `>= 1`                     |

The shipped numbers are placeholders until the Day 6 tuning pass.

## Types

```ts
type EconomyConfig = {
    sellPricePct: number
    fertilizer: { unlock: "basic" | "upgrade"; cutPct: number }
    reroll: { base: number; growth: number }
}
```

Changes elsewhere:

- `Crop` gets `fertilizerCost: number`: crops of this kind used up to make one fertilizer. Whole number `>= 1`, checked by `buildCropTable`.
- The `growing` plot gets `fertilized?: true`, set when fertilizer is used and absent before.
- `GameState` gets `fertilizer: number` (held, starts at 0) and `rerollsThisOffer: number` (starts at 0).
- `Modifiers` gets `storageBonus` (Bigger barn, base 0; no upgrade uses it yet) and `fertilizerUnlocked` (base 0, max 1; set by Compost).
- `Action` gets `sellCrop { cropId, amount }`, `makeFertilizer { cropId }`, `useFertilizer { plot }` and `rerollOffer`.

## Exports

### `validateEconomy(raw: unknown): EconomyConfig`

Checks a parsed JSON value and returns it typed. Throws an `Error` naming the bad field when a field breaks the ranges in the table above, or `fertilizer.unlock` is not one of the two values. A bad config is a setup mistake, so this throws.

### `ECONOMY: EconomyConfig`

`src/data/economy.json` passed through `validateEconomy` once, when the module loads. Both live in `economy_config.ts`, with `fertilizerLocked(config?)` (true with `unlock: "upgrade"`), and `economy.ts` re-exports them. The split lets `upgrades.ts` read the config without importing `economy.ts`, which imports `upgrades.ts`. Every function below takes an optional last `config: EconomyConfig = ECONOMY`.

### `storageCap(state): number`

`MODES[state.mode].storageCap + storageBonus`. Puzzle has no cap yet (`Infinity`).

### `storageUsed(state): number` / `storageFree(state): number`

The total of every crop in `inventory`, and `max(0, cap − used)`. Held fertilizer does not count.

### `sellValue(crop: Crop, amount: number, config?): number`

`floor(amount × crop.value × sellPricePct / 100)`. The total is rounded down, not each crop, so selling one Garlic (value 2) at 25% pays 0 but selling two pays 1.

### `fertilizerAllowed(state, config?): boolean`

True with `unlock: "basic"`, or with `"upgrade"` and `fertilizerUnlocked > 0`.

### Compost

The upgrade that unlocks fertilizer (`compost` in `upgrades.json`): both pools, `epic` (not tiered), `maxCopies` 1, not sellable, effect `fertilizerUnlocked` +1. The shipped config locks fertilizer behind it. With `unlock: "basic"` it would do nothing, so `eligibleUpgrades` skips it (`unlocksNothing` in `upgrades.ts`: every effect is `fertilizerUnlocked` and fertilizer isn't locked).

### `fertilizedReadyAt(plot, now, config?): number`

For a growing plot: `readyAt − floor((readyAt − now) × cutPct / 100)`.

### `fertilizerTargets(state): number[]`

Plots fertilizer can go on now: growing and not `fertilized`, ascending. The screen highlights them while the player picks one.

### `rerollPrice(rerolls: number, config?): number`

`round(base × growth ^ rerolls)`, the price of the next reroll when `rerolls` have been bought for this offer. With the defaults: 5, 8, 11, 17, …

## Actions (in `main.ts`)

None of these are allowed once the run has ended. While an upgrade offer is open, only `chooseUpgrade` and `rerollOffer` are allowed.

**`harvest` (changed).** Refused when `storageFree` is 0; the plot stays ready. Otherwise the harvest works out its amount as before (yield, upgrades, Bumper roll, Worms), adds `min(amount, storageFree)` to inventory and loses the rest. The plot empties and the power-up drop rolls either way.

**Helpful neighbor (changed, `harvestAll` in `events.ts`).** Adds up what every ready plot would give. If that is more than `storageFree`, the event does nothing: no plot is harvested or replanted. Otherwise it works as before.

**`sellCrop { cropId, amount }`.** Refused unless `amount` is a whole number `>= 1` and at most what is held. Removes the crops (a crop at 0 is removed from `inventory`) and pays `sellValue`. Allowed in both modes.

**`makeFertilizer { cropId }`.** Refused unless `fertilizerAllowed` and at least `fertilizerCost` of the crop are held. Removes `fertilizerCost` crops and adds 1 fertilizer. There is no limit on fertilizer held.

**`useFertilizer { plot }`.** Refused unless `fertilizerAllowed`, at least 1 fertilizer is held, and the plot is growing and not yet `fertilized`. Sets `readyAt` to `fertilizedReadyAt`, sets `fertilized: true` and uses 1 fertilizer. A plot whose new `readyAt` is the current tick turns ready on the next `step`.

**`rerollOffer`.** Refused unless an offer is open and `coins >= rerollPrice(rerollsThisOffer)`. Pays the price, adds 1 to `rerollsThisOffer` and replaces the offer with a fresh `rollOffer` from `rng.upgrades`, with the usual tier weights. The new cards may repeat the old ones. Allowed any number of times. `step` sets `rerollsThisOffer` to 0 each time it makes an offer.

No action here reads the clock or moves the tick, so replays work as before: a reroll is logged on the offer's tick, before the `chooseUpgrade`.

## Rules

- No Phaser or browser imports. The JSON import is bundled by Vite and loaded by Vitest.
- Pure: nothing here reads the clock, draws random numbers or changes its input. Only `rerollOffer` draws, from `rng.upgrades`, through `rollOffer`.
- The inventory total never passes `storageCap`. Only harvests and Helpful neighbor add crops, and both check it.

## Tests (`economy.test.ts`, with the action tests in `main.test.ts`)

**Config**

- Accepts the shipped `economy.json`; throws for each bad field.
- `buildCropTable` throws for a missing or bad `fertilizerCost`; `validateModes` throws for a missing or bad `storageCap` in either mode.

**Storage**

- Full storage refuses `harvest`, and the plot stays ready; after a `sellCrop` the same harvest works.
- A harvest bigger than the space left adds only what fits, and the plot empties.
- The inventory total never passes the cap across a scripted run.
- Helpful neighbor does nothing when its harvest would overflow, and works when it fits.
- Survival and Timed read their own caps.

**Selling**

- `sellCrop` removes the crops and pays `sellValue`; refused for more than is held, 0, a fraction, or an unknown crop.
- `sellValue` rounds the total down.
- Refused while an upgrade offer is open.

**Fertilizer**

- `makeFertilizer` uses `fertilizerCost` crops, frees that much storage and adds 1 fertilizer; refused with too few crops.
- `useFertilizer` cuts the remaining growth by `cutPct` and uses 1 fertilizer; refused on an empty, ready or already fertilized plot, and with none held.
- With the shipped `unlock: "upgrade"`, both are refused without Compost and work with it.
- Compost is epic, in both pools, offered while fertilizer is locked and not once owned; `unlocksNothing` is true for it only with `unlock: "basic"` (in `upgrades.test.ts`).
- Held fertilizer does not count toward storage.

**Screen text** (in `format.test.ts`)

- `storageText`, `storageFill` and `isStorageFull` for empty, part-full and full storage, and Timed's own cap.
- `sellAmount` keeps the typed amount from 1 to what is held; blank or bad text is 1.
- The barn and reroll button labels; `plotOverlays` marks a fertilized crop.

**Rerolls**

- `rerollOffer` pays `rerollPrice(n)`, raises the count and replaces the offer; prices follow 5, 8, 11, 17 with the defaults.
- Refused with no offer open, or with too few coins.
- The next offer's first reroll costs `base` again.
- A new run starts with 0 coins, 0 fertilizer and `rerollsThisOffer` 0.

**Replay** (in `verification.test.ts`)

- A scripted Survival run with sells, fertilizer and rerolls replays equal (4 seeds), and its log has each of the four actions. These runs mock `economy_config` so fertilizer is a basic action, since a scripted player can't count on being offered Compost.
- In a scripted run, storage fills, empties again, and never passes the cap.

## Open items

- [ ] Overflowing harvests lose the extra crops for now. Revisit: refuse the harvest, or keep the extra in the plot.
- [ ] Sell price is 25% of `value` for now. Should each crop have its own `sellPrice`? Rounding the total down means one Garlic sells for 0.
- [ ] Fertilizer cuts a % of the remaining growth time. Is a percentage the right rule?
- [ ] Fertilizer works once per plot per planting for now. Should it stack?
- [ ] Held fertilizer does not count toward storage for now, and has no limit. Should it count, or have a cap?
- [x] Making fertilizer as a basic action or behind an upgrade (`fertilizer.unlock`): behind Compost (epic).
- [ ] Compost is not sellable for now, so held fertilizer never becomes useless. Revisit when the shop buys upgrades back (Day 8).
- [ ] Life price that scales with elapsed time (as well as, or instead of, per life bought). Likely to be dropped; not planned.
- [ ] Should a reroll avoid repeating the cards it replaces? Should rerolls roll better tiers (see [upgrades.md](upgrades.md))?
- [ ] Timed orders pay no coins, so in Timed coins come only from selling until the shop (Day 8).
- [ ] Bigger barn and Premium produce (Day 7) set `storageBonus` and a sell price bonus.
- [ ] Shop restock price resets each time the shop opens (Day 8, `shop.md`).
