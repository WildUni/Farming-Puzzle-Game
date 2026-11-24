# powerups.ts

Power-ups: one-shot items the player holds and uses when they choose. They drop at random from harvests, sit in a few slots, and are used with the `usePowerUp` action. Each one fires one effect from [effects.md](effects.md), either instant (Ready one, Growth boost, Coin bag, …) or lasting (Order freeze, Gold rush).

What each power-up does lives in **`src/data/powerups.json`**. Which ones the player holds lives in **`GameState.powerUps`**, and lasting effects they started live in **`GameState.activeEffects`**.

This spec covers ten power-ups, harvest drops and held slots. Buying them in the shop and pre-run power-ups come later, as do the power-ups that need a system that doesn't exist yet (see Open items).

## Concepts

- **Held power-up.** An id in `GameState.powerUps`. The list is the player's slots, in the order the power-ups dropped. Using one removes it; the ones after it move up.
- **Slots.** The most power-ups the player can hold at once: the `powerUpSlots` modifier (2 to start; Big pockets adds 1).
- **Drop.** Each harvest may drop one power-up, rolled from `rng.drops`. A drop with every slot full is lost.
- **Power-ups allowed.** A run's `GameConfig.allowPowerUps`, copied into `GameState.allowPowerUps` (the rules can't see the config). With it off nothing drops, `usePowerUp` is refused, and upgrades that only help power-ups are never offered. The Daily Challenge and the no-power-up leaderboard will turn it off.

## `src/data/powerups.json`

```json
{
    "powerUps": [
        {
            "id": "orderFreeze",
            "name": "Order freeze",
            "text": "Order timers stop for {seconds} s",
            "modes": ["survival", "timed"],
            "weight": 20,
            "seconds": 10,
            "effect": { "kind": "orderRate", "pct": 0 }
        }
    ]
}
```

| Field       | Required     | Meaning                                                                                                                                                           |
| ----------- | ------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `id`        | yes          | Unique id, stored in `GameState.powerUps`                                                                                                                         |
| `name`      | yes          | Button title                                                                                                                                                      |
| `text`      | yes          | Second line on the slot button. `{seconds}` is replaced by the length after `powerUpDurationPct`                                                                  |
| `modes`     | yes          | Non-empty list of `survival`, `timed`, no repeats. It only drops in these modes                                                                                   |
| `shopPrice` | yes          | Base price in the shop (see [shop.md](shop.md)). Whole number `>= 1`                                                                                              |
| `weight`    | yes          | Relative chance of this power-up when a drop happens. Whole number `>= 1`                                                                                         |
| `seconds`   | lasting only | How long its effect lasts, in seconds. Whole number `>= 1`. Turned into ticks with `TICKS_PER_SECOND`                                                             |
| `effect`    | yes          | One `Effect` from [effects.md](effects.md)                                                                                                                        |
| `target`    | no           | `"plot"` when the player chooses a plot on use (required exactly for `finishGrowth`), `"order"` when they choose an open order (required exactly for `fillOrder`) |
| `needs`     | no           | Game systems the run must have on for it to drop or be used: `"powerUps"`, `"events"`. Required to include `"events"` for `goodEvent`                             |

### Shipped power-ups

All numbers are placeholders until playtesting.

| id            | name         | modes           | weight | effect                     | lasts | target |
| ------------- | ------------ | --------------- | ------ | -------------------------- | ----- | ------ |
| `readyOne`    | Ready one    | survival, timed | 30     | `finishGrowth`             | –     | plot   |
| `growthBoost` | Growth boost | survival, timed | 30     | `cutGrowth` 50 ticks (5 s) | –     | –      |
| `orderFreeze` | Order freeze | survival, timed | 20     | `orderRate` 0%             | 10 s  | –      |
| `coinBag`     | Coin bag     | survival, timed | 20     | `grantCoins` 10            | –     | –      |
| `readyAll`    | Ready all    | survival, timed | 8      | `finishAll`                | –     | –      |
| `finishOne`   | Finish one   | survival, timed | 6      | `fillOrder`                | –     | order  |
| `finishAll`   | Finish all   | survival, timed | 2      | `fillAllOrders`            | –     | –      |
| `goldRush`    | Gold rush    | survival, timed | 10     | `deliverBonus` 5 coins     | 15 s  | –      |
| `cleanSlate`  | Clean slate  | survival, timed | 8      | `clearField`               | –     | –      |
| `goodOmen`    | Good omen    | survival, timed | 10     | `goodEvent` (needs events) | –     | –      |

Every power-up is in both modes. Coin bag and Gold rush were Survival only when they shipped, because coins had no use in Timed then. Gold rush is a **lasting** power-up, as the design doc now has it: every order filled in its 15 s pays +5 coins (a `deliverBonus` effect, which no event uses any more since Generous customer became a one-order tip). Finish all is the rarest and gives no score (the design doc's "skips the puzzle" concern); it still counts the orders as filled and pays their coins.

### Merchant call (with the shop rework)

Built with the Day 8b shop rework, since it needs the restock bank (see [shop.md](shop.md)). It does not open the shop: the shop can be opened at any time.

| id             | name          | modes           | weight | effect         | lasts | target | shopPrice   |
| -------------- | ------------- | --------------- | ------ | -------------- | ----- | ------ | ----------- |
| `merchantCall` | Merchant call | survival, timed | 8      | `grantRestock` | –     | –      | 10 (unused) |

- `grantRestock` is a new instant kind with no fields, power-up only (`validateEvents` refuses it).
- `canUsePowerUp` is false for it while `shop.freeRestocks >= restockBankCap(state)`, so it is never wasted.
- It is never stocked in the shop (buying a restock with coins is what Restock already does), like Coin bag: `rollStock` leaves out `grantRestock` as well as `grantCoins`. It still needs a `shopPrice` to load; give it one, it is unused.
- No draw, no tick change. Filled orders still count toward the next free restock as usual.
- Tests (`powerups.test.ts`): it adds one free restock; it is refused with the bank full and kept; Rain check's bigger bank lets it add past 2; it is never stocked.

## Types (in [types.md](types.md))

```ts
type PowerUpDef = {
    id: string
    name: string
    text: string
    modes: GameMode[]
    weight: number
    durationTicks: number | null // seconds × TICKS_PER_SECOND for lasting effects, null for instant
    effect: Effect
    target: "plot" | "order" | null
    needs: GameSystem[]
}
type PowerUpConfig = { powerUps: Record<string, PowerUpDef> } // id -> definition
```

`seconds` becomes `durationTicks`, a missing `target` becomes `null` and a missing `needs` becomes `[]`, so every `PowerUpDef` has the same shape.

## Exports

### `validatePowerUps(raw: unknown): PowerUpConfig`

Checks a parsed JSON value and returns it in the typed shape. Throws an `Error` naming the bad entry when:

- `raw` is not an object with a non-empty `powerUps` list.
- `id`, `name` or `text` is not a non-empty string, or an `id` is used twice.
- `modes` is empty, has a repeat, or has a value other than `survival` or `timed`.
- `weight` is not a whole number `>= 1`.
- `effect` is not an object with a known `kind`, is one only events use (`blockHarvest`, `stealCrop`, `harvestBonus`, `fog`, `harvestAll`, `seedPlots`, `addOrder`, `rotStorage`), or its numbers break the rules in [effects.md](effects.md#types-in-typesmd).
- `seconds` is missing for a lasting effect, present for an instant one, or not a whole number `>= 1`.
- `target` is not `"plot"` or `"order"` when present; `"plot"` is missing on a `finishGrowth` power-up or present on any other; `"order"` is missing on a `fillOrder` power-up or present on any other.
- `needs` has a repeat or a value that is not a `GameSystem`, or leaves out `"events"` on a `goodEvent` power-up.
- `{seconds}` appears in the text of an instant power-up.

A bad file is a setup mistake, so this throws instead of returning `null`.

### `POWER_UPS: PowerUpConfig`

`powerups.json` passed through `validatePowerUps` once, when the module loads. Every function below takes an optional last argument `config: PowerUpConfig = POWER_UPS`, so tests can use their own power-ups.

### `dropTable(state: GameState, config?): string[]`

Ids that can drop in this run, sorted, so the result doesn't depend on the order in the JSON: in `modes` for the run's mode, with every system in `needs` on. So Good omen never drops with events off.

### `rollDrop(state: GameState, config?): [string | null, RNGState]`

The drop roll for one harvest, from `state.rng.drops`. Returns the dropped id (or `null`) and the new state of the stream.

1. If `state.allowPowerUps` is `false`, `dropChance` (from `modifiersFor(upgrades)`) is 0, or `dropTable(state)` is empty: `[null, rng.drops]`, no draw.
2. Otherwise, draw `roll = randomInt(rng.drops, 0, 99)`. If `roll >= dropChance`: `null`, one draw.
3. Otherwise, draw `r = randomInt(0, W − 1)`, where `W` is the sum of the weights in `dropTable(state)`. Walking the sorted ids and subtracting each weight, the id where `r` drops below its weight is the drop. Two draws.

Rules:

- The roll does not look at free slots. A drop with every slot full still uses both draws and is then thrown away by `harvest`, so whether a slot is free never changes what later drops are.
- Draws only from `rng.drops`.

### `canUsePowerUp(state: GameState, slot: number, target: number | null, config?): boolean`

`true` when `usePowerUp { slot, target }` would succeed (see the action below). The power-up buttons use it, so the screen and the rules can't disagree. The one gap: Good omen is allowed here whenever events are on and no event is announced or running, but `usePowerUp` also refuses it if no good event is eligible, which the shipped events never allow (Rain shower and Sunny spell have no target and run in both modes).

### `powerUpTargets(state: GameState, slot: number, config?): number[]`

For a held power-up with `target: "plot"`: the plot indexes it can be used on (the `growing` ones), ascending. For `target: "order"`: the open orders' ids, ascending. `[]` for an untargeted power-up or a bad slot.

### `durationFor(def: PowerUpDef, upgrades: readonly OwnedUpgrade[]): number | null`

`scalePct(def.durationTicks, powerUpDurationPct)` for a lasting power-up, `null` for an instant one. `usePowerUp` and the button text both use it.

## In `main.ts` (see [main.md](main.md))

### Drops on `harvest`

After the harvest's own yield and bumper roll, `harvest` calls `rollDrop(state)` and stores the new `rng.drops`. If it returns an id and `powerUps.length < powerUpSlots`, the id is appended to `powerUps`. Otherwise nothing is added.

The bumper roll draws from `rng.harvest` and the drop roll from `rng.drops`, so owning Bumper harvest never changes which power-ups drop, and the other way round.

### `usePowerUp { slot, target? }`

Returns `null` when:

- the general rules refuse it (run ended, or an upgrade offer is open);
- `allowPowerUps` is `false`;
- `slot` is not a whole number from `0` to `powerUps.length − 1`;
- a system in its `needs` is off;
- it is Good omen and an event is announced or running, or no good event is eligible;
- the power-up has a target and `target` is not in `powerUpTargets(state, slot)`, or it has no target and `target` is given (other than `null`).

Otherwise it removes `powerUps[slot]` (a new array) and fires the effect:

| Effect          | What happens                                                                                                                                                                                                             |
| --------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `finishGrowth`  | `plots[target]` becomes ready (`finishGrowth`), so it can be harvested on the same tick                                                                                                                                  |
| `cutGrowth`     | `plots = cutGrowth(plots, ticks, tick)`. Allowed even when nothing is growing (the power-up is spent)                                                                                                                    |
| `grantCoins`    | `coins += amount`                                                                                                                                                                                                        |
| `finishAll`     | Every growing plot becomes ready (`finishAll`). Allowed with nothing growing                                                                                                                                             |
| `clearField`    | Every plot becomes empty (`clearField`), growing and ready crops alike                                                                                                                                                   |
| `fillOrder`     | The order with id `target` is filled as by `deliver`, but takes no crops: removed, `value` added to `score`, `ordersCompleted + 1`, and in Survival the usual coins (base, Big tips, `deliverBonus` effects, Early bird) |
| `fillAllOrders` | Every open order is filled the same way, in list order, but adds **no** score                                                                                                                                            |
| `goodEvent`     | `announceEvent(state, EVENTS, "good")`: a good event is announced now, with its usual warning. Stores `rng.events`                                                                                                       |
| lasting         | `activeEffects = startEffect(activeEffects, id, effect, tick, durationFor(def, upgrades))` (Order freeze, Gold rush)                                                                                                     |
| `grantRestock`  | Merchant call (below). `shop.freeRestocks = min(restockBankCap(state), freeRestocks + 1)`. Refused (the power-up is kept) while the bank is full                                                                         |

Only Good omen draws a random number (from `rng.events`, like any announcement); no power-up changes `tick`. Using the same lasting power-up while it is active adds its length to the running effect instead of stacking a second one.

## Upgrades this unlocks (in [upgrades.md](upgrades.md))

| id            | name         | pools           | tier   | maxCopies | effects (common → legendary)                 |
| ------------- | ------------ | --------------- | ------ | --------- | -------------------------------------------- |
| `luckyDrops`  | Lucky drops  | survival, timed | tiered | 5         | `dropChance` +2, +3, +5, +8, +12             |
| `longLasting` | Long-lasting | survival, timed | tiered | 5         | `powerUpDurationPct` +10, +15, +25, +35, +50 |
| `bigPockets`  | Big pockets  | survival, timed | rare   | 1         | `powerUpSlots` +1                            |

New stats:

| Stat                 | base | min | max | Read by                            |
| -------------------- | ---- | --- | --- | ---------------------------------- |
| `dropChance`         | 8    | 0   | 40  | `rollDrop` (on `harvest`)          |
| `powerUpSlots`       | 2    | 1   | 3   | `harvest` (whether a drop is kept) |
| `powerUpDurationPct` | 100  | 100 | 200 | `durationFor` (on `usePowerUp`)    |

All three are marked `"needs": ["powerUps"]`, so they are never offered in a run with `allowPowerUps` off (see `needs` in [upgrades.md](upgrades.md)). Big pockets is not `sellable`: selling it with three held power-ups would leave one with no slot.

## Rules

- No Phaser or browser imports. Pure: never changes its inputs.
- Draws only from `rng.drops`, and only through `rollDrop`.
- No rule reads a power-up id except to look up its definition. What a power-up does is its `effect`.

## Tests (`powerups.test.ts`)

**`validatePowerUps`**

- Accepts the shipped `powerups.json`.
- Throws for each case in its list above, one test per case, using a small valid config with one field changed.
- Turns `seconds` into `durationTicks` (`seconds × TICKS_PER_SECOND`) and a missing `target` into `null`.

**`dropTable`**

- Lists ids for the mode, sorted; with the shipped data both modes get the same list (Coin bag and Gold rush included).

**`rollDrop`**

- No draw when power-ups are off, when `dropChance` is 0, or when nothing drops in the mode.
- One draw when the roll misses, two when it hits; the stream is advanced by exactly that many.
- With `dropChance` 100, every harvest drops; with a config of one power-up, it is always that one.
- Over many seeds, drop rate and the split between power-ups are close to `dropChance` and the weights (a loose bound).
- Never touches `rng.orders`, `rng.upgrades` or `rng.harvest`.

**`powerUpTargets` / `canUsePowerUp`**

- Ready one targets only growing plots, in order; untargeted power-ups and bad slots give `[]`.
- `canUsePowerUp` agrees with `applyAction` in every refusal case listed above.

**`durationFor`**

- Gives `durationTicks` with no upgrades, scales with `powerUpDurationPct`, and is `null` for instant power-ups.

**Drops and use (`main.test.ts`)**

- A harvest that drops appends the id to `powerUps`; with every slot full the drop is lost but `rng.drops` still moves by two draws.
- Big pockets raises the slots to 3.
- `usePowerUp` removes the used slot and keeps the others in order.
- Ready one makes its plot ready, and it can be harvested on the same tick.
- Growth boost brings every growing crop 50 ticks closer; a crop brought to `tick` is ready.
- Coin bag adds its coins.
- Order freeze: open orders' `timeLeft` stays the same for 10 s of steps, then counts down again; Long-lasting makes it last longer; using a second Order freeze while one is active adds 10 s to it.
- Refused: power-ups off, bad slot, missing or invalid target, target on an untargeted power-up, while an upgrade offer is open, after the run ended.
- While an upgrade offer is open, an active Order freeze doesn't use up any of its ticks.
- Two runs on the same seed where one player uses power-ups and the other doesn't get the same order sequence (`rng.orders` is untouched).

**Second batch (`powerups.test.ts`, `main.test.ts`)**

- `validatePowerUps` accepts each new kind, and throws for `fillOrder` without an order target, an order target on another effect, Good omen without `needs: ["events"]`, an unknown or repeated need, `deliverBonus` with 0 coins or no seconds, and an event-only kind.
- `dropTable` lists Coin bag and Gold rush in both modes, and Good omen only with events on.
- Finish one targets open orders' ids, ascending; Good omen is usable only with events on and no event announced or running.
- Ready all readies every growing crop; Clean slate empties every plot.
- Finish one fills the chosen order without crops, scoring and paying like a delivery, and is refused without a target or with an unknown id; Finish all fills every order for coins and no score.
- Gold rush starts a `deliverBonus` effect that adds 5 coins to deliveries.
- Good omen announces a good event on the current tick from `rng.events` (never `rng.orders`), and is refused while an event is on or with events off.

**Merchant call (`powerups.test.ts`)**

- `validatePowerUps` accepts a `grantRestock` power-up; `validateEvents` refuses it as an event effect.
- It adds one free restock without opening the shop, drawing nothing; it is refused with the bank full and kept; Rain check's bigger bank lets it add past 2; it is never stocked.

**Replay (`verification.test.ts`)**

- Scripted runs with power-ups on, where the player uses every power-up as soon as it can (Ready one on the first valid plot), replay equal in Survival and Timed, and their logs contain `usePowerUp` entries.

## Open items

- [ ] Tune drop chance, weights, slot count, lengths and amounts after playtesting.
- [x] Ready all, Finish one, Finish all, Gold rush, Clean slate, Good omen.
- [ ] Still to come: Combo freeze (Timed combos), Giant order (needs a "no new orders until this one is done" rule and its mode penalties).
- [ ] Gold rush: keep "+5 coins per order for 15 s", or double coins for 15 s instead? (Also in the design doc's open questions.)
- [x] Gold rush is Lasting (the design doc changed from "the current order pays extra"); nothing to change, it already was.
- [x] Coin bag and Gold rush are in both modes, now that Timed orders pay coins.
- [x] Merchant call: built with the shop rework (above). Weight 8 is a placeholder.
- [ ] Finish all: is "no score, coins and filled count still given, rarest drop" the right way to keep it from skipping the puzzle? (Also in the design doc's open questions.)
- [ ] Buying power-ups in the shop (specified in [shop.md](shop.md): a `shopPrice` per power-up), and pre-run power-ups paid with meta currency.
- [ ] Should a drop with full slots replace the oldest held power-up, or offer a swap, instead of being lost?
- [ ] Should a used Growth boost with nothing growing be refused instead of spent?
