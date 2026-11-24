# upgrades.ts

Upgrades: what each one does, the tiers they come in, which mode's pool they belong to, adding the owned ones up into `Modifiers`, and rolling offers. Every `ORDERS_PER_UPGRADE` filled orders the run stops and offers the player a choice of `UPGRADE_CHOICES` upgrades, each at a tier. The pick lasts for the rest of the run.

What each upgrade does lives in **`src/data/upgrades.json`**. Which upgrades the player owns lives in **`GameState.upgrades`**. Rules never look at upgrade ids: they read one number from `modifiersFor` or `modifiersAt`, which add up the owned upgrades into a flat `Modifiers` object.

This spec is **phase 1** of the upgrade plan: the data shape, tiers, pools, caps, copy limits, targeted upgrades and a separate random stream. Survival and Timed both make offers, each from its own pool. The shop and selling upgrades come later (see [Later phases](#later-phases)); the data already carries the fields they need.

## Concepts

- **Tier.** One of `common`, `uncommon`, `rare`, `epic`, `legendary`, in that order. A **tiered** upgrade exists at all five tiers, and a higher tier is a stronger version of the same effect. A **non-tiered** upgrade exists at one fixed tier only.
- **Copy.** Every pick adds a new copy, even of an upgrade already owned at another tier. Copies stack by adding.
- **Stat cap.** Each `Modifiers` stat has a `min` and a `max`. The total of all copies is clamped to them, so an upgrade that would pass the cap only adds what is left.
- **Copy limit.** Every upgrade, tiered or not, has `maxCopies`: the most copies one run can own, at any mix of tiers.
- **Pool.** Each upgrade lists the pools it belongs to: `survival`, `timed`, `shop`. A free pick draws from the current mode's pool. (The shop, later, draws from the mode's pool plus `shop`.)
- **Target.** A targeted upgrade applies to one plot or one crop that the player chooses when picking it. `oncePerTarget` upgrades can have several copies, but never two on the same target. `stackable` upgrades can put several copies on the same target.
- **Eligible.** An upgrade can be offered only when it is in the pool, under `maxCopies`, its `requires` are owned, and at least one of its effects can still change a stat (see [Eligibility](#eligibility)). Once nothing can be gained from it, it stops being offered.

## `src/data/upgrades.json`

One object with three parts:

```json
{
    "stats": {
        "growthPct": { "base": 100, "min": 20, "max": 100 }
    },
    "tiers": {
        "common": { "weight": 40 }
    },
    "upgrades": [
        {
            "id": "fastGrowth",
            "name": "Fast growth",
            "text": "Crops grow {0}% faster",
            "pools": ["survival", "timed"],
            "maxCopies": 5,
            "sellable": true,
            "effects": [{ "stat": "growthPct", "perTier": [-2, -4, -7, -12, -20] }]
        },
        {
            "id": "extraPlot",
            "name": "Extra plot",
            "text": "One more plot to plant on",
            "pools": ["shop"],
            "tier": "rare",
            "maxCopies": 2,
            "sellable": false,
            "effects": [{ "stat": "extraPlots", "amount": 1 }]
        }
    ]
}
```

### `stats`

One entry per `Modifiers` field, no more and no fewer.

| Field  | Meaning                                         |
| ------ | ----------------------------------------------- |
| `base` | The value with no upgrades                      |
| `min`  | Lowest the total can go after adding all copies |
| `max`  | Highest the total can go                        |

All three are whole numbers with `min <= base <= max`.

### `tiers`

One entry per tier, no more and no fewer.

| Field    | Meaning                                                               |
| -------- | --------------------------------------------------------------------- |
| `weight` | Relative chance of this tier when rolling a card. Whole number `>= 0` |

At least one weight must be above 0. Shipped weights: common 40, uncommon 30, rare 15, epic 10, legendary 5 (they add up to 100).

### `upgrades`

| Field        | Required             | Meaning                                                                                                              |
| ------------ | -------------------- | -------------------------------------------------------------------------------------------------------------------- |
| `id`         | yes                  | Unique id, stored in `GameState.upgrades` and sent in `chooseUpgrade`                                                |
| `name`       | yes                  | Title on the pick card                                                                                               |
| `text`       | yes                  | One line on the card. `{0}`, `{1}`, … are replaced by the size (absolute value) of effect 0, 1, … at the card's tier |
| `pools`      | yes                  | Non-empty list of `survival`, `timed`, `shop`, no repeats                                                            |
| `tier`       | non-tiered only      | The one tier it exists at. Leaving it out makes the upgrade tiered                                                   |
| `maxCopies`  | yes                  | Most copies one run can own. Whole number `>= 1`                                                                     |
| `sellable`   | yes                  | Whether the shop will buy a copy back. Upgrades that change plots or lives are `false`                               |
| `effects`    | yes                  | Non-empty list. Tiered: `{ stat, perTier }` with five values, common first. Non-tiered: `{ stat, amount }`           |
| `target`     | no                   | `"plot"` or `"crop"`. Leaving it out means the upgrade applies everywhere                                            |
| `targetRule` | when `target` is set | `"oncePerTarget"` or `"stackable"`                                                                                   |
| `requires`   | no                   | Upgrade ids that must be owned (at least one copy each) before this one is offered                                   |
| `category`   | no                   | A group name, for per-category copy limits later. Not used by any rule yet                                           |
| `needs`      | no                   | Game systems the run must have for this upgrade to be offered. `"powerUps"` or `"events"`                            |

### Shipped upgrades (phase 1)

All numbers are placeholders until playtesting.

| id                 | name              | pools           | tier   | maxCopies | effects (common → legendary)                                       | target            | sellable |
| ------------------ | ----------------- | --------------- | ------ | --------- | ------------------------------------------------------------------ | ----------------- | -------- |
| `fastGrowth`       | Fast growth       | survival, timed | tiered | 5         | `growthPct` −2, −4, −7, −12, −20                                   | –                 | yes      |
| `patientCustomers` | Patient customers | survival, timed | tiered | 5         | `orderTimePct` +3, +6, +10, +15, +25                               | –                 | yes      |
| `bigTips`          | Big tips          | survival, timed | tiered | 5         | `coinsPerOrder` +1, +2, +3, +5, +8                                 | –                 | yes      |
| `lifeDiscount`     | Life discount     | survival        | tiered | 5         | `lifePricePct` −3, −6, −10, −15, −25                               | –                 | yes      |
| `bumperHarvest`    | Bumper harvest    | survival, timed | tiered | 5         | `bumperChance` +5, +8, +12, +18, +25                               | –                 | yes      |
| `favoriteCrop`     | Favorite crop     | survival, timed | tiered | 3         | `growthPct` −3, −6, −10, −15, −25; `yieldBonus` +1, +1, +1, +2, +3 | crop, `stackable` | yes      |
| `extraPlot`        | Extra plot        | shop            | rare   | 2         | `extraPlots` +1                                                    | –                 | no       |

Shipped stats:

| Stat            | base | min | max | Meaning                                             |
| --------------- | ---- | --- | --- | --------------------------------------------------- |
| `extraPlots`    | 0    | 0   | 2   | Plots added on top of `START_PLOTS`                 |
| `growthPct`     | 100  | 20  | 100 | % of a crop's `growTicks`; 80 = takes 20% less time |
| `yieldBonus`    | 0    | 0   | 3   | Extra crops per harvest                             |
| `bumperChance`  | 0    | 0   | 50  | % chance that a harvest gives 1 more crop           |
| `orderTimePct`  | 100  | 100 | 200 | % of the order time limit                           |
| `coinsPerOrder` | 0    | 0   | 20  | Extra coins per filled order                        |
| `lifePricePct`  | 100  | 25  | 100 | % of the normal life price                          |

### Shipped with power-ups

Added with [powerups.md](powerups.md). All three have `"needs": ["powerUps"]`.

| id            | name         | pools           | tier   | maxCopies | effects (common → legendary)                 | target | sellable |
| ------------- | ------------ | --------------- | ------ | --------- | -------------------------------------------- | ------ | -------- |
| `luckyDrops`  | Lucky drops  | survival, timed | tiered | 5         | `dropChance` +2, +3, +5, +8, +12             | –      | yes      |
| `longLasting` | Long-lasting | survival, timed | tiered | 5         | `powerUpDurationPct` +10, +15, +25, +35, +50 | –      | yes      |
| `bigPockets`  | Big pockets  | survival, timed | rare   | 1         | `powerUpSlots` +1                            | –      | no       |

| Stat                 | base | min | max | Meaning                                  |
| -------------------- | ---- | --- | --- | ---------------------------------------- |
| `dropChance`         | 8    | 0   | 40  | % chance that a harvest drops a power-up |
| `powerUpSlots`       | 2    | 1   | 3   | Power-ups the player can hold at once    |
| `powerUpDurationPct` | 100  | 100 | 200 | % of a lasting power-up's length         |

### Shipped with events

Added with [events.md](events.md), which lists the ten upgrades (Early warning, Good fortune, Calm skies, Rainmaker, Long summer, Big spender, Frost cover, Crow decoy, Mole traps, Greenhouse) and their ten stats. All have `"needs": ["events"]`. Greenhouse is the first plot-targeted upgrade that can be offered (`oncePerTarget`, not sellable).

### Shipped with the second batch

Every upgrade from the design doc that works with the systems that exist now (orders, plots, coins, lives, events and power-ups). The rest wait for their systems (see [Later phases](#later-phases)).

| id              | name           | pools           | tier   | maxCopies | effects (common → legendary)               | needs  | sellable |
| --------------- | -------------- | --------------- | ------ | --------- | ------------------------------------------ | ------ | -------- |
| `biggerBumper`  | Bigger bumper  | survival, timed | tiered | 3         | `bumperExtra` +1, +1, +1, +2, +3           | –      | yes      |
| `smallOrder`    | Small order    | survival, timed | tiered | 5         | `smallOrderChance` +5, +8, +12, +18, +25   | –      | yes      |
| `sneakPeek`     | Sneak peek     | survival, timed | rare   | 1         | `sneakPeek` +1                             | –      | yes      |
| `pestControl`   | Pest control   | survival, timed | epic   | 1         | `crowBan` +1                               | events | yes      |
| `earlyBird`     | Early bird     | survival, timed | tiered | 5         | `earlyBirdCoins` +1, +2, +3, +5, +8        | –      | yes      |
| `steadyPace`    | Steady pace    | survival        | tiered | 5         | `levelPacePct` +5, +8, +12, +18, +25       | –      | yes      |
| `extraHeart`    | Extra heart    | survival        | rare   | 2         | `extraLives` +1 (max lives +1, filled)     | –      | no       |
| `lastStand`     | Last stand     | survival        | tiered | 3         | `lastStandGrowthPct` −5, −8, −12, −18, −25 | –      | yes      |
| `secondChance`  | Second chance  | survival        | tiered | 5         | `secondChance` +5, +8, +12, +18, +25       | –      | yes      |
| `secondWind`    | Second wind    | survival        | tiered | 3         | `secondWindPct` +10, +15, +25, +35, +50    | –      | yes      |
| `wormFarm`      | Worm farm      | survival, timed | tiered | 3         | `wormBonusPct` +50, +100, +100, +150, +200 | events | yes      |
| `goodNeighbors` | Good neighbors | survival, timed | rare   | 1         | `neighborReplant` +1                       | events | yes      |
| `compost`       | Compost        | survival, timed | epic   | 1         | `fertilizerUnlocked` +1                    | –      | no       |
| `birdNet`       | Bird net       | survival, timed | tiered | 3         | `birdPlotsPct` −10, −15, −20, −25, −33     | events | yes      |
| `rootCellar`    | Root cellar    | survival, timed | tiered | 3         | `rotPct` −10, −15, −25, −35, −50           | events | yes      |
| `lantern`       | Lantern        | survival, timed | tiered | 3         | `fogDurationPct` −10, −15, −25, −35, −50   | events | yes      |
| `calmNerves`    | Calm nerves    | survival, timed | tiered | 3         | `emergencyTimePct` +10, +15, +25, +35, +50 | events | yes      |

Bigger bumper has `"requires": ["bumperHarvest"]`. Early bird is in both pools, since Timed orders pay coins too (for now); Steady pace, Extra heart, Last stand, Second chance and Second wind are Survival only by design. Extra heart is not sellable because it adds lives, like Extra plot adds plots.

| Stat                     | base | min | max | Meaning                                                                                        |
| ------------------------ | ---- | --- | --- | ---------------------------------------------------------------------------------------------- |
| `bumperExtra`            | 1    | 1   | 4   | Crops a Bumper harvest hit adds                                                                |
| `smallOrderChance`       | 0    | 0   | 50  | % chance a new order asks for half as much                                                     |
| `sneakPeek`              | 0    | 0   | 1   | 1: the next order is shown before it arrives                                                   |
| `crowBan`                | 0    | 0   | 1   | 1: Crows are never announced (Crows' `banStat`)                                                |
| `earlyBirdCoins`         | 0    | 0   | 15  | Coins for filling an order with at least half its time left                                    |
| `levelPacePct`           | 100  | 100 | 200 | % of filled orders a Survival level takes                                                      |
| `extraLives`             | 0    | 0   | 2   | Added to the lives cap (`MODES.survival.maxLives`); each rise also adds a life                 |
| `lastStandGrowthPct`     | 100  | 50  | 100 | % of growth time for crops planted on the last life                                            |
| `secondChance`           | 0    | 0   | 50  | % chance a failed order costs no life                                                          |
| `secondWindPct`          | 100  | 100 | 200 | % of the time limit of the first new order after a lost life                                   |
| `wormBonusPct`           | 100  | 100 | 300 | Worms' `amountStat`                                                                            |
| `neighborReplant`        | 0    | 0   | 1   | 1: Helpful neighbor replants what they harvest                                                 |
| `fertilizerUnlocked`     | 0    | 0   | 1   | 1: fertilizer can be made and used when `economy.json` locks it (see [economy.md](economy.md)) |
| `storageBonus`           | 0    | 0   | 30  | Crops storage holds on top of the mode's cap (Bigger barn)                                     |
| `sellPricePct`           | 100  | 100 | 200 | % of the usual sell price (Premium produce)                                                    |
| `miracleGrow`            | 0    | 0   | 1   | 1: the Miracle grow button is unlocked                                                         |
| `miracleRechargeSeconds` | 60   | 20  | 60  | Seconds Miracle grow takes to recharge after a use                                             |
| `birdPlotsPct`           | 100  | 34  | 100 | Birds' `amountStat` (3 plots: 34% is 1 plot)                                                   |
| `rotPct`                 | 100  | 25  | 100 | Rot's `amountStat`                                                                             |
| `fogDurationPct`         | 100  | 25  | 100 | Fog's `durationStat`                                                                           |
| `emergencyTimePct`       | 100  | 100 | 200 | Emergency order's `amountStat` (its share of the usual time, capped at 100% by events.json)    |

Changes from the old six: `bigHarvest` (flat +1 yield) is replaced by `bumperHarvest`, a chance of 1 extra crop per harvest (see [The harvest roll](#the-harvest-roll)). `haggler` becomes `lifeDiscount` (the new Haggler belongs to the Bulk buyer event). `tips` becomes `bigTips`. `extraPlot` is shop-only, so it is not offered until the shop exists. `"timed"` is already listed in the pools so that turning Timed offers on later is a code change only.

## Types (in [types.md](types.md))

```ts
type Tier = "common" | "uncommon" | "rare" | "epic" | "legendary"
type Pool = "survival" | "timed" | "shop"
type Modifiers = {
    extraPlots: number
    growthPct: number
    yieldBonus: number
    bumperChance: number
    orderTimePct: number
    coinsPerOrder: number
    lifePricePct: number
    dropChance: number
    powerUpSlots: number
    powerUpDurationPct: number
}
type ModifierStat = keyof Modifiers
type GameSystem = "powerUps" | "events"
type StatDef = { base: number; min: number; max: number }
type TierDef = { weight: number }
type UpgradeEffect = { stat: ModifierStat; amounts: number[] } // tiered: 5 values; non-tiered: 1
type UpgradeDef = {
    id: string
    name: string
    text: string
    pools: Pool[]
    tier: Tier | null // null = tiered
    maxCopies: number
    sellable: boolean
    effects: UpgradeEffect[]
    target: "plot" | "crop" | null
    targetRule: "oncePerTarget" | "stackable" | null // null exactly when target is null
    requires: string[]
    category: string | null
    needs: GameSystem[]
}
type UpgradeConfig = {
    stats: Record<ModifierStat, StatDef>
    tiers: Record<Tier, TierDef>
    upgrades: Record<string, UpgradeDef> // id -> definition
}
type UpgradeTarget = number | string | null // plot index, crop id, or null for untargeted
type OwnedUpgrade = { id: string; tier: Tier; target: UpgradeTarget }
type OfferCard = { id: string; tier: Tier }
```

The JSON's `perTier` and `amount` both become `amounts` (five values or one), so code reads an effect the same way for both kinds. Optional JSON fields become `null` or `[]`, so every `UpgradeDef` has the same shape.

## Constants (in [game_constants.md](game_constants.md))

| Constant             | Value | Meaning                                                         |
| -------------------- | ----- | --------------------------------------------------------------- |
| `ORDERS_PER_UPGRADE` | `10`  | An offer is made after every this many filled orders            |
| `UPGRADE_CHOICES`    | `3`   | Cards on one offer (fewer if fewer upgrades are eligible)       |
| `TIERS`              | list  | `["common", "uncommon", "rare", "epic", "legendary"]`, in order |

`MIN_MODIFIER_PCT` is removed: each stat's `min` and `max` in `upgrades.json` replace it.

## Exports

### `validateUpgrades(raw: unknown): UpgradeConfig`

Checks a parsed JSON value and returns it in the typed shape. Throws an `Error` naming the bad entry when:

- `raw` is not an object with `stats`, `tiers` and a non-empty `upgrades` list.
- `stats` is missing a `Modifiers` field or has an extra one; a `base`, `min` or `max` is not a whole number; or `min <= base <= max` fails.
- `tiers` is missing a tier or has an extra one; a tier has a field other than `weight`; a `weight` is not a whole number `>= 0`; or every weight is 0. (The shop's refund replaced `sellPrice`; see [shop.md](shop.md).)
- `kind`, when present, is not `"lasting"` or `"instant"`; an instant upgrade has no `instant` action, no `tier`, or has `maxCopies`, `sellable`, `effects`, `target`, `targetRule` or `requires`; a lasting one has `instant`.
- An upgrade's `id`, `name` or `text` is not a non-empty string, or an `id` is used twice.
- `pools` is empty, has a repeat, or has a value that is not a pool.
- `tier`, when present, is not a tier.
- `maxCopies` is not a whole number `>= 1`.
- `sellable` is not `true` or `false`.
- `effects` is empty; an effect's `stat` is not a `Modifiers` field; two effects use the same stat.
- A **tiered** upgrade's effect doesn't have `perTier`, or has `amount`; `perTier` doesn't have exactly five whole numbers; a value is 0; the values don't all have the same sign; or a value is smaller in size than the one before it (a higher tier is never weaker).
- A **non-tiered** upgrade's effect doesn't have `amount`, or has `perTier`; or `amount` is not a whole number other than 0.
- `target` is set but is not `plot` or `crop`; `targetRule` is set without `target`, missing with it, or not one of its two values.
- A targeted upgrade's effect uses a stat that is not read per plot and crop (only `growthPct`, `yieldBonus`, `bumperChance` and `shielded` are; see [Where the modifiers apply](#where-the-modifiers-apply)).
- `requires` names an unknown id or the upgrade itself.
- `category`, when present, is not a non-empty string.
- `needs`, when present, has a repeat or a value that is not a `GameSystem`.

A bad file is a setup mistake, so this throws instead of returning `null`.

### `UPGRADES: UpgradeConfig`

`upgrades.json` passed through `validateUpgrades` once, when the module loads.

Every function below takes an optional last argument `config: UpgradeConfig = UPGRADES`, so tests can use their own upgrades.

### `baseModifiers(config?): Readonly<Modifiers>`

Each stat's `base`. Frozen.

### `effectAmount(def: UpgradeDef, effect: number, tier: Tier): number`

The amount effect number `effect` adds at `tier`: `amounts[TIERS.indexOf(tier)]` for a tiered upgrade, `amounts[0]` for a non-tiered one. Card text and every sum use this.

### `modifiersFor(upgrades: readonly OwnedUpgrade[], config?): Readonly<Modifiers>`

The run-wide totals:

1. Start from each stat's `base`.
2. For each owned copy **with `target: null`**, add `effectAmount` of each of its effects to that effect's stat.
3. Clamp every stat to its `[min, max]`.

Rules:

- Targeted copies are left out; they only count in `modifiersAt`.
- Throws for an id that is not in the config. `chooseUpgrade` only stores offered ids, so this means a hand-built or corrupted state.
- Stacking adds; it never multiplies. Clamping happens once, at the end, so the result doesn't depend on the order of the copies.
- **Remembers its last result.** If called with the same `upgrades` array object (`===`) and config as last time, it returns the same frozen object without adding up again. The sim never changes arrays in place and only `chooseUpgrade` builds a new `upgrades` array, so this recalculates once per pick and once per new run.

### `modifiersAt(upgrades, where: { plot: number | null; cropId: string | null }, config?): Readonly<Modifiers>`

The totals at one place: like `modifiersFor`, but step 2 also adds copies whose target matches, meaning a `plot` upgrade whose target equals `where.plot`, or a `crop` upgrade whose target equals `where.cropId`. Clamping still happens once, on the combined total, so a stat's cap applies to everything that affects that crop on that plot. Not cached; it is only called by `plant` and `harvest`.

`modifiersAt(upgrades, { plot: null, cropId: null })` equals `modifiersFor(upgrades)`.

### `scalePct(base: number, pct: number): number`

`max(1, round(base × pct / 100))`. Every rule that applies a `…Pct` modifier uses this, so they all round the same way.

### `plantGrowthPct(state: GameState, plot: number, cropId: string): number`

The `growthPct` a crop planted now gets: `modifiersAt(upgrades, { plot, cropId }).growthPct`, and on a Survival run with `lives === 1` that value passed through `scalePct(…, lastStandGrowthPct)`. `plant`, Birds and Good neighbors all plant through it, so every newly planted crop follows the same rule. Crops already growing are not sped up when the player reaches their last life.

### `copyCount(upgrades: readonly OwnedUpgrade[], id: string): number`

How many copies of `id` are owned, at any tier and on any target.

### `validTargets(upgrades, id: string, plotCount: number, crops: CropTable, config?): UpgradeTarget[]`

Where a new copy of `id` could go:

- Untargeted upgrade: `[null]` if at least one effect can still change its stat in `modifiersFor`, else `[]`.
- `plot` upgrade: plot indexes `0 … plotCount − 1`, ascending.
- `crop` upgrade: crop ids in `crops`, sorted alphabetically.

A plot or crop is left out when:

- the rule is `oncePerTarget` and a copy of `id` already has that target; or
- no effect can still change its stat there. For a plot this is checked with `modifiersAt(upgrades, { plot, cropId: null })`; for a crop, with `modifiersAt(upgrades, { plot: null, cropId })`. A crop-and-plot pair can still be clamped later; clamping keeps that safe.

**Can still change** means: the effect's amount is negative and the total is above the stat's `min`, or the amount is positive and the total is below its `max`. Sign is the same at every tier (validated), so this doesn't depend on which tier is rolled.

Plots are only ever added to the end of `plots`, never removed, so a plot index stays valid for the whole run.

### `eligibleUpgrades(state: GameState, pool: Pool, crops: CropTable, config?): string[]`

Ids that can be offered from `pool`, sorted. An id is eligible when all of these hold:

1. `pool` is in its `pools`.
2. `copyCount < maxCopies`.
3. Every id in `requires` has at least one owned copy.
4. `validTargets` is not empty.
5. Every system in `needs` is on in this run: `"powerUps"` means `state.allowPowerUps`, `"events"` means `state.allowEvents`.
6. It isn't an upgrade that would do nothing (`unlocksNothing`): Compost is skipped while fertilizer is a basic action (see [economy.md](economy.md)).

### `rollOffer(state: GameState, pool: Pool, crops: CropTable, config?): [OfferCard[], RNGState]`

Draws the next offer from `state.rng.upgrades` and returns the cards and the new state of that stream. For each of up to `UPGRADE_CHOICES` cards, in turn:

1. **Candidates per tier.** For each tier, the eligible ids that exist at that tier and are not already on this offer. A tiered upgrade exists at every tier; a non-tiered one only at its `tier`.
2. **Usable tiers.** The tiers, in `TIERS` order, that have a weight above 0 and at least one candidate. If there are none, the offer stops here with the cards drawn so far.
3. **Tier draw.** `r = randomInt(0, W − 1)`, where `W` is the sum of the usable tiers' weights. Walking the usable tiers in order and subtracting each weight, the tier where `r` drops below its weight is chosen.
4. **Upgrade draw.** `pick` one id from that tier's candidates (sorted).
5. The card is `{ id, tier }`.

Rules:

- Exactly two draws per card. With nothing eligible, returns `[]` and the stream unchanged.
- A tier with no candidates is skipped and the other weights keep their proportions. For example, if nothing is left at legendary, the four remaining tiers are rolled at 40 : 30 : 15 : 10.
- No id appears twice on one offer, even at different tiers.
- A non-tiered upgrade competes only within its own tier, so adding more upgrades at one tier lowers the chance of each other upgrade at that tier.
- Tier weights come from `config.tiers` as they are. Luck upgrades that change them come later (see Open items).

## The offer flow (in [main.md](main.md))

`GameState` fields:

| Field          | Starting value                                                                                                       | Meaning                                                             |
| -------------- | -------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------- |
| `rng`          | `{ orders: seedRNG(seed), upgrades: seedStream(seed, 1), harvest: seedStream(seed, 2), drops: seedStream(seed, 3) }` | One generator state per system (see [mulberry.md](mulberry.md))     |
| `upgrades`     | `[]`                                                                                                                 | `OwnedUpgrade` copies, in pick order                                |
| `upgradeOffer` | `null`                                                                                                               | The `OfferCard`s on offer while the player is choosing, else `null` |
| `offersMade`   | `0`                                                                                                                  | Offers made so far this run                                         |

1. **Offer due:** in Survival, when `ordersCompleted >= (offersMade + 1) × ORDERS_PER_UPGRADE`. So the 1st offer comes after the 10th filled order, the 2nd after the 20th, and so on.
2. **Making the offer:** at the end of a `step` (after new orders, and only if the run didn't end on that step), if an offer is due, `rollOffer(state, "survival", crops)` draws it from `rng.upgrades`, `upgradeOffer` is set and `offersMade` goes up by 1. If nothing is eligible, `offersMade` still goes up and `upgradeOffer` stays `null`, so the run continues.
3. **The clock stops:** while `upgradeOffer` is not `null`, `step` returns the state unchanged (same object), and `applyAction` refuses every action except `chooseUpgrade`.
4. **Picking:** `chooseUpgrade { upgradeId, target? }` is accepted only when:
    - `upgradeId` is on the offer;
    - for an untargeted upgrade, `target` is left out (or `null`);
    - for a targeted upgrade, `target` is one of `validTargets(upgrades, upgradeId, plots.length, crops)`.

    It appends `{ id, tier: <the card's tier>, target }` to `upgrades` (a new array) and sets `upgradeOffer` to `null`.

5. **Extra plots:** after a pick, `plots.length` must equal `START_PLOTS + modifiersFor(upgrades).extraPlots`. If the pick raised `extraPlots`, that many empty plots are added to the end of `plots`. Because the clamped total is used, a pick past the cap adds no plot.

The random draws for offers come from `rng.upgrades`, separate from `rng.orders`. So the Nth order a run creates is the same whatever the player picks, and later rerolls won't change which orders come next.

## Where the modifiers apply

Each modifier is read in one place. Changes apply from then on; nothing already made is changed afterwards.

| Modifier             | Read by                                           | Through                                             | Effect                                                                                             |
| -------------------- | ------------------------------------------------- | --------------------------------------------------- | -------------------------------------------------------------------------------------------------- |
| `extraPlots`         | `chooseUpgrade`                                   | `modifiersFor`                                      | Adds plots when the total goes up                                                                  |
| `growthPct`          | `plant`                                           | `modifiersAt({ plot, cropId })`                     | `readyAt = now + scalePct(growTicks, growthPct)`; crops already growing keep their `readyAt`       |
| `yieldBonus`         | `harvest`                                         | `modifiersAt({ plot, cropId })`                     | Adds `crops[cropId].yield + yieldBonus`                                                            |
| `bumperChance`       | `harvest`                                         | `modifiersAt({ plot, cropId })`                     | Adds 1 more crop when the harvest roll is below it (see below)                                     |
| `orderTimePct`       | `orderRules` (Survival)                           | `modifiersFor`                                      | `orderTicks = scalePct(level orderTicks, orderTimePct)` for new orders                             |
| `coinsPerOrder`      | `deliver` (Survival)                              | `modifiersFor`                                      | Pays `DIFFICULTY.coinsPerOrder + coinsPerOrder`                                                    |
| `lifePricePct`       | `lifePriceFor` / `buyLife`                        | `modifiersFor`                                      | Price is `scalePct(lifePrice(livesBought), lifePricePct)`                                          |
| `dropChance`         | `rollDrop` (on `harvest`)                         | `modifiersFor`                                      | % chance of a power-up drop per harvest (see [powerups.md](powerups.md))                           |
| `powerUpSlots`       | `harvest`                                         | `modifiersFor`                                      | A drop is kept only while `powerUps.length < powerUpSlots`                                         |
| `powerUpDurationPct` | `durationFor` (on `usePowerUp`)                   | `modifiersFor`                                      | Lasting power-ups run `scalePct(durationTicks, powerUpDurationPct)` ticks                          |
| event stats          | `announceEvent`, `gapTicks`, event start          | `modifiersFor` (`shielded`: `modifiersAt` per plot) | See the table in [events.md](events.md)                                                            |
| `bumperExtra`        | `harvest`                                         | `modifiersAt({ plot, cropId })`                     | A bumper hit adds `bumperExtra` crops instead of 1                                                 |
| `smallOrderChance`   | `step` (new orders), `nextOrderPreview`           | `modifiersFor`                                      | One roll from `rng.shrink` per new order; a hit halves every amount, rounding up, and sets `small` |
| `sneakPeek`          | `nextOrderPreview`                                | `modifiersFor`                                      | Above 0, the screen shows the next order                                                           |
| `earlyBirdCoins`     | `deliver`, Finish one / Finish all                | `modifiersFor`                                      | Paid in Survival when `2 × timeLeft >= timeLimit`                                                  |
| `levelPacePct`       | `runLevel` (in [difficulty.md](difficulty.md))    | `modifiersFor`                                      | Level is `levelFor(floor(ordersCompleted × 100 / levelPacePct))`                                   |
| `extraLives`         | `withUpgrade`, `maxLivesFor`                      | `modifiersFor`                                      | Raises the lives cap; in Survival, a rise in the total also adds that many lives                   |
| `lastStandGrowthPct` | `plantGrowthPct` (`plant`, Birds, Good neighbors) | `modifiersFor`                                      | On a Survival run's last life, `growthPct` is scaled by it (`scalePct`)                            |
| `secondChance`       | `step` (failed orders)                            | `modifiersFor`                                      | One roll from `rng.lives` per failed order; a hit keeps the life                                   |
| `secondWindPct`      | `step` (new orders)                               | `modifiersFor`                                      | After a lost life, the next new order's `orderTicks` is scaled by it                               |

### The harvest roll

`harvest` is the only action that draws random numbers. The bumper roll below uses `rng.harvest`; the power-up drop roll after it uses `rng.drops` (see [powerups.md](powerups.md)):

- When `bumperChance` (at that plot and crop) is 0, it draws nothing and `rng.harvest` is unchanged. Runs without Bumper harvest never touch the stream.
- Otherwise it draws once: `roll = randomInt(rng.harvest, 0, 99)`. If `roll < bumperChance`, the harvest adds 1 more crop. The new state is stored in `rng.harvest` either way.
- The extra crops are added after `yieldBonus`: `crops[cropId].yield + yieldBonus + (bumper ? bumperExtra : 0)`, plus any Worms bonus (`harvestBonusAt`, see [effects.md](effects.md)). Bigger bumper raises `bumperExtra` (base 1).

Replay stays exact, because the stream lives in `GameState` and actions are replayed in log order. Lucky drops rolls from its own stream, `rng.drops`, so Bumper harvest never changes which power-ups drop.

Adding a stat means: a `Modifiers` field, an entry under `stats` in `upgrades.json`, and one row here with the one place that reads it. Adding an upgrade that only uses existing stats is a JSON entry and nothing else.

## Rules

- No Phaser or browser imports. Pure apart from the last-result cache in `modifiersFor`, which never changes what is returned for given arguments.
- `GameState` stays plain JSON: it holds `OwnedUpgrade` and `OfferCard` objects (ids, tiers, targets), never `Modifiers`.
- No rule reads an upgrade id. A yes/no ability is a stat with `max` 1.

## Tests (`upgrades.test.ts`)

**`validateUpgrades`**

- Accepts the shipped `upgrades.json`.
- Throws for each case in its list above, one test per case, using a small valid config with one field changed.
- Turns `perTier` and `amount` into `amounts`, and missing optional fields (including `needs`) into `null` / `[]`.

**`effectAmount`**

- Gives each tier's value for a tiered upgrade, and the one amount at any tier for a non-tiered one.

**`modifiersFor`**

- No upgrades gives each stat's `base`.
- One copy changes only its stats, by its tier's amount; copies at different tiers add up.
- Totals are clamped to `min` and `max`; the order of the copies doesn't change the result.
- Targeted copies are ignored.
- Throws for an unknown id.
- The same array object returns the same result object; a new array with the same contents gives an equal result; switching configs recalculates.

**`modifiersAt`**

- Adds a crop copy only for its crop, and a plot copy only for its plot; both together on a matching plot and crop.
- Clamps the combined total.
- With `{ plot: null, cropId: null }`, equals `modifiersFor`.

**`scalePct`**

- 100% returns the base; rounds to the nearest whole number; never goes below 1.

**`validTargets`**

- Untargeted: `[null]`, or `[]` once every effect's stat is at its cap.
- Plot, `oncePerTarget`: every plot with no copies; drops a plot once it has one; lists a new plot after an extra plot is added.
- Crop, `stackable`: every crop, sorted, even with copies on it; drops a crop once its stats are capped there.

**`eligibleUpgrades`**

- Lists only ids in the given pool, sorted.
- Drops an id at `maxCopies`, counting copies of every tier.
- Drops an id whose `requires` aren't owned, and lists it once they are.
- Drops an id with no valid targets, and an untargeted id whose stats are all capped.
- Drops an id with `needs: ["powerUps"]` when `allowPowerUps` is off, and lists it when it is on.

**`rollOffer`**

- Gives `UPGRADE_CHOICES` cards with different ids, using exactly two draws per card, from `rng.upgrades` only.
- The same state gives the same offer.
- Each card's tier is one its upgrade exists at; a non-tiered upgrade always comes at its own tier.
- With weights `[1, 0, 0, 0, 0]`, every card is common; with a tier that has no candidates, that tier never comes up and the run still gets a full offer when enough is eligible.
- Over many seeds, tier frequencies are close to the weights (a loose bound, to catch a broken walk, not to test the generator).
- Offers fewer cards when fewer ids are eligible, and `[]` with the stream unchanged when none are.

**Offer flow (`main.test.ts`)**

- No offer before `ORDERS_PER_UPGRADE` filled orders; an offer on the step after the `ORDERS_PER_UPGRADE`th.
- While an offer is open, `step` returns the same state and every other action returns `null`.
- `chooseUpgrade` stores `{ id, tier, target }` with the card's tier and clears the offer.
- It refuses: no offer open; an id not on the offer; a target on an untargeted upgrade; no target, or a target not in `validTargets`, on a targeted one.
- The next offer comes at `2 × ORDERS_PER_UPGRADE`; Timed makes offers from the `timed` pool on the same schedule; with nothing eligible the run carries on with no offer.
- Bumper harvest: with `bumperChance` 0, a harvest leaves `rng.harvest` unchanged; above 0, it draws exactly once, adds 1 crop exactly when the roll is below the chance, and both outcomes happen over many seeds. A harvest never changes `rng.orders` or `rng.upgrades`.
- Making an offer leaves `rng.orders` unchanged, so two Survival runs on the same seed that pick different upgrades get the same order sequence (same crops and same draws).
- Each modifier changes its rule as in the table above; a Favorite crop copy changes growth and yield only for its crop.
- An `extraPlots` pick adds an empty plot; a pick past the cap adds none.

**Second batch (`main.test.ts`, `events.test.ts`, `format.test.ts`)**

- Bigger bumper: a hit adds `bumperExtra` crops instead of 1 (only the two outcomes happen over many seeds); it is only eligible once Bumper harvest is owned.
- Small order: halves amounts (rounding up) and sets `small` on a hit, and keeps the value; draws once per new order from `rng.shrink` only, never moving `rng.orders`; without it the stream never moves.
- Sneak peek: `nextOrderPreview` is `null` without it, and otherwise has the id and crops of the order `step` creates next.
- Early bird pays on a delivery with exactly half the time left and not one tick later.
- Steady pace: `runLevel` and `orderRules` stay on level 1 at `ordersPerLevel` filled orders with +25%.
- Extra heart raises the lives cap by one and fills the new heart in Survival, adds nothing in Timed, and nothing past its stat cap.
- Last stand speeds crops planted with 1 life left, and not with 2.
- Second chance draws once per failed order from `rng.lives`, keeps the life on some seeds and not others, and never draws without the upgrade.
- Second wind stretches only the first new order after a lost life.
- Pest control removes Crows from `eligibleEvents`; Worm farm, Bird net, Root cellar, Lantern and Calm nerves change their event as in [events.md](events.md); Good neighbors replants.

**Timed pool (`main.test.ts`)**

- All six are in the `timed` pool only; `createGame` starts with `comboMisses` and `pairOpenUntil` at 0.
- Combo keeper: forgives `comboMissesForgiven` failed orders per streak, then breaks; breaks when more fail on one tick than it has left, and when the window ran out; without it the first failed order breaks the streak.
- Combo builder adds its step per order in a row under the same cap; Head start lifts the multiplier from x1 (and the HUD's combo text), and gives 100 outside Timed.
- Rush pay changes only rush orders' value, as `scalePct(value, valuePct + rushValuePct)`.
- Grand finale scores more from tick `runTicks − finaleTicks` on and not the tick before.
- Double delivery: a fill opens a pair, one within `pairTicks` scores more and closes it, the next opens a new one; a late fill doesn't pair; Finish all leaves the pair alone.
- Scripted Timed runs that pick upgrades replay equal.

**Storage, selling and Miracle grow (`main.test.ts`, `economy.test.ts`, `format.test.ts`)**

- Bigger barn raises the cap in both modes, lets a harvest fit that wouldn't before, and stops being offered once `storageBonus` is capped.
- Premium produce raises what `sellCrop` pays; `sellValue` applies the bonus before its one rounding; the Sell button shows the boosted price.
- Miracle grow: starts ready and is unusable without the upgrade; finishes a growing plot and sets `miracleReadyAt`, shorter at higher tiers; refused while recharging and usable again on `miracleReadyAt`; refused on a plot that isn't growing, a bad index, or with an offer open; the recharge waits while an offer is open. `miracleGrowText` reads `ready` or the time left.
- Runs that pick and use Miracle grow replay equal.

**Replay (`verification.test.ts`)**

- Scripted Survival runs that pick upgrades replay equal, including a targeted pick and runs with Bumper harvest.
- A log that leaves an offer unanswered and has later entries, or a later `finalTick`, fails with `offer-pending`.

## Timed pool

The six Timed-only upgrades from the design doc. All numbers are placeholders. Their stats only matter in Timed (combos, rush waves and the run clock exist only there), and they are only in the `timed` pool.

| id               | Name            | Pools | Tier   | maxCopies | Effects (common → legendary)                | Stat cap |
| ---------------- | --------------- | ----- | ------ | --------- | ------------------------------------------- | -------- |
| `comboKeeper`    | Combo keeper    | timed | tiered | 2         | `comboMissesForgiven` +1, +1, +1, +2, +2    | 3        |
| `comboBuilder`   | Combo builder   | timed | tiered | 3         | `comboStepBonusPct` +3, +5, +8, +12, +15    | 25       |
| `rushPay`        | Rush pay        | timed | tiered | 3         | `rushValuePct` +10, +15, +25, +35, +50      | 100      |
| `headStart`      | Head start      | timed | tiered | 3         | `comboStartPct` +5, +10, +15, +20, +30      | 50       |
| `grandFinale`    | Grand finale    | timed | tiered | 3         | `finalePct` +10, +15, +25, +35, +50         | 100      |
| `doubleDelivery` | Double delivery | timed | tiered | 3         | `doubleDeliveryPct` +10, +15, +25, +35, +50 | 100      |

- **Combo keeper:** each streak forgives up to `comboMissesForgiven` failed orders (counted in `GameState.comboMisses`, back to 0 when the streak breaks). A window that runs out still breaks the streak. See [main.md](main.md).
- **Combo builder** and **Head start:** added to the combo's step and starting multiplier through `comboPct`; the cap stays `capPct`. Head start lifts even the first fill of a streak.
- **Rush pay:** rush orders are made with `value = scalePct(value, rush.valuePct + rushValuePct)`, so only waves after the pick pay more.
- **Grand finale:** fills in the last `MODES.timed.finaleTicks` get `finalePct` more base points.
- **Double delivery:** a scored fill within `MODES.timed.pairTicks` of an unpaired one gets `doubleDeliveryPct` more base points and closes the pair; the next fill starts a new one. Tracked in `GameState.pairOpenUntil`.

## Storage, selling and Miracle grow

The last three Day 7 upgrades. All numbers are placeholders.

| id               | Name            | Pools           | Tier   | maxCopies | Effects (common → legendary)                                                    | Sellable |
| ---------------- | --------------- | --------------- | ------ | --------- | ------------------------------------------------------------------------------- | -------- |
| `biggerBarn`     | Bigger barn     | survival, timed | tiered | 3         | `storageBonus` +3, +5, +8, +12, +15                                             | yes      |
| `premiumProduce` | Premium produce | survival, timed | tiered | 3         | `sellPricePct` +10, +15, +25, +35, +50                                          | yes      |
| `miracleGrow`    | Miracle grow    | survival, timed | tiered | 1         | `miracleGrow` +1 at every tier; `miracleRechargeSeconds` −5, −10, −15, −20, −30 | no       |

- **Bigger barn:** `storageCap` already adds `storageBonus` (see [economy.md](economy.md)). Once the bonus reaches 30 it stops being offered.
- **Premium produce:** `sellCrop` pays `sellValueFor(state, crop, amount)`, which is `sellValue` with `sellPricePct` on top, rounded down once (see [economy.md](economy.md)). The Sell button shows the boosted price.
- **Miracle grow:** the first upgrade with a button. Owning it (`miracleGrow` 1) shows the button; `useMiracleGrow { plot }` finishes a growing plot like Ready one and sets `GameState.miracleReadyAt = tick + miracleRechargeTicks(state)`. It starts ready. The recharge counts ticks, so it waits while the game is paused or an offer is open. The base recharge (60 s) is the stat's `base`, so a tier only needs a negative amount; no new config. Not sellable, like Extra heart: selling a button mid-recharge has no clear meaning yet. See [main.md](main.md) and [ui.md](ui.md).
- The `kind: "active"` field from [Later phases](#later-phases) is not added yet: owning the `miracleGrow` stat is enough while it is the only upgrade with a button. Add `kind` (and a general `useAbility` action) with the second one.

## Later phases

Each later phase adds to this design without changing the stored shapes above.

1. **Timed offers and rerolls.** Done: `offerPool` gives the mode's pool (`survival` or `timed`; Puzzle makes none), so `isOfferDue` and `rollOffer` work in both modes. Rerolls shipped on Day 6 (see [economy.md](economy.md)); in Timed they are paid from order and selling coins.
2. **Shop.** Done: see [shop.md](shop.md), which also adds the shop-only upgrades and stats (Day 8b: Free restock's stat is `freeRestockBonus`, so each free restock earned from orders comes as two; Fast restock, `restockOrdersCut`, and Rain check, `restockBankBonus`, work on the restock bank. Interest pays every 30 s of play, up to 15 coins, on a clock that stops while the shop is open), Lucky stars (`luckyWeights` in `rollOffer`), Promotion (`kind: "instant"`, `promotionTargets`) and `plantCutTicks`. `eligibleUpgrades` takes one pool or a list of pools; `rollOffer`'s draw is shared with the shop's stock as `rollCards`.
3. **More upgrade kinds**, behind a `kind` field: `instant` (Promotion: changes an owned copy's tier and is not stored), `active` (Miracle grow: owning it unlocks a `useAbility` action, its recharge is a stat), `economy` (Interest, Discount card, Free restock: stats read by the shop).
4. **Upgrades for events, power-ups and storage** ship with those systems. Still waiting: Price floor, Haggler (selling); Keen eye, Interest, Discount card, Free restock, Lucky stars, Promotion, Rich soil, Quick soil, Auto-harvester (shop); Four-leaf (Lucky clover); Irrigation, Guard dog (tap actions for Drought and Raccoon); Clear orders (Mix-up); Festival spirit, Weed killer, Loaded coin (tradeoff events);. The Timed pool's six are in (see [Timed pool](#timed-pool)). The power-up upgrades are in (see [Shipped with power-ups](#shipped-with-power-ups)); they use `needs` rather than `requires`, since they depend on a system being on, not on another upgrade. The event upgrades use `"events"` the same way. Other chance-based upgrades (Second chance, Lucky drops) draw from a stream of their own, as Bumper harvest does.

## Open items

- [ ] Tune all numbers (tier weights, per-tier amounts, caps, `maxCopies`, `ORDERS_PER_UPGRADE`) after playtesting.
- [ ] Should rerolls roll better tiers than a normal roll?
- [ ] Luck upgrades (Lucky stars): the exact rule for changing the tier weights.
- [ ] Per-category copy limits, using `category` (for example, at most 5 growth upgrades of any kind).
- [ ] Plot-targeted upgrades are one per plot per upgrade for now. If they become sellable, they need a tradeoff: for example a limit on upgrades per plot, with same-type upgrades allowed to stack on one plot.
- [x] Bumper harvest: a third stream, `rng.harvest`, used only by `harvest` and only when `bumperChance` is above 0.
- [ ] Should `orderTimePct`'s `min` stay at 100? It stops any effect from shortening order timers, which rules out negative effects such as the Fake merchant's.
- [ ] Pre-run boosts (meta currency, Daily Challenge) as starting entries in `upgrades`, passed through `createGame`.
- [ ] Big tips and Early bird are in the Timed pool again because Timed orders now pay the same coins as Survival. If Timed gets its own lower rate or stops paying, revisit both (Design Doc open question).
- [ ] Sneak peek shows the next order under the current rules; a level-up or Second wind before it arrives can still change its amount or time.
- [x] Offers use their own random stream (`rng.upgrades`), so they don't shift which orders come next.
