# shop.ts

The shop: the second upgrade system, where the player spends in-run coins on the exact upgrades, power-ups and lives they want, and sells crops and owned upgrades back. The player opens it whenever they like, and the clock stops while it is open. The stock only changes when the player restocks; filling orders earns free restocks, and a restock with none banked costs coins.

> **Status.** Built (Day 8b, see the Design Doc's Shop and Screen layout). The Day 8 schedule (Survival every 10 filled orders from the 8th, Timed at 115 s and 200 s), the running Timed shop, restocks that got dearer within a visit and `shopVisits` are gone. Interest runs on its own clock (`withInterest`, step 4b), which stops with `step` while the shop is open.

What the shop does lives in **`src/data/shop.json`**. What is in stock lives in **`GameState.shop`**. Upgrades still come from [upgrades.md](upgrades.md) and power-ups from [powerups.md](powerups.md); the shop only decides which are on sale and what they cost.

## Concepts

- **Open shop.** The player opens the shop with `openShop` and closes it with `closeShop`. While it is open, time stops exactly as it does for an upgrade offer: `step` returns the same state, and only shop and storage actions are accepted. The shop is the same in both modes. Puzzle has no shop.
- **Stock.** The items on sale, in slots: some upgrade cards, some power-ups, and in Survival one life. A bought item stays in its slot, marked `sold`, so the slots don't move under the player's cursor. The stock never changes by itself: only a restock replaces it. It is first drawn the first time the shop opens.
- **Maxed.** A stocked upgrade that can no longer be bought (its stat is capped, or it reached its copy limit, through a free pick or another buy). It stays in its slot, and the screen marks it.
- **Shop pool.** The upgrades the shop can stock: those in the mode's pool (`survival` or `timed`) **or** in `shop`, and eligible as for a free pick (see `eligibleUpgrades` in [upgrades.md](upgrades.md)).
- **Restock.** Redraws every slot (sold ones come back unsold, the life slot too). It uses a banked free restock if there is one, otherwise it costs `restock.price` coins.
- **Free restocks.** Earned by filling orders: every `ordersPerFreeRestock` filled orders add `restocksPerCycle` free restocks to the **bank**, which holds at most `bankCap`. While the bank is full, filled orders don't count toward the next one, so free restocks can't be saved up past the cap.
- **Interest.** Every `interest.everySeconds` of play, held coins grow by `interestPct`, up to `interest.maxCoins` each time. Play time stops while the shop is open, so waiting in the shop earns nothing.
- **Refund.** What selling an owned copy pays back: a share of its tier's price.

## `src/data/shop.json`

```json
{
    "survival": { "ordersPerFreeRestock": 7 },
    "timed": { "ordersPerFreeRestock": 7 },
    "stock": { "upgrades": 3, "powerUps": 1, "life": true },
    "tierPrice": { "common": 10, "uncommon": 18, "rare": 30, "epic": 50, "legendary": 80 },
    "priceRise": { "perCopyPct": 25, "perProgressPct": 10, "progressOrders": 10 },
    "restock": { "price": 10, "bankCap": 2 },
    "sellRefundPct": 50,
    "interest": { "everySeconds": 30, "maxCoins": 15 }
}
```

| Field                      | Meaning                                                                                                                         |
| -------------------------- | ------------------------------------------------------------------------------------------------------------------------------- |
| `survival`, `timed`        | Per-mode settings. Puzzle has no entry and no shop                                                                              |
| `ordersPerFreeRestock`     | Filled orders that earn the next free restock (before Fast restock). Whole number `>= 1`                                        |
| `stock.upgrades`           | Upgrade cards per stock. Whole number `>= 0`                                                                                    |
| `stock.powerUps`           | Power-up slots per stock. Whole number `>= 0`                                                                                   |
| `stock.life`               | Whether Survival stock has a life slot. Timed never does                                                                        |
| `tierPrice`                | Base price of an upgrade card at each tier. One entry per tier, whole numbers `>= 1`, never lower than the tier before          |
| `priceRise.perCopyPct`     | % added to an upgrade's price for each copy of it already owned. Whole number `>= 0`. 0 turns the per-copy rise off             |
| `priceRise.perProgressPct` | % added to every upgrade and power-up price for each `progressOrders` filled orders. Whole number `>= 0`. 0 turns this rise off |
| `priceRise.progressOrders` | Filled orders per step of the progress rise. Whole number `>= 1`                                                                |
| `restock.price`            | Coins a restock costs with no free restock banked. Fixed for now. Whole number `>= 1`                                           |
| `restock.bankCap`          | Most free restocks that can be banked (before Rain check). Whole number `>= 1`                                                  |
| `sellRefundPct`            | A sold copy pays this % of its tier's `tierPrice`, rounded down. Whole number from 0 to 100                                     |
| `interest.everySeconds`    | Seconds of play between Interest payments. Whole number `>= 1`                                                                  |
| `interest.maxCoins`        | The most coins one Interest payment can add. Whole number `>= 0`                                                                |

The numbers are placeholders until tuning. Run progress is measured in filled orders, not time, so no price moves while the shop is open.

## Types (in [types.md](types.md))

```ts
type ShopModeConfig = { ordersPerFreeRestock: number }
type ShopConfig = {
    modes: Record<"survival" | "timed", ShopModeConfig>
    stock: { upgrades: number; powerUps: number; life: boolean }
    tierPrice: Record<Tier, number>
    priceRise: { perCopyPct: number; perProgressPct: number; progressOrders: number }
    restock: { price: number; bankCap: number }
    sellRefundPct: number
    interest: { everyTicks: number; maxCoins: number }
}
type ShopItem =
    | { kind: "upgrade"; id: string; tier: Tier; sold: boolean }
    | { kind: "powerUp"; id: string; sold: boolean }
    | { kind: "life"; sold: boolean }
type ShopState = {
    open: boolean
    stock: ShopItem[] | null // null until the shop is first opened
    freeRestocks: number // banked free restocks
    restockProgress: number // filled orders counted toward the next free restock
}
```

`interest.everySeconds` becomes `everyTicks`.

`GameState` changes:

| Field            | Starting value                                                      | Meaning                                       |
| ---------------- | ------------------------------------------------------------------- | --------------------------------------------- |
| `shop`           | `{ open: false, stock: null, freeRestocks: 0, restockProgress: 0 }` | The shop; always present (unused in Puzzle)   |
| `nextInterestAt` | `interest.everyTicks`                                               | The tick the next Interest payment is made on |
| `rng.shop`       | `seedStream(seed, 8)`                                               | The shop's own stream (`SHOP_STREAM_SALT`)    |

`shopVisits` (Day 8) is removed. `Action` gets `openShop`, and keeps `buyItem { slot, target? }`, `sellUpgrade { index }`, `restockShop` and `closeShop`.

## Exports

### `validateShop(raw: unknown): ShopConfig`

Checks a parsed JSON value and returns it typed. Throws an `Error` naming the bad field when a field breaks the ranges in the table above, a mode is missing, or `tierPrice` is missing a tier, has an extra one, or falls from one tier to the next. A bad config is a setup mistake, so this throws.

### `SHOP: ShopConfig`

`shop.json` passed through `validateShop` once, when the module loads. Every function below takes an optional last `config: ShopConfig = SHOP`.

### `isShopOpen(state): boolean`

`state.shop.open`. `step`, `applyAction`, the replay check and every "can I use this now" function (`canBuyLife`, `canUseMiracleGrow`, `canUsePowerUp`) read it.

### `shopPool(state, crops): string[]`

The shop pool: ids eligible from the mode's pool or from `shop`, sorted, with no repeats. Same eligibility as a free pick, plus Promotion's own rule (see [Promotion](#promotion)).

### `rollStock(state, crops, config?): [ShopItem[], RNGState]`

Draws a new stock from `state.rng.shop` and returns it with the new state of that stream.

1. **Upgrade cards:** up to `stock.upgrades` cards, drawn as `rollOffer` draws an offer (`rollCards`: two draws per card, a tier first and then an id within it), but from `shopPool` and with the plain tier weights (Lucky stars doesn't apply). No id appears twice.
2. **Power-ups:** if `allowPowerUps`, up to `stock.powerUps` different ids from the run's `dropTable`, leaving out any power-up whose effect is `grantCoins` (selling coins for coins). Each is one weighted draw over the drop weights of the ids not yet drawn.
3. **Life:** in Survival with `stock.life`, one `{ kind: "life" }` slot at the end. No draw.

Every item starts with `sold: false`. Draws only from `rng.shop`, so opening, restocking or never using the shop never changes which orders, offers, drops or events come next.

### Free restock helpers

- `ordersPerFreeRestock(state, config?)`: `max(1, modes[mode].ordersPerFreeRestock − restockOrdersCut)` (Fast restock).
- `restocksPerCycle(state)`: `1 + freeRestockBonus` (Free restock).
- `restockBankCap(state, config?)`: `restock.bankCap + restockBankBonus` (Rain check).
- `isBankFull(state, config?)`: `shop.freeRestocks >= restockBankCap(state)`.
- `withFilledOrder(state, config?): GameState`: counts one filled order toward the next free restock. With the bank full, nothing changes. Otherwise `restockProgress + 1`; when it reaches `ordersPerFreeRestock`, it goes back to 0 and `freeRestocks` becomes `min(bankCap, freeRestocks + restocksPerCycle)`. Puzzle: unchanged.
- `ordersToFreeRestock(state, config?)`: filled orders still needed for the next free restock, or `null` while the bank is full. The screen shows it.

### `itemPrice(state, slot, config?): number | null`

What `stock[slot]` costs now, or `null` for a bad slot. Worked out live, so a Discount card bought a moment ago lowers the rest of the stock at once. With `progress = 100 + perProgressPct × floor(ordersCompleted / progressOrders)`:

- **Upgrade card:** `max(1, round(tierPrice[tier] × (100 + perCopyPct × copies) × progress × shopPricePct / 1000000))`, where `copies` is `copyCount(upgrades, id)` and `shopPricePct` is the Discount card stat (base 100). One rounding, at the end.
- **Power-up:** `max(1, round(shopPrice × progress × shopPricePct / 10000))`, with `shopPrice` from `powerups.json`. Copies don't raise it.
- **Life:** `lifePriceFor(state)`, the same rising price as `buyLife`. Discount card doesn't apply; Life discount does.

### `restockPrice(state, config?): number`

`0` while a free restock is banked, else `restock.price`.

### `sellRefund(copy: OwnedUpgrade, config?): number`

`floor(tierPrice[copy.tier] × sellRefundPct / 100)`. Not changed by Discount card, copies or progress.

### `interestFor(state, config?): number`

`min(floor(coins × interestPct / 100), interest.maxCoins)`: what the next Interest payment adds.

### `withInterest(state, config?): GameState`

Interest's clock, run by `step` (step 4b). With `tick >= nextInterestAt`, adds `interestFor(state)` to `coins` and moves `nextInterestAt` on by `interest.everyTicks`; otherwise unchanged. `step` doesn't run while the shop is open, so the clock stops then.

### `canOpenShop`, `canBuy`, `canSell`, `canRestock`, and helpers for the screen

`true` when the matching action would succeed. The shop screen uses them, so the screen and the rules can't disagree. Also:

- `stockItem(state, slot)`: the item in a slot, or `null` for an empty stock or a bad slot.
- `needsTarget(state, slot)`: true for a targeted upgrade or Promotion.
- `buyTargets(state, slot, crops)`: `[null]` for an untargeted upgrade, `validTargets` for a targeted one, `promotionTargets` for Promotion, `[]` when the card is no longer in the shop pool.
- `isMaxed(state, slot, crops)`: an unsold upgrade card whose `buyTargets` is empty.
- `canBuyAny(state, slot, crops)`: `canBuy` with some target; the Buy button uses it.
- `sellBlock(state, index)`: `null`, `"closed"`, `"notSellable"`, `"required"` or `"storage"`: why `sellUpgrade { index }` would be refused. `canSell` is `sellBlock(…) === null`.

### `promotionTargets(upgrades, config?): number[]` (in `upgrades.ts`)

Indexes into `upgrades` of the copies Promotion could raise, ascending (see [Promotion](#promotion)). It lives in `upgrades.ts` because `eligibleUpgrades` needs it.

## In `main.ts` (see [main.md](main.md))

### Allowed actions

On top of the rules in [main.md](main.md):

- With an upgrade offer open, every shop action is refused, `openShop` included: the pick comes first.
- With the shop open, only `buyItem`, `sellUpgrade`, `restockShop`, `closeShop`, `sellCrop` and `makeFertilizer` are accepted. Everything that needs the board or the clock (planting, harvesting, delivering, power-ups, fertilizer on a plot, Miracle grow, `buyLife`) waits until it closes.
- With the shop closed, `buyItem`, `sellUpgrade` and `restockShop` are refused.

### `step` (changed)

- **While the shop is open,** `step` returns `state` itself, as for an open offer.
- **Step 4a, Auto-harvester** (unchanged from Day 8): after growth, each ready plot with `autoHarvest > 0` at it is harvested exactly as the `harvest` action would (`harvestPlot`), in plot order; a plot Crows block, or with storage full, stays ready.
- **Interest** (new, after growth): when `tick >= nextInterestAt`, `coins += interestFor(state)` and `nextInterestAt += interest.everyTicks`. With no Interest owned it adds 0, but the timer still moves, so buying Interest doesn't change when payments fall.
- The Day 8 step 1a (closing a running shop) and step 10 (opening on schedule) are removed.

### Filled orders

`completeOrder` (used by `deliver`, Finish one and Finish all) ends with `withFilledOrder`, so every filled order counts toward the next free restock, including each order Finish all fills.

### `openShop`

Refused unless the run is running, the mode has a shop, no upgrade offer is open and the shop is closed. Sets `open: true`. If `stock` is `null`, draws the first stock with `rollStock` and stores `rng.shop`.

### `buyItem { slot, target? }`

Refused unless the shop is open, `slot` is a whole number pointing at an unsold item, `coins >= itemPrice(state, slot)`, and the item's own rule passes:

- **Lasting upgrade:** the id is still in `shopPool` (it isn't Maxed), and `target` follows the same rules as `chooseUpgrade`: left out for an untargeted upgrade, one of `validTargets` for a targeted one. Adds `{ id, tier, target }` with `withUpgrade`, so extra plots and lives arrive as for a free pick.
- **Promotion:** `target` is in `promotionTargets`. Raises that copy one tier (below).
- **Power-up:** `allowPowerUps`, and `powerUps.length < powerUpSlots`. Appends the id to `powerUps`.
- **Life:** Survival, and `lives < maxLivesFor(state)`. `lives + 1`, `livesBought + 1`.

Then it takes the price and marks the slot `sold`.

### `sellUpgrade { index }`

Refused unless the shop is open, `index` is a whole number pointing at an owned copy, and:

- the copy's upgrade is `sellable`;
- it is not the last copy of an upgrade that another owned copy `requires` (Bigger bumper keeps Bumper harvest);
- removing it keeps `storageUsed <= storageCap` (selling Bigger barn while the barn is fuller than the smaller cap is refused).

Removes `upgrades[index]` (a new array; the copies after it move up) and adds `sellRefund(copy)`. Selling frees a copy toward `maxCopies` and, for a targeted upgrade, its target. Nothing already made changes.

### `restockShop`

Refused unless the shop is open and `coins >= restockPrice(state)`. Uses one banked free restock if there is one, else takes `restock.price`. Replaces the whole stock with a fresh `rollStock` (every slot unsold again, the life slot too).

### `closeShop`

Refused unless the shop is open. Sets `open: false`; the stock stays as it is. Time resumes on the next `step`.

Only `openShop` (the first stock), `restockShop` and Auto-harvester draw random numbers, and none of these actions moves the tick, so a run stays reproducible from `seed + config + log`. A replay fails with `shop-pending` if time has to pass while the shop is open (see [verification.md](verification.md)).

## Shop-only upgrades (in [upgrades.md](upgrades.md))

All numbers are placeholders. All are in the `shop` pool only.

| id              | Name           | Tier   | maxCopies | Effects (common → legendary)            | Target                | Sellable |
| --------------- | -------------- | ------ | --------- | --------------------------------------- | --------------------- | -------- |
| `extraPlot`     | Extra plot     | rare   | 2         | `extraPlots` +1                         | –                     | no       |
| `richSoil`      | Rich soil      | rare   | 3         | `yieldBonus` +1                         | plot, `oncePerTarget` | no       |
| `quickSoil`     | Quick soil     | rare   | 3         | `quickSoilSeconds` +5                   | plot, `oncePerTarget` | no       |
| `autoHarvester` | Auto-harvester | epic   | 2         | `autoHarvest` +1                        | plot, `oncePerTarget` | no       |
| `interest`      | Interest       | tiered | 3         | `interestPct` +2, +3, +5, +8, +12       | –                     | yes      |
| `discountCard`  | Discount card  | tiered | 3         | `shopPricePct` −3, −5, −8, −12, −20     | –                     | yes      |
| `freeRestock`   | Free restock   | rare   | 1         | `freeRestockBonus` +1                   | –                     | yes      |
| `fastRestock`   | Fast restock   | tiered | 2         | `restockOrdersCut` +1, +1, +2, +2, +3   | –                     | yes      |
| `rainCheck`     | Rain check     | rare   | 2         | `restockBankBonus` +1                   | –                     | yes      |
| `luckyStars`    | Lucky stars    | tiered | 3         | `tierLuck` +5, +10, +15, +20, +30       | –                     | yes      |
| `promotion`     | Promotion      | epic   | –         | instant: raises one owned copy one tier | an owned copy         | –        |

- **Free restock:** each cycle of filled orders earns two free restocks instead of one, still up to the bank cap.
- **Fast restock:** fewer filled orders per free restock. With the default 7 and the stat's cap of 4, never fewer than 3.
- **Rain check:** the bank holds more free restocks.

The plot upgrades aren't sellable, following the open item in [upgrades.md](upgrades.md) (selling plot upgrades needs a tradeoff first).

Stats:

| Stat               | base | min | max | Read by                                          | Effect                                                                                         |
| ------------------ | ---- | --- | --- | ------------------------------------------------ | ---------------------------------------------------------------------------------------------- |
| `quickSoilSeconds` | 0    | 0   | 10  | `plant`, Birds, Good neighbors (`plantCutTicks`) | `readyAt = now + max(1, scalePct(growTicks, growthPct) − quickSoilSeconds × TICKS_PER_SECOND)` |
| `autoHarvest`      | 0    | 0   | 1   | `step` 4a                                        | 1: the plot harvests itself when ready                                                         |
| `interestPct`      | 0    | 0   | 25  | `step` (Interest)                                | % of held coins added every `interest.everySeconds`, up to `interest.maxCoins`                 |
| `shopPricePct`     | 100  | 50  | 100 | `itemPrice`                                      | % of the usual upgrade and power-up price                                                      |
| `freeRestockBonus` | 0    | 0   | 1   | `restocksPerCycle`                               | Extra free restocks per cycle (replaces Day 8's `freeRestocks`)                                |
| `restockOrdersCut` | 0    | 0   | 4   | `ordersPerFreeRestock`                           | Fewer filled orders per free restock                                                           |
| `restockBankBonus` | 0    | 0   | 2   | `restockBankCap`                                 | Extra free restocks the bank can hold                                                          |
| `tierLuck`         | 0    | 0   | 60  | `rollOffer`                                      | Shifts free-pick tier weights toward higher tiers (below)                                      |

`quickSoilSeconds` and `autoHarvest` can be read per plot (with `growthPct`, `yieldBonus`, `bumperChance`, `shielded`), so `validateUpgrades` allows them on plot-targeted upgrades. `plantCutTicks(state, plot, cropId)` sits next to `plantGrowthPct` and is used at the same three places.

### Lucky stars

`rollOffer` uses `floor(weight × (100 + tierLuck × i) / 100)` for the tier at index `i` in `TIERS` (common is 0, legendary is 4), so common never changes and each tier above it gains more. At the cap of 60 the shipped weights 40 : 30 : 15 : 10 : 5 become 40 : 48 : 33 : 28 : 17. It applies to free picks and their rerolls, not to shop stock.

### Promotion

The first `instant` upgrade: buying it changes an owned copy and is never stored, so it has no copies, no `maxCopies` and nothing to sell.

- In `upgrades.json` it has `"kind": "instant"`, `"instant": "promote"`, `pools: ["shop"]`, a `tier`, and no `effects`, `maxCopies`, `sellable` or `target`. Every other upgrade gets `kind: "lasting"`.
- **Targets:** `promotionTargets` lists every owned copy that is tiered, below `legendary`, and has at least one effect whose amount grows at the next tier and would still change its stat where the copy applies.
- **Eligible** for the shop pool only while `promotionTargets` is not empty.
- **Buying** replaces `upgrades[target]` with the same copy one tier up (a new array, same position).
- **Stat caps still hold:** totals are clamped as always, so a promotion near a cap adds only what is left under it.

## Rules

- No Phaser or browser imports. Pure: never changes its inputs, never reads the clock.
- Draws only from `rng.shop`, and only through `rollStock`.
- `GameState.shop` is plain JSON: ids, tiers, flags and counts. Prices are never stored; they are worked out from the state when needed.
- No rule reads an upgrade id. What the shop-only upgrades do is their stats.

## Tests (`shop.test.ts`)

**Config**

- Accepts the shipped `shop.json`; throws for each bad field, one test per case.
- Turns `interest.everySeconds` into `everyTicks`; throws for a negative `interest.maxCoins`, an `interest.everySeconds` of 0, and a missing `interest`.

**Opening and closing**

- A new run starts with the shop closed, no stock, an empty bank, and `nextInterestAt` one period in.
- `openShop` opens it and draws the first stock once; closing and opening again keeps the same stock and doesn't draw.
- While open, `step` returns the same state; `sellCrop` and `makeFertilizer` work; planting, harvesting, delivering, power-ups, fertilizer on a plot and `buyLife` are refused.
- `openShop` is refused with an offer open, when already open, after the run ended, and in Puzzle. `closeShop` is refused when closed; time moves again after it.
- `buyItem`, `sellUpgrade` and `restockShop` are refused with the shop closed.

**Free restocks**

- Every 7th filled order (deliver, Finish one, Finish all) adds one free restock; the bank stops at 2, and orders filled while it is full don't count.
- Free restock adds two per cycle (still capped); Fast restock lowers the orders needed, never below 1; Rain check raises the cap.
- `restockShop` uses a banked free restock before coins; with none it takes `restock.price`, and is refused with too few coins.
- A restock redraws every slot, sold ones and the life slot included.

**Stock**

- `rollStock` gives `stock.upgrades` different upgrade ids from the shop pool, then power-ups, then the life slot in Survival and not in Timed.
- Shop-only upgrades are stocked; upgrades from the other mode's pool are not; capped and maxed-out upgrades are not.
- No power-ups with power-ups off; Coin bag is never stocked.
- A stocked upgrade that gets capped afterwards stays in its slot, `isMaxed` is true and it can't be bought.
- Draws only from `rng.shop`: two runs on one seed, one that restocks and one that doesn't, get the same orders, offers and drops.

**Prices**

- An upgrade's price follows its tier's `tierPrice`, rises by `perCopyPct` per owned copy and `perProgressPct` per `progressOrders` filled orders, with each rise off at 0; Discount card lowers it at once.
- A power-up's price rises with progress only; a life costs `lifePriceFor`, and buying one in the shop raises `buyLife`'s price.
- `sellRefund` is `floor(tierPrice × sellRefundPct / 100)`.

**Interest**

- Pays its % of held coins, up to `interest.maxCoins`, on each `nextInterestAt` tick, and moves the timer on whether or not Interest is owned.
- Pays nothing while the shop is open, because play time doesn't pass.
- Opening the shop pays no Interest.

**Buying and selling**

- `buyItem` takes the price, marks the slot sold, and adds the upgrade (with a target where needed), power-up or life; refused for a bad or sold slot, too few coins, a Maxed card, a bad target, full power-up slots, full lives.
- `sellUpgrade` removes the copy, pays its refund, and frees a copy and a target; refused for a bad index, not sellable, the last copy another copy `requires`, storage that wouldn't fit the smaller barn.

**Shop-only upgrades**

- Rich soil, Quick soil and Auto-harvester as in Day 8 (yield on its plot only; seconds off on its plot only, never below 1 tick; harvests on the step it turns ready, waits on full storage or Crows).
- Lucky stars: with `tierLuck` 0 the weights are unchanged; at 60 they are 40 : 48 : 33 : 28 : 17; shop stock is unchanged by it.
- Promotion raises an owned copy one tier in place and respects the stat cap; it never targets a legendary, non-tiered or capped copy, and isn't stocked when nothing can be promoted.

**Replay (`verification.test.ts`)**

- Scripted Survival and Timed runs that open the shop, buy, sell, sell crops, restock (free and paid) and close replay equal (4 seeds each).
- A log with an entry, or a `finalTick`, after an `openShop` that was never closed fails with `shop-pending`.

## Changes to other specs (Day 8b)

- [types.md](types.md): the new `ShopState` and `ShopConfig`, `nextInterestAt`, `openShop`, and the Modifiers stats `freeRestockBonus`, `restockOrdersCut`, `restockBankBonus` (`freeRestocks` removed).
- [main.md](main.md): the allowed-action rules, the Interest step, removing steps 1a and 10, `withFilledOrder` in `completeOrder`, `openShop`.
- [upgrades.md](upgrades.md): Free restock's new stat, Fast restock and Rain check.
- [powerups.md](powerups.md): Merchant call (Day 9) grants a free restock, up to the bank cap.
- [verification.md](verification.md): `shop-pending` now means an `openShop` that was never closed.
- [debug.md](debug.md): `debugOpenShop` and the debug menu's Open shop button are removed, since `openShop` is a normal action; the menu could grant a free restock instead.
- [ui.md](ui.md): the shop page, the crop bar and the drawer.

## Open items

- [ ] The shop stops the clock in both modes for now. In Timed this lets the player stop the clock whenever they like and still sell, buy and restock (Design Doc open question).
- [ ] Restock numbers: free every 7 filled orders, a bank of 2, paid at a fixed 10 coins. Tune after playtesting. (Decided: the paid price stays fixed, with no cap on paid restocks.)
- [ ] How prices rise (design open question): per copy (25%) and per 10 filled orders (10%) for now.
- [x] The shop can't be opened while a free upgrade pick is waiting: the pick comes first (`openShop` is refused with an offer open).
- [ ] Compost stays unsellable for now, so held fertilizer never becomes useless. Should the shop buy it back?
- [ ] Lucky stars' rule is a proposal. Should it apply to shop stock too?
- [ ] `buyLife` stays usable outside the shop, sharing its rising price with the life slot. Should lives in Survival only be bought in the shop?
- [ ] Should refunds follow what was paid (free picks paid nothing) instead of the tier's price?
- [ ] Should Auto-harvester's harvests roll power-up drops? They do for now, the same as a manual harvest.
- [ ] Timed orders pay the same coins as Survival. With a shop in Timed, revisit whether Timed needs its own rate (see [economy.md](economy.md)).
- [x] Interest on its own clock: every 30 s of play, up to 15 coins, nothing while the shop is open (`withInterest`, `nextInterestAt`, `shop.json`'s `interest`). Done ahead of the rest of Day 8b.
- [x] For the shop rework (needs the restock bank): replace `freeRestocks` with `freeRestockBonus` in `upgrades.json`, `Modifiers` and `restockPrice`, and change Free restock's text to "Free restocks come two at a time"; add `fastRestock` and `rainCheck` to `upgrades.json` with the stats `restockOrdersCut` and `restockBankBonus` (table above); Merchant call (see [powerups.md](powerups.md)).
- [x] When the running shop goes, drop `withInterest`'s push-back branch (see Status) and its test; the open shop stops `step`, which is all Interest needs.
- [x] The shop page, the restock bank, `openShop`, Maxed cards and the progress price rise (Day 8b).
- [ ] Fast restock's text ("Free restocks need {0} fewer orders") and Rain check's ("Bank {0} more free restock") are placeholders; Merchant call's `shopPrice` (10) is unused, since it is never stocked.
