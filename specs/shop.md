# shop.ts

The shop (Day 8): the second upgrade system, where the player spends in-run coins on the exact upgrades, power-ups and lives they want, sells owned upgrades back, and pays to restock. It opens on a schedule set per mode in config, shows a few items drawn from its own random stream, and closes when the player is done.

What the shop does lives in **`src/data/shop.json`**. What is in stock right now lives in **`GameState.shop`**. Upgrades still come from [upgrades.md](upgrades.md) and power-ups from [powerups.md](powerups.md); the shop only decides which are on sale and what they cost.

## Concepts

- **Visit.** One opening of the shop, from the step that opens it to `closeShop` (or, in a shop that doesn't pause, its closing tick). `GameState.shopVisits` counts them.
- **Pausing shop.** While it is open, time stops exactly as it does for an upgrade offer: `step` returns the same state and only shop actions are accepted. A **running shop** stays open for a set number of seconds while the clock keeps going, and every other action still works. Which one a mode gets is config (`pauses`).
- **Stock.** The items on sale this visit, in slots: some upgrade cards, some power-ups, and in Survival one life. A bought item stays in its slot, marked `sold`, so the slots don't move under the player's cursor.
- **Shop pool.** The upgrades the shop can stock: those in the mode's pool (`survival` or `timed`) **or** in `shop`, and eligible as for a free pick (see `eligibleUpgrades` in [upgrades.md](upgrades.md)).
- **Restock.** Paying to redraw the whole stock. Each restock in a visit costs more than the last; the count goes back to 0 on the next visit.
- **Refund.** What selling an owned copy pays back: a share of its tier's price.

## `src/data/shop.json`

```json
{
    "survival": { "open": { "kind": "orders", "every": 10, "offset": 8 }, "pauses": true },
    "timed": { "open": { "kind": "seconds", "at": [115, 200] }, "pauses": true, "openSeconds": 15 },
    "stock": { "upgrades": 3, "powerUps": 1, "life": true },
    "tierPrice": { "common": 10, "uncommon": 18, "rare": 30, "epic": 50, "legendary": 80 },
    "priceRise": { "perCopyPct": 25, "perVisitPct": 10 },
    "restock": { "base": 5, "growth": 1.5 },
    "sellRefundPct": 50,
    "interestMaxCoins": 15
}
```

| Field                   | Meaning                                                                                                                     |
| ----------------------- | --------------------------------------------------------------------------------------------------------------------------- |
| `survival`, `timed`     | When the shop opens in that mode, and how (see below). Puzzle has no entry and no shop                                      |
| `open.kind: "orders"`   | Opens after `offset`, `offset + every`, `offset + 2 × every`, … filled orders. `every` whole number `>= 1`, `offset` `>= 0` |
| `open.kind: "seconds"`  | Opens at each second in `at`, once each. `at` is a list of whole numbers `>= 1`, strictly rising                            |
| `open.kind: "never"`    | The mode has no shop (Merchant call can still open one later; see Open items)                                               |
| `pauses`                | `true`: a pausing shop, closed only by `closeShop`. `false`: a running shop                                                 |
| `openSeconds`           | How long a running shop stays open. Required exactly when `pauses` is `false`. Whole number `>= 1`                          |
| `stock.upgrades`        | Upgrade cards per stock. Whole number `>= 0`                                                                                |
| `stock.powerUps`        | Power-up slots per stock. Whole number `>= 0`                                                                               |
| `stock.life`            | Whether Survival stock has a life slot. Timed never does                                                                    |
| `tierPrice`             | Base price of an upgrade card at each tier. One entry per tier, whole numbers `>= 1`, never lower than the tier before      |
| `priceRise.perCopyPct`  | % added to an upgrade's price for each copy of it already owned. Whole number `>= 0`. 0 turns the per-copy rise off         |
| `priceRise.perVisitPct` | % added to every upgrade and power-up price for each earlier visit. Whole number `>= 0`. 0 turns the run-progress rise off  |
| `restock.base`          | Price of the first paid restock of a visit. Whole number `>= 1`                                                             |
| `restock.growth`        | Each later restock in the same visit costs this many times the one before. Number `>= 1`                                    |
| `sellRefundPct`         | A sold copy pays this % of its tier's `tierPrice`, rounded down. Whole number from 0 to 100                                 |
| `interestMaxCoins`      | The most coins Interest can add on one visit. Whole number `>= 0`                                                           |

The build plan asks for the rise rule to be "run progress, per copy, or both": setting one of the two `priceRise` numbers to 0 gives either rule alone.

The shipped numbers are placeholders until tuning (Day 11). Why these defaults:

- **Survival opens at 8, 18, 28, … filled orders.** Free picks come every `ORDERS_PER_UPGRADE` filled orders, which the code sets to 5 (so 5, 10, 15, …), and 8, 18, 28 never land on one of those. They can still both be due on one step when several orders fill at once (Finish all); see `step` below.
- **Timed opens at 115 s and 200 s**, in the gaps between the rush waves at 75, 160 and 245 s (each with a 5 s warning), as a pausing break. Setting `pauses: false` tries the other design option: a shop that stays open for `openSeconds` while the clock runs.
- `tierPrice` × `sellRefundPct` gives 5, 9, 15, 25, 40, close to the `sellPrice` values `upgrades.json` ships today, which this replaces (see [Changes to other specs](#changes-to-other-specs)).

## Types (in [types.md](types.md))

```ts
type ShopOpenRule =
    | { kind: "orders"; every: number; offset: number }
    | { kind: "seconds"; at: number[] } // seconds
    | { kind: "never" }
type ShopModeConfig = { open: ShopOpenRule; pauses: boolean; openTicks: number | null }
type ShopConfig = {
    modes: Record<"survival" | "timed", ShopModeConfig>
    stock: { upgrades: number; powerUps: number; life: boolean }
    tierPrice: Record<Tier, number>
    priceRise: { perCopyPct: number; perVisitPct: number }
    restock: { base: number; growth: number }
    sellRefundPct: number
    interestMaxCoins: number
}
type ShopItem =
    | { kind: "upgrade"; id: string; tier: Tier; sold: boolean }
    | { kind: "powerUp"; id: string; sold: boolean }
    | { kind: "life"; sold: boolean }
type ShopState = {
    stock: ShopItem[] // upgrade cards first, then power-ups, then the life slot
    restocks: number // restocks bought this visit, free ones included
    closesAt: number | null // tick a running shop closes on; null for a pausing shop
}
```

`openSeconds` becomes `openTicks` (`null` for a pausing shop). `ShopState.closesAt === null` is how every rule tells a pausing shop from a running one, so a rule never has to look at the config to know whether time is stopped.

`GameState` gets:

| Field        | Starting value        | Meaning                                       |
| ------------ | --------------------- | --------------------------------------------- |
| `shop`       | `null`                | The open shop, or `null` while it is closed   |
| `shopVisits` | `0`                   | Visits so far this run, counting the open one |
| `rng.shop`   | `seedStream(seed, 8)` | The shop's own stream (`SHOP_STREAM_SALT`)    |

`Action` gets `buyItem { slot, target? }`, `sellUpgrade { index }`, `restockShop` and `closeShop`.

## Exports

### `validateShop(raw: unknown): ShopConfig`

Checks a parsed JSON value and returns it typed. Throws an `Error` naming the bad field when a field breaks the ranges in the table above, `open.kind` is not one of its three values, `openSeconds` is missing with `pauses: false` or present with `pauses: true`, or `tierPrice` is missing a tier, has an extra one, or falls from one tier to the next. A bad config is a setup mistake, so this throws.

### `SHOP: ShopConfig`

`shop.json` passed through `validateShop` once, when the module loads. Every function below takes an optional last `config: ShopConfig = SHOP`.

### `isShopDue(state, config?): boolean`

True when the mode's open rule says the next visit is due:

- `orders`: `ordersCompleted >= offset + shopVisits × every`.
- `seconds`: `shopVisits < at.length` and `tick >= at[shopVisits] × TICKS_PER_SECOND`.
- `never`, or Puzzle: false.

Only one visit opens per due check, so a run that skips past two thresholds at once gets one visit now and the next on the following step.

### `shopPool(state, crops, config?): string[]`

The shop pool: ids eligible from the mode's pool or from `shop`, sorted, with no repeats. Same eligibility as a free pick, plus Promotion's own rule (see [Promotion](#promotion)).

### `rollStock(state, crops, config?): [ShopItem[], RNGState]`

Draws a new stock from `state.rng.shop` and returns it with the new state of that stream.

1. **Upgrade cards:** up to `stock.upgrades` cards, drawn exactly as `rollOffer` draws an offer (two draws per card, a tier first and then an id within it), but from `shopPool` and with the plain tier weights (Lucky stars doesn't apply; see below). No id appears twice.
2. **Power-ups:** if `allowPowerUps`, up to `stock.powerUps` different ids from the run's `dropTable`, leaving out any power-up whose effect is `grantCoins` (selling coins for coins). Each is one weighted draw over the drop weights of the ids not yet drawn.
3. **Life:** in Survival with `stock.life`, one `{ kind: "life" }` slot at the end. No draw.

Every item starts with `sold: false`. Draws only from `rng.shop`, so opening, restocking or never visiting the shop never changes which orders, offers, drops or events come next.

### `openShop(state, crops, config?): GameState`

Starts a visit: `shopVisits + 1`, Interest is paid (below), then `shop = { stock, restocks: 0, closesAt }` with a fresh `rollStock`, and `closesAt` is `null` for a pausing shop or `tick + openTicks` for a running one. With an empty stock (nothing eligible, power-ups off, Timed) the visit still counts and the shop still opens, since the player may want to sell.

`step` calls it on schedule; Merchant call (Day 9) will call it too.

**Interest.** Before the stock is drawn, `coins += min(floor(coins × interestPct / 100), interestMaxCoins)`, where `interestPct` comes from `modifiersFor(upgrades)`. So coins held into a visit grow, and the first visit pays interest on what was saved before it.

### `itemPrice(state, slot, config?): number`

What `stock[slot]` costs now. Read live, so a Discount card bought earlier in the same visit lowers the rest of the stock at once.

- **Upgrade card:** `max(1, round(tierPrice[tier] × (100 + perCopyPct × copies) × (100 + perVisitPct × (shopVisits − 1)) × shopPricePct / 1000000))`, where `copies` is `copyCount(upgrades, id)` and `shopPricePct` is the Discount card stat (base 100). One rounding, at the end.
- **Power-up:** `max(1, round(shopPrice × (100 + perVisitPct × (shopVisits − 1)) × shopPricePct / 1000000))`, with `shopPrice` from `powerups.json`. Copies don't raise it.
- **Life:** `lifePriceFor(state)`, the same rising price as `buyLife`, so buying a life in either place raises both. Discount card doesn't apply; Life discount does.

### `restockPrice(state, config?): number`

The next restock's price in this visit: 0 while `restocks < freeRestocks` (Free restock), else `round(base × growth ^ (restocks − freeRestocks))`. With the defaults and no Free restock: 5, 8, 11, 17, …

### `sellRefund(copy: OwnedUpgrade, config?): number`

`floor(tierPrice[copy.tier] × sellRefundPct / 100)`. Not changed by Discount card, copies or visits, so a copy sells for the same at any point in the run.

### `canBuy(state, slot, target, crops, config?)`, `canSell(state, index)`, `canRestock(state, config?)`

`true` when the matching action would succeed. The shop screen uses them, so the screen and the rules can't disagree.

### Helpers for the screen and `main.ts`

- `isShopPaused(state)`: a shop is open and `closesAt === null`. `step`, `applyAction`, the replay check and every "can I use this now" function (`canBuyLife`, `canUseMiracleGrow`, `canUsePowerUp`) read it.
- `stockItem(state, slot)`: the item in a slot, or `null` for a closed shop or a bad slot.
- `needsTarget(state, slot)`: true for a targeted upgrade or Promotion.
- `buyTargets(state, slot, crops)`: where a buy could go: `[null]` for an untargeted upgrade, `validTargets` for a targeted one, `promotionTargets` for Promotion, `[]` when the card is no longer in the shop pool.
- `canBuyAny(state, slot, crops)`: `canBuy` with some target; the Buy button uses it.
- `interestFor(state, config?)`: the coins Interest adds on the next opening.

### `sellBlock(state, index, config?): null | "closed" | "notSellable" | "required" | "storage"`

Why `sellUpgrade { index }` would be refused, or `null` when it would succeed (`canSell` is `sellBlock(…) === null`). `"required"` and `"storage"` let the Sell button say why it is off.

### `promotionTargets(upgrades, config?): number[]` (in `upgrades.ts`)

Indexes into `upgrades` of the copies Promotion could raise, ascending (see [Promotion](#promotion)). It lives in `upgrades.ts` because `eligibleUpgrades` needs it.

## In `main.ts` (see [main.md](main.md))

### Allowed actions

On top of the rules in [main.md](main.md):

- With an upgrade offer open, shop actions are refused like everything else except `chooseUpgrade` and `rerollOffer`. (A running shop can be open under an offer; it waits.)
- With a pausing shop open (`shop.closesAt === null`), only `buyItem`, `sellUpgrade`, `restockShop` and `closeShop` are accepted.
- With a running shop open, every action works, plus the shop actions.
- With the shop closed, every shop action returns `null`.

### `step` (changed)

- **While a pausing shop is open,** `step` returns `state` itself, as for an open offer.
- **New step 1a, closing a running shop:** right after the tick moves, if `shop.closesAt !== null` and `tick >= closesAt`, `shop` becomes `null`.
- **New step 4a, Auto-harvester:** after growth, each plot (ascending) that is ready and has `autoHarvest > 0` at it (`modifiersAt(upgrades, { plot, cropId: null })`) is harvested exactly as the `harvest` action would harvest it, with its bumper and drop rolls. A plot is skipped (left ready) when Crows block it or storage is full. `harvest`'s body moves into a shared `harvestPlot(state, plot, crops)` so the two can't drift apart.
- **End of run:** when the run ends on a step, `shop` becomes `null`.
- **New step 10, the shop:** after step 9 (the upgrade offer), if no offer is open, the shop is closed and `isShopDue`, the step ends with `openShop`. So when an offer and a visit are due on the same step, the offer comes first and the shop opens on the step after the pick.

### `buyItem { slot, target? }`

Refused unless the shop is open, `slot` is a whole number pointing at an unsold item, `coins >= itemPrice(state, slot)`, and the item's own rule passes:

- **Lasting upgrade:** the id is still in `shopPool` (an earlier buy may have capped it), and `target` follows the same rules as `chooseUpgrade`: left out for an untargeted upgrade, one of `validTargets` for a targeted one. Adds `{ id, tier, target }` with `withUpgrade`, so extra plots and lives arrive as for a free pick.
- **Promotion:** `target` is in `promotionTargets`. Raises that copy one tier (below).
- **Power-up:** `allowPowerUps`, and `powerUps.length < powerUpSlots`. Appends the id to `powerUps`.
- **Life:** Survival, and `lives < maxLivesFor(state)`. `lives + 1`, `livesBought + 1`.

Then it takes the price and marks the slot `sold`.

### `sellUpgrade { index }`

Refused unless the shop is open, `index` is a whole number pointing at an owned copy, and:

- the copy's upgrade is `sellable`;
- it is not the last copy of an upgrade that another owned copy `requires` (Bigger bumper keeps Bumper harvest);
- removing it keeps `storageUsed <= storageCap` (selling Bigger barn while the barn is fuller than the smaller cap is refused, so storage never passes its cap).

Removes `upgrades[index]` (a new array; the copies after it move up) and adds `sellRefund(copy)`. Selling frees a copy toward `maxCopies` and, for a targeted upgrade, its target. Nothing already made changes: crops already growing keep their `readyAt`, open orders keep their time.

### `restockShop`

Refused unless the shop is open and `coins >= restockPrice(state)`. Takes the price, adds 1 to `restocks`, and replaces the whole stock with a fresh `rollStock` (the life slot comes back unsold; its price has still gone up if a life was bought).

### `closeShop`

Refused unless the shop is open. Sets `shop` to `null`. Time resumes on the next `step`.

Only `restockShop`, `openShop` and Auto-harvester draw random numbers, and none of these actions moves the tick, so a run stays reproducible from `seed + config + log`.

## Shop-only upgrades (in [upgrades.md](upgrades.md))

All numbers are placeholders. All are in the `shop` pool only.

| id              | Name           | Tier   | maxCopies | Effects (common → legendary)            | Target                | Sellable |
| --------------- | -------------- | ------ | --------- | --------------------------------------- | --------------------- | -------- |
| `extraPlot`     | Extra plot     | rare   | 2         | `extraPlots` +1 (already shipped)       | –                     | no       |
| `richSoil`      | Rich soil      | rare   | 3         | `yieldBonus` +1                         | plot, `oncePerTarget` | no       |
| `quickSoil`     | Quick soil     | rare   | 3         | `quickSoilSeconds` +5                   | plot, `oncePerTarget` | no       |
| `autoHarvester` | Auto-harvester | epic   | 2         | `autoHarvest` +1                        | plot, `oncePerTarget` | no       |
| `interest`      | Interest       | tiered | 3         | `interestPct` +2, +3, +5, +8, +12       | –                     | yes      |
| `discountCard`  | Discount card  | tiered | 3         | `shopPricePct` −3, −5, −8, −12, −20     | –                     | yes      |
| `freeRestock`   | Free restock   | rare   | 1         | `freeRestocks` +1                       | –                     | yes      |
| `luckyStars`    | Lucky stars    | tiered | 3         | `tierLuck` +5, +10, +15, +20, +30       | –                     | yes      |
| `promotion`     | Promotion      | epic   | –         | instant: raises one owned copy one tier | an owned copy         | –        |

The plot upgrades aren't sellable, following the open item in [upgrades.md](upgrades.md) (selling plot upgrades needs a tradeoff first).

New stats:

| Stat               | base | min | max | Read by                                          | Effect                                                                                         |
| ------------------ | ---- | --- | --- | ------------------------------------------------ | ---------------------------------------------------------------------------------------------- |
| `quickSoilSeconds` | 0    | 0   | 10  | `plant`, Birds, Good neighbors (`plantCutTicks`) | `readyAt = now + max(1, scalePct(growTicks, growthPct) − quickSoilSeconds × TICKS_PER_SECOND)` |
| `autoHarvest`      | 0    | 0   | 1   | `step` 4a                                        | 1: the plot harvests itself when ready                                                         |
| `interestPct`      | 0    | 0   | 25  | `openShop`                                       | % of held coins added on each visit, up to `interestMaxCoins`                                  |
| `shopPricePct`     | 100  | 50  | 100 | `itemPrice`                                      | % of the usual upgrade and power-up price                                                      |
| `freeRestocks`     | 0    | 0   | 1   | `restockPrice`                                   | Restocks per visit that cost nothing                                                           |
| `tierLuck`         | 0    | 0   | 60  | `rollOffer`                                      | Shifts free-pick tier weights toward higher tiers (below)                                      |

`quickSoilSeconds` and `autoHarvest` join the stats that can be read per plot (`growthPct`, `yieldBonus`, `bumperChance`, `shielded`), so `validateUpgrades` allows them on plot-targeted upgrades. `plantCutTicks(state, plot, cropId)` sits next to `plantGrowthPct` and is used at the same three places, and `plant` in [plot.md](plot.md) takes the cut as a new argument (default 0).

### Lucky stars

`rollOffer` uses `floor(weight × (100 + tierLuck × i) / 100)` for the tier at index `i` in `TIERS` (common is 0, legendary is 4), so common never changes and each tier above it gains more. At the cap of 60 the shipped weights 40 : 30 : 15 : 10 : 5 become 40 : 48 : 33 : 28 : 17. It applies to free picks and their rerolls, as the design doc says, and not to shop stock.

### Promotion

The first `instant` upgrade: buying it changes an owned copy and is never stored, so it has no copies, no `maxCopies` and nothing to sell.

- In `upgrades.json` it has `"kind": "instant"`, `"instant": "promote"`, `pools: ["shop"]`, a `tier`, and no `effects`, `maxCopies`, `sellable` or `target`. Every other upgrade gets `kind: "lasting"`. `UpgradeDef` gains `kind` and `instant: "promote" | null`; an instant def is typed with `effects: []`, `maxCopies: 0` and `sellable: false`, and `eligibleUpgrades` skips its copy-limit check.
- **Targets:** `promotionTargets` lists every owned copy that is tiered, below `legendary`, and has at least one effect that would still change its stat where the copy applies (the same "can still change" test as `validTargets`, checked at the copy's own target) and whose amount grows at the next tier.
- **Eligible** for the shop pool only while `promotionTargets` is not empty.
- **Buying** replaces `upgrades[target]` with the same copy one tier up (a new array, same position).
- **Stat caps still hold:** totals are clamped as always, so a promotion near a cap adds only what is left under it.

## Rules

- No Phaser or browser imports. Pure: never changes its inputs, never reads the clock.
- Draws only from `rng.shop`, and only through `rollStock`.
- `GameState.shop` is plain JSON: ids, tiers, flags and ticks. Prices are never stored; they are worked out from the state when needed.
- No rule reads an upgrade id. What the shop-only upgrades do is their stats.

## Tests (`shop.test.ts`)

**Config**

- Accepts the shipped `shop.json`; throws for each bad field, one test per case.
- Turns `openSeconds` into `openTicks`, and `null` for a pausing shop.

**Schedule**

- Survival: no visit before `offset` filled orders; a visit on the step after the `offset`th; the next at `offset + every`.
- Timed: a visit on the tick of each second in `at`, once each, and none after the last.
- With an offer and a visit due on the same step, the offer opens first and the shop opens on the step after `chooseUpgrade`.
- A pausing shop: `step` returns the same state and every non-shop action returns `null`.
- A running shop: the clock and every other action keep working; it closes on `closesAt`; an offer made while it is open stops its closing time, too.
- Puzzle and `kind: "never"` never open a shop. The run ending closes the shop.

**Stock**

- `rollStock` gives `stock.upgrades` different upgrade ids from the shop pool, then power-ups, then the life slot in Survival and not in Timed.
- Shop-only upgrades are stocked; upgrades from the other mode's pool are not.
- Capped and maxed-out upgrades are never stocked, the same as for free picks.
- No power-ups with power-ups off; Coin bag is never stocked.
- Draws only from `rng.shop`: two runs on one seed, one that restocks and one that doesn't, get the same orders, offers and drops.

**Prices**

- An upgrade's price follows its tier's `tierPrice`, rises by `perCopyPct` per owned copy and `perVisitPct` per earlier visit, with each rise off at 0; Discount card lowers it at once, in the same visit.
- A power-up's price rises per visit only; a life costs `lifePriceFor`, and buying one in the shop raises `buyLife`'s price.
- Restocks cost 5, 8, 11, 17 with the defaults, the count resets on the next visit, and Free restock makes the first one free.
- `sellRefund` is `floor(tierPrice × sellRefundPct / 100)`.

**Actions**

- `buyItem` takes the price, marks the slot sold, and adds the upgrade (with a target where needed), power-up or life.
- `buyItem` is refused: shop closed, bad or sold slot, too few coins, an upgrade capped by an earlier buy, a bad target, full power-up slots, full lives.
- `sellUpgrade` removes the copy, pays its refund, and frees a copy and a target.
- `sellUpgrade` is refused: shop closed, bad index, not sellable, the last copy another copy `requires`, storage that wouldn't fit the smaller barn.
- `restockShop` replaces the stock and is refused with too few coins; `closeShop` closes it and time moves again.
- Interest adds its % of held coins on opening, up to `interestMaxCoins`.

**Shop-only upgrades**

- Rich soil adds 1 crop to harvests on its plot only.
- Quick soil takes its seconds off crops planted on its plot only, and never goes below 1 tick.
- Auto-harvester harvests its plot on the step it turns ready, rolls bumper and drops like a manual harvest, and waits while storage is full or Crows are on the plot.
- Lucky stars: with `tierLuck` 0 the weights are unchanged; at 60 they are 40 : 48 : 33 : 28 : 17; shop stock is unchanged by it.
- Promotion raises an owned copy one tier in place and respects the stat cap (a copy one step under the cap only adds what is left); it never targets a legendary, non-tiered or capped copy, and isn't stocked when nothing can be promoted.

**Replay (`verification.test.ts`)**

- Scripted Survival and Timed runs that buy, sell, restock and close replay equal (4 seeds each), and their logs have each of the four actions.
- A log with an entry, or a `finalTick`, after a pausing shop that was never closed fails with `shop-pending`.

## Changes to other specs

All done with the shop:

- [types.md](types.md): `ShopConfig`, `ShopItem`, `ShopState`, the new `GameState` fields and actions, `UpgradeDef.kind` and `instant`, and the six new `Modifiers` stats.
- [main.md](main.md): the allowed-action rules, `step` 1a, 4a and 10, `harvestPlot`, and the four actions.
- [upgrades.md](upgrades.md): the shop-only upgrades and stats, `kind: "instant"`, Lucky stars in `rollOffer`, the two new per-plot stats. `tiers.sellPrice` is removed from `upgrades.json`: the refund is `sellRefund` here.
- [powerups.md](powerups.md): a required `shopPrice` (whole number `>= 1`) on every power-up. Placeholders: Ready one 8, Growth boost 6, Order freeze 10, Coin bag 1 (never stocked), Ready all 20, Finish one 15, Finish all 30, Gold rush 12, Clean slate 5, Good omen 10.
- [plot.md](plot.md): `plant` takes a cut in ticks for Quick soil.
- [mulberry.md](mulberry.md): stream salt 8 for `rng.shop`.
- [verification.md](verification.md): `shop-pending`, the same as `offer-pending` but for a pausing shop.
- [economy.md](economy.md): coins also go to the shop; tick "Shop restock price resets" and decide the Compost item.
- [ui.md](ui.md): the shop screen (see [Shop (ShopView)](ui.md#shop-shopview)).

## Open items

- [ ] When the shop opens (design open question): shipped as Survival every 10 orders from the 8th, and Timed as a pausing break at 115 s and 200 s, between rush waves. Try the running Timed shop (`pauses: false`) in playtesting before deciding.
- [ ] How prices rise (design open question): both rules on for now (25% per copy, 10% per visit). Tune, or turn one off, on Day 11.
- [ ] Compost stays unsellable for now, so held fertilizer never becomes useless. Should the shop buy it back (and what happens to held fertilizer)?
- [ ] Lucky stars' rule (`weight × (100 + tierLuck × tier index) / 100`) is a proposal. Should it apply to shop stock too?
- [ ] `buyLife` stays usable outside the shop, sharing its rising price with the life slot. Should lives in Survival only be bought in the shop?
- [ ] Should a restock keep sold slots sold, or keep the life slot out of restocks?
- [ ] Should refunds follow what was paid (free picks paid nothing) instead of the tier's price?
- [ ] Should Auto-harvester's harvests roll power-up drops? They do for now, the same as a manual harvest.
- [ ] Merchant call (Day 9) opens a visit through `openShop`. Does that visit count toward `shopVisits`, and does it move the next scheduled one?
- [ ] Timed orders pay the same coins as Survival. With a shop in Timed, revisit whether Timed needs its own rate (see [economy.md](economy.md)).
- [x] A debug cheat to open the shop now (`debugOpenShop`, see [debug.md](debug.md)).
- [ ] `game_constants.md` says `ORDERS_PER_UPGRADE` is 10, but the code uses 5. The shop's offset assumes 5; fix whichever is wrong.
- [ ] A running shop (`pauses: false`) draws the same panel as a pausing one, just without the shade, so it covers the board. Lay it out so the board stays playable before trying it in playtesting.
