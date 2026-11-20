# upgrades.ts

Survival upgrades: every `ORDERS_PER_UPGRADE` filled orders the run stops and offers the player a choice of `UPGRADE_CHOICES` upgrades. The pick lasts for the rest of the run.

What each upgrade does lives in **`src/data/upgrades.json`**. Which upgrades the player has picked lives in **`GameState.upgrades`**. Rules never look at upgrade ids: they read one number from `modifiersFor(state.upgrades)`, which adds up every pick into a flat `Modifiers` object.

Only Survival offers upgrades. Timed and Puzzle runs always have `upgrades: []`, so their modifiers are the defaults.

## `src/data/upgrades.json`

A list of upgrade definitions:

```json
[
    {
        "id": "fastGrowth",
        "name": "Green thumb",
        "text": "Crops grow 15% faster",
        "stat": "growthPct",
        "amount": -15,
        "maxStacks": 3
    }
]
```

| Field       | Meaning                                                               |
| ----------- | --------------------------------------------------------------------- |
| `id`        | Unique id, stored in `GameState.upgrades` and in `chooseUpgrade`      |
| `name`      | Title on the pick card                                                |
| `text`      | One line on the pick card saying what it does                         |
| `stat`      | The `Modifiers` field it changes                                      |
| `amount`    | Added to that field for each time the upgrade is picked               |
| `maxStacks` | How many times one run can pick it. Once reached, it is never offered |

Shipped upgrades:

| id                 | name         | stat            | amount | maxStacks |
| ------------------ | ------------ | --------------- | ------ | --------- |
| `extraPlot`        | Extra plot   | `extraPlots`    | +1     | 2         |
| `fastGrowth`       | Green thumb  | `growthPct`     | −15    | 3         |
| `bigHarvest`       | Big harvest  | `yieldBonus`    | +1     | 3         |
| `patientCustomers` | Patient folk | `orderTimePct`  | +15    | 3         |
| `tips`             | Tips         | `coinsPerOrder` | +2     | 3         |
| `haggler`          | Haggler      | `lifePricePct`  | −15    | 3         |

## Types (in [types.md](types.md))

```ts
type Modifiers = {
    extraPlots: number // plots added on top of START_PLOTS
    growthPct: number // % of a crop's growTicks; 100 = normal, 85 = 15% faster
    yieldBonus: number // extra crops per harvest
    orderTimePct: number // % of the order time limit
    coinsPerOrder: number // extra coins per filled order
    lifePricePct: number // % of the normal life price
}
type ModifierStat = keyof Modifiers
type UpgradeDef = {
    id: string
    name: string
    text: string
    stat: ModifierStat
    amount: number
    maxStacks: number
}
type UpgradeTable = Record<string, UpgradeDef> // id -> definition
```

## Constants (in [game_constants.md](game_constants.md))

| Constant             | Value | Meaning                                                                          |
| -------------------- | ----- | -------------------------------------------------------------------------------- |
| `ORDERS_PER_UPGRADE` | `10`  | An offer is made after every this many filled orders                             |
| `UPGRADE_CHOICES`    | `3`   | Upgrades on one offer (fewer if fewer can still be picked)                       |
| `MIN_MODIFIER_PCT`   | `25`  | Floor for every `…Pct` modifier, so stacking can't make anything instant or free |

## Exports

### `validateUpgrades(raw: unknown): UpgradeTable`

Checks a parsed JSON value and returns it as a table keyed by id. Throws an `Error` naming the bad entry when:

- `raw` is not a non-empty list.
- An entry's `id`, `name` or `text` is not a non-empty string, or an `id` is used twice.
- `stat` is not a `Modifiers` field.
- `amount` is not a whole number other than 0.
- `maxStacks` is not a whole number `>= 1`.

A bad file is a setup mistake, so this throws instead of returning `null`.

### `UPGRADES: UpgradeTable`

`upgrades.json` passed through `validateUpgrades` once, when the module loads.

Every function below takes an optional last argument `table: UpgradeTable = UPGRADES`, so tests can use their own upgrades.

### `BASE_MODIFIERS: Readonly<Modifiers>`

The modifiers with no upgrades: `extraPlots 0`, `growthPct 100`, `yieldBonus 0`, `orderTimePct 100`, `coinsPerOrder 0`, `lifePricePct 100`. Frozen.

### `modifiersFor(upgrades: readonly string[], table?): Readonly<Modifiers>`

Adds up the picks:

1. Start from `BASE_MODIFIERS`.
2. For each id in `upgrades` (repeats count each time), add `table[id].amount` to `table[id].stat`.
3. Clamp: every `…Pct` field to at least `MIN_MODIFIER_PCT`, every other field to at least `0`.

Rules:

- Throws for an id that is not in the table. `chooseUpgrade` only stores offered ids, so this means a hand-built or corrupted state.
- Stacking adds; it never multiplies. Two `fastGrowth` picks give `growthPct` 70.
- **Remembers its last result.** If called with the same `upgrades` array object (`===`) and table as last time, it returns the same object without adding up again. The sim never changes arrays in place and only `chooseUpgrade` builds a new `upgrades` array, so this recalculates once per pick and once per new run. A different array with the same contents gives an equal result, just recalculated. The returned object is frozen and must not be changed.

### `scalePct(base: number, pct: number): number`

`max(1, round(base × pct / 100))`. Every rule that applies a `…Pct` modifier uses this, so they all round the same way.

### `stackCount(upgrades: readonly string[], id: string): number`

How many times `id` appears in `upgrades`.

### `eligibleUpgrades(upgrades: readonly string[], table?): string[]`

Ids that can still be offered (`stackCount < maxStacks`), sorted, so the list doesn't depend on the JSON's key order.

### `rollOffer(upgrades, rng: RNGState, table?): [string[], RNGState]`

Picks the next offer from `eligibleUpgrades(upgrades)`:

- Offers `min(UPGRADE_CHOICES, eligible.length)` different ids, in the order drawn.
- Uses a partial Fisher–Yates shuffle: for `i` from 0, draw `j = randomInt(i, n − 1)` and swap positions `i` and `j`. Exactly one draw per offered id.
- With nothing eligible, returns `[]` and the same `rng`.

## The offer flow (in [main.md](main.md))

New `GameState` fields:

| Field          | Starting value | Meaning                                                    |
| -------------- | -------------- | ---------------------------------------------------------- |
| `upgrades`     | `[]`           | Picked ids, in pick order. Repeats mean stacks             |
| `upgradeOffer` | `null`         | The ids on offer while the player is choosing, else `null` |
| `offersMade`   | `0`            | Offers made so far this run                                |

1. **Offer due:** in Survival, when `ordersCompleted >= (offersMade + 1) × ORDERS_PER_UPGRADE`. So the 1st offer comes after the 10th filled order, the 2nd after the 20th, and so on.
2. **Making the offer:** at the end of a `step` (after new orders, and only if the run didn't end on that step), if an offer is due, `rollOffer` draws it from `rngState`, `upgradeOffer` is set and `offersMade` goes up by 1. If nothing is eligible, `offersMade` still goes up and `upgradeOffer` stays `null`, so the run continues.
3. **The clock stops:** while `upgradeOffer` is not `null`, `step` returns the state unchanged (same object), and `applyAction` refuses every action except `chooseUpgrade`. Nothing can be grown, delivered or bought on frozen time.
4. **Picking:** `chooseUpgrade { upgradeId }` is accepted only if `upgradeId` is in `upgradeOffer`. It appends the id to `upgrades` (a new array) and sets `upgradeOffer` to `null`. `extraPlot` also adds `amount` empty plots to the end of `plots` right away.

## Where the modifiers apply

Each modifier is read in one place. Changes apply from then on; nothing already made is changed afterwards.

| Modifier        | Read by                    | Effect                                                                                       |
| --------------- | -------------------------- | -------------------------------------------------------------------------------------------- |
| `extraPlots`    | `chooseUpgrade`            | Adds plots once, when picked                                                                 |
| `growthPct`     | `plant`                    | `readyAt = now + scalePct(growTicks, growthPct)`; crops already growing keep their `readyAt` |
| `yieldBonus`    | `harvest`                  | Adds `crops[cropId].yield + yieldBonus`                                                      |
| `orderTimePct`  | `orderRules` (Survival)    | `orderTicks = scalePct(level orderTicks, orderTimePct)` for new orders                       |
| `coinsPerOrder` | `deliver` (Survival)       | Pays `DIFFICULTY.coinsPerOrder + coinsPerOrder`                                              |
| `lifePricePct`  | `lifePriceFor` / `buyLife` | Price is `scalePct(lifePrice(livesBought), lifePricePct)`                                    |

## Rules

- No Phaser or browser imports. Pure apart from the last-result cache in `modifiersFor`, which never changes what is returned for given arguments.
- `GameState` stays plain JSON: it holds ids, never `Modifiers` objects.

## Tests (`upgrades.test.ts`)

**`validateUpgrades`**

- Accepts the shipped `upgrades.json`.
- Throws for: not a list, an empty list, a duplicate id, a missing name, an unknown stat, an amount of 0 or a fraction, and `maxStacks` 0.

**`modifiersFor`**

- No upgrades gives `BASE_MODIFIERS`.
- One pick changes only its stat; repeats stack by adding.
- `…Pct` fields stop at `MIN_MODIFIER_PCT`, others at 0.
- Throws for an unknown id.
- The same array object returns the same result object; a new array with the same contents gives an equal result; a new array with another pick gives the new totals.
- Switching tables with the same array recalculates.

**`scalePct`**

- 100% returns the base; rounds to the nearest whole number; never goes below 1.

**`eligibleUpgrades`**

- Lists every id, sorted, with no picks; drops an id once it reaches `maxStacks`.

**`rollOffer`**

- Gives `UPGRADE_CHOICES` different eligible ids and uses exactly that many draws.
- The same `rng` gives the same offer.
- Offers fewer when fewer are eligible, and `[]` with the RNG unchanged when none are.
- Never offers an id at `maxStacks`.

**Offer flow (`main.test.ts`)**

- No offer before `ORDERS_PER_UPGRADE` filled orders; an offer of `UPGRADE_CHOICES` ids on the step after the `ORDERS_PER_UPGRADE`th.
- While an offer is open, `step` returns the same state and every other action returns `null`.
- `chooseUpgrade` stores the pick and clears the offer; it refuses an id not on the offer and refuses when there is no offer.
- The next offer comes at `2 × ORDERS_PER_UPGRADE`.
- Timed never makes an offer.
- With nothing eligible, the run carries on with no offer.
- Each modifier changes its rule as in the table above, and `extraPlot` adds an empty plot.

**Replay (`verification.test.ts`)**

- Scripted Survival runs that pick upgrades replay equal.
- A log that leaves an offer unanswered and has later entries, or a later `finalTick`, fails with `offer-pending`.

## Open items

- [ ] Tune the numbers and the `ORDERS_PER_UPGRADE` gap after playtesting.
- [ ] Buy upgrades with coins as well as picking them (design doc).
- [ ] Offers use the main `rngState`, so they shift which orders come next. Consider a separate RNG stream if the Daily Challenge needs order sequences that don't depend on when offers happen.
- [ ] Pre-run boosts (meta currency, Daily Challenge) as starting entries in `upgrades`, passed through `createGame`.
