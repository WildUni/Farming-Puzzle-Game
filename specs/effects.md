# effects.ts

Effects that change a run's clocks: how fast crops grow and how fast order timers run. Power-ups (see [powerups.md](powerups.md)) and events (see [events.md](events.md)) use the same effects, so Growth boost and Rain shower, or Order freeze and a later Slow day, run the same code. A few lasting effects don't move a clock but change what an action does while they work (Crows block harvesting, Gold rush adds coins to deliveries).

`plot.ts` and `orders.ts` fix a crop's `readyAt` and an order's `expiresAt` when they are made. An effect never adds a new clock. It **moves those deadlines**: once when an instant effect fires, or a little on every tick while a lasting effect is active. So the `Plot` and `Order` shapes don't change, every number stays a whole tick, and replay stays exact.

Like the other rule modules, `effects.ts` never reads or returns a whole `GameState`. It takes plots, orders and effect lists, and returns new ones; `main.ts` stores them.

## Concepts

- **Lasting effect.** Works for a number of ticks, then ends. Stored in `GameState.activeEffects` while it works.
- **Instant effect.** Happens once, when it is used. Never stored.
- **Source.** The id of what started a lasting effect: a power-up id or an event id. The two lists never share an id. One active effect per source: starting it again while it is active adds time instead of a second copy.
- **Rate.** A lasting effect's `pct`: how fast its clock runs while it is active, as a % of normal. `0` stops the clock, `50` is half speed, `150` is one and a half times as fast.
- **Working ticks.** A lasting effect started on tick `s` with length `d` has `endsAt = s + d`. Rate effects move clocks on ticks `s + 1 … endsAt` (in `step`). Action effects (`blockHarvest`, `deliverBonus`, `autoHarvest`) apply to actions on ticks `s … endsAt − 1`. Both cover exactly `d` ticks.
- **Excluded plots.** A lasting effect can leave some plots out (`exclude`). Bad events leave out Greenhouse plots; everything else excludes nothing.
- **Only plots.** A lasting effect can instead work on a chosen list of plots (`only`). `null` means every plot. Crows use it: they land on a few plots, and each one is cleared when the player scares the crows off it. A plot is under an effect when `only` is `null` or lists it, and `exclude` doesn't list it (`appliesTo`).

## Types (in [types.md](types.md))

```ts
type LastingEffect =
    | { kind: "growthRate"; pct: number } // growing crops' clocks
    | { kind: "orderRate"; pct: number } // open orders' timers
    | { kind: "comboRate"; pct: number } // the Timed combo window (comboEndsAt; Combo freeze)
    | { kind: "blockHarvest"; plots: number } // harvest is refused on the plots in `only` (Crows land on up to `plots` plots)
    | { kind: "deliverBonus"; coins: number } // each delivery pays this many more coins (Gold rush)
    | { kind: "harvestBonus"; crops: number } // each harvest adds this many more crops (Worms)
    | { kind: "fog" } // the screen hides growth and order timers; no rule changes
    | { kind: "autoHarvest" } // ready crops harvest themselves in step (Auto harvest)

type InstantEffect =
    | { kind: "cutGrowth"; ticks: number } // every growing crop gets this many ticks closer to ready
    | { kind: "finishGrowth" } // one growing crop becomes ready now (targets a plot)
    | { kind: "grantCoins"; amount: number }
    | { kind: "stealCrop" } // one plot's crop is lost (targets a plot)
    | { kind: "finishAll" } // every growing crop becomes ready now (Ready all)
    | { kind: "clearField" } // every plot becomes empty (Clean slate)
    | { kind: "fillOrder" } // one open order is filled without crops (Finish one; targets an order)
    | { kind: "fillAllOrders" } // every open order is filled without crops, for no score (Finish all)
    | { kind: "goodEvent" } // a random good event is announced now (Good omen)
    | { kind: "harvestAll" } // every ready crop is harvested for the player (Helpful neighbor)
    | { kind: "seedPlots"; plots: number } // random crops are planted on up to this many empty plots (Birds)
    | { kind: "addOrder"; timePct: number } // one extra order with timePct% of the usual time (Emergency order)
    | { kind: "rotStorage"; pct: number } // this % of each stored crop is lost, rounded down (Rot)
    | { kind: "tipOrder"; coins: number } // one random open order pays this many more coins when filled (Generous customer)
    | { kind: "grantRestock" } // one free shop restock, up to the bank cap (Merchant call)
    | { kind: "giantOrder"; coinsPct: number; timePct: number } // every open order merges into one giant order (Giant order)

type Effect = LastingEffect | InstantEffect

type ActiveEffect = {
    source: string // power-up id or event id
    effect: LastingEffect
    startedAt: number // tick it started on
    endsAt: number // startedAt + length
    exclude: number[] // plots it leaves out, ascending
    only: number[] | null // the plots it works on, ascending; null for every plot
}
```

`pct`, `ticks`, `amount`, `coins`, `crops`, `plots` and `timePct` are whole numbers. A rate's `pct >= 0` and `pct !== 100`; `ticks`, `amount`, `coins`, `crops` and `plots` (both `seedPlots`' and `blockHarvest`'s) are `>= 1`; `addOrder`'s `timePct` and `rotStorage`'s `pct` are from 1 to 100; `giantOrder`'s `coinsPct` and `timePct` are `>= 1` (above 100 is the usual case). The files that use effects (`powerups.json`, `events.json`) check this when they load, and each says which kinds it allows.

`growthRate`, `orderRate` and `comboRate` are **rate effects**; `blockHarvest`, `deliverBonus`, `harvestBonus`, `fog` and `autoHarvest` are **action effects**. `comboRate` moves no plot or order: `tickEffects` leaves it alone and `step` reads its shift through `comboShiftAt`. The instant kinds that need the whole game state (`fillOrder`, `fillAllOrders`, `goodEvent`, `harvestAll`, `seedPlots`, `addOrder`, `rotStorage`, `tipOrder`, `grantRestock`, `giantOrder`) are carried out in `main.ts` or `events.ts`; `effects.ts` has helpers only for the ones that work on plots or effect lists alone.

## The rate rule

A lasting effect with rate `pct` that started on tick `s` has been running for `n = now − s` ticks on tick `now`. By then it has moved its clocks by a total of

```
total(n) = trunc(n × (100 − pct) / 100)
```

ticks (`trunc` rounds toward zero). On tick `now` it moves each clock by `shift = total(n) − total(n − 1)`. A positive shift pushes a deadline later, a negative one pulls it earlier.

| `pct` | Shift per tick      | Meaning                      |
| ----- | ------------------- | ---------------------------- |
| `0`   | `+1` every tick     | Clock stopped                |
| `50`  | `+1` every 2nd tick | Half speed                   |
| `150` | `−1` every 2nd tick | One and a half times as fast |
| `200` | `−1` every tick     | Double speed                 |

The shift comes from `startedAt` and the tick alone, so nothing else needs storing and the shifts never drift: after `n` ticks the total is always `total(n)`.

## Moving a crop's clock

Moving a growing crop by `shift` moves **both** `readyAt` and `plantedAt`, so `progress()` stays right: a stopped crop's bar stands still, a faster crop's bar runs faster.

- The shift is clamped so `readyAt` never goes below `now`: `applied = max(shift, now − readyAt)`. Then `readyAt += applied` and `plantedAt += applied`.
- Only `growing` plots move. Empty and ready plots never change.
- A plot whose `applied` is 0 is returned as the same object.

An instant effect that brings a crop to `now` turns it `ready` at once (`updateGrowth(plot, now)` runs after the move), so the player can harvest it on the same tick.

## Moving an order's timer

Moving an open order by `shift` changes only `expiresAt`. `timeLimit` stays the same, so the countdown bar (`timeLeft / timeLimit`) stands still while the timer is stopped.

- The shift is clamped so `expiresAt` never goes below `now`.
- An order whose shift is 0 is returned as the same object.

## Several effects at once

Each active effect works out its own shift, and the shifts on one clock add up before the clamp. Order freeze (`orderRate 0`) together with a later Slow day (`orderRate 50`) pushes timers by `+1` on some ticks and `+2` on others. Effects that only touch crops never move orders, and the other way round.

A crop's total is the sum over the `growthRate` effects that don't exclude its plot, so a Greenhouse plot under Frost keeps growing while a Sunny spell still speeds it up. Two `deliverBonus` effects add their coins; `blockHarvest` blocks a plot if any working one doesn't exclude it.

## Exports

### `rateShift(pct: number, startedAt: number, now: number): number`

`total(n) − total(n − 1)` with `n = now − startedAt`, as in [The rate rule](#the-rate-rule). `0` when `n <= 0`.

### `shiftPlot(plot: Plot, shift: number, now: number): Plot`

Moves one crop's clock by `shift`, as in [Moving a crop's clock](#moving-a-crops-clock). Does not turn the plot ready; `step`'s growth step does that.

### `shiftOrder(order: Order, shift: number, now: number): Order`

Moves one order's timer by `shift`, as in [Moving an order's timer](#moving-an-orders-timer).

### `tickEffects(active, plots, orders, now): { active: ActiveEffect[]; plots: Plot[]; orders: Order[] }`

What lasting effects do on one tick. `step` calls it right after the tick moves forward (see [main.md](main.md)).

1. Drops every effect with `endsAt < now`. Those effects move nothing on this tick.
2. For each growing plot, adds up the remaining `growthRate` shifts whose `exclude` doesn't list it, and moves the plot by that total.
3. Adds up the remaining `orderRate` shifts and moves every open order by the total.

Action effects move nothing here; they are only dropped once they end.

Rules:

- Returns the same `active`, `plots` or `orders` array when nothing in it changed, and the same object for every plot and order that didn't move.
- With `active` empty, returns all three inputs as they are.
- Keeps the order of `active`, `plots` and `orders`.

### `startEffect(active, source, effect, now, durationTicks, exclude = [], only = null): ActiveEffect[]`

Starts a lasting effect, or adds time to one already running.

- No active effect has `source`: appends `{ source, effect, startedAt: now, endsAt: now + durationTicks, exclude, only }`.
- One does: replaces it with the same entry, but `endsAt` raised by `durationTicks`. `startedAt` and `exclude` stay, so its shifts carry on without a jump. `only` becomes the union of the old and new lists, ascending (`null` if either is `null`), so a second Crows landing adds its plots.
- `durationTicks` is a whole number `>= 1`.
- Never changes `active`; returns a new array.

The first tick it moves a clock on is `now + 1` (the next `step`), and the last is `endsAt`. So a 100-tick effect moves clocks on exactly 100 ticks.

### `cutGrowth(plots: Plot[], ticks: number, now: number): Plot[]`

Moves every growing plot by `−ticks`, then runs `updateGrowth(plot, now)` on the ones that moved, so crops brought to `now` are ready at once. Returns the same array when no plot was growing.

### `finishGrowth(plot: Plot): Plot | null`

Makes a growing crop ready now: `{ state: "ready", cropId }`. Returns `null` for an empty or ready plot.

### `stealCrop(plot: Plot): Plot | null`

A growing or ready plot becomes `{ state: "empty" }`. Returns `null` for an empty plot, so the caller can tell the event found nothing.

### `appliesTo(a: ActiveEffect, plot: number): boolean`

`true` when `a.only` is `null` or lists `plot`, and `a.exclude` doesn't list it. Every per-plot rule uses it (`tickEffects` for `growthRate`, `harvestBlocked`, `harvestBonusAt`), and so do the screen's plot markers.

### `harvestBlocked(active: ActiveEffect[], plot: number, now: number): boolean`

`true` when some `blockHarvest` effect with `startedAt <= now < endsAt` `appliesTo` `plot`. `harvest` uses it.

### `scareCrows(active: ActiveEffect[], plot: number, now: number): ActiveEffect[] | null`

The player taps a plot with crows on it. Every working `blockHarvest` effect whose `only` lists `plot` drops it from `only`; an effect left with an empty `only` is removed. Returns `null` when no working `blockHarvest` effect lists `plot` (no crows there, or an effect with `only: null`, which can't be scared). Never changes `active`.

### `deliverBonusAt(active: ActiveEffect[], now: number): number`

The sum of `coins` over `deliverBonus` effects with `startedAt <= now < endsAt`; `0` when there are none. `deliver` adds it (Survival and Timed).

### `harvestBonusAt(active: ActiveEffect[], plot: number, now: number): number`

The sum of `crops` over `harvestBonus` effects with `startedAt <= now < endsAt` that don't list `plot` in `exclude`; `0` when there are none. `harvest` adds it (Worms).

### `comboShiftAt(active: ActiveEffect[], now: number): number`

The sum of `rateShift(pct, startedAt, now)` over `comboRate` effects with `endsAt >= now` (the same ticks a rate effect moves clocks on, `startedAt + 1 … endsAt`); `0` when there are none. `step` adds it to `comboEndsAt` while a streak is running, before checking whether the window has run out, so Combo freeze (`comboRate 0`) holds the window still.

### `autoHarvestAt(active: ActiveEffect[], plot: number, now: number): boolean`

`true` when some `autoHarvest` effect with `startedAt <= now < endsAt` `appliesTo` `plot`. `step`'s auto-harvest pass uses it next to the Auto-harvester upgrade.

### `fogged(active: ActiveEffect[], now: number): boolean`

`true` while some `fog` effect has `startedAt <= now < endsAt`. Only the screen reads it.

### `finishAll(plots: Plot[]): Plot[]`

Every growing plot becomes ready (`finishGrowth`). Returns the same array when nothing was growing.

### `clearField(plots: Plot[]): Plot[]`

Every plot becomes `{ state: "empty" }`. Returns the same array when every plot already was.

`grantCoins` needs no helper: `usePowerUp` adds `amount` to `coins` itself.

## Rules

- No Phaser or browser imports. Pure: never changes its inputs.
- No randomness. Effects never draw from any stream.
- Times are ticks. No effect changes `tick` or the run timer (`MODES.timed.runTicks`).
- While `step` is stopped (run ended, or an upgrade offer open), `tickEffects` isn't called, so lasting effects stop with the rest of the clock. Their ticks are not used up while time stands still.

## Tests (`effects.test.ts`)

**`rateShift`**

- `pct 0` gives `+1` on every tick; `pct 200` gives `−1` on every tick.
- `pct 50` gives `+1` every 2nd tick and `pct 150` gives `−1` every 2nd tick.
- Over `n` ticks the shifts add up to `trunc(n × (100 − pct) / 100)`, for several rates and lengths.
- `0` when `now <= startedAt`.

**`shiftPlot`**

- Moves `readyAt` and `plantedAt` by the same amount; `progress` stays the same after a `+1` shift on the next tick.
- Never pulls `readyAt` below `now`; the applied amount is clamped, and `plantedAt` moves by the clamped amount.
- Empty and ready plots, and a shift of 0, return the same object.

**`shiftOrder`**

- Moves `expiresAt` and leaves `timeLimit` alone; never below `now`; a shift of 0 returns the same object.

**`tickEffects`**

- An `orderRate 0` effect keeps an order's `timeLeft` the same on every tick it is active, and an order that is open for the whole effect fails that many ticks later than it would have.
- A `growthRate 0` effect holds a crop for its whole length; it turns ready exactly that many ticks late.
- A `growthRate 200` effect makes a crop ready in half its time (rounded as the rule says).
- The effect is dropped on tick `endsAt + 1` and moves nothing on that tick.
- Two effects on the same clock add their shifts.
- A `growthRate 0` effect with `exclude: [1]` holds plot 0 and leaves plot 1 growing.
- A `growthRate 0` effect with `only: [0]` holds plot 0 and leaves plot 1 growing.
- Action effects move nothing, and are dropped on `endsAt + 1` like the rest.
- A crop effect never moves orders and an order effect never moves plots.
- With nothing active, returns the inputs as they are (same arrays).
- Never changes its inputs.

**`startEffect`**

- A new source is appended with `endsAt = now + durationTicks` and the given `exclude` (`[]` by default) and `only` (`null` by default).
- The same source again unions `only` (ascending, without repeats); `null` on either side gives `null`.
- The same source again adds `durationTicks` to `endsAt` and keeps `startedAt`; the list still has one entry for it.
- A 100-tick effect moves clocks on exactly 100 steps.

**`cutGrowth` / `finishGrowth`**

- `cutGrowth` brings every growing crop `ticks` closer, clamped at `now`; a crop brought to `now` is `ready`; empty and ready plots are untouched.
- `finishGrowth` turns a growing plot ready and returns `null` for empty and ready plots.

**`finishAll` / `clearField` / `harvestBonusAt` / `fogged`**

- `finishAll` readies growing crops only; `clearField` empties everything; both return the same array when nothing changes.
- `harvestBonusAt` sums working bonuses from `startedAt` to `endsAt − 1` and skips excluded plots; `fogged` follows the same working ticks.
- `tickEffects` moves nothing for `harvestBonus` and `fog`, and drops them once they end.

**`stealCrop` / `harvestBlocked` / `deliverBonusAt`**

- `stealCrop` empties growing and ready plots and returns `null` for an empty one.
- `harvestBlocked` is `true` from `startedAt` to `endsAt − 1`, `false` on `endsAt`, `false` on an excluded plot, and `false` on a plot missing from `only`.
- `appliesTo` is `true` with `only: null` and no `exclude`, `false` on an excluded plot, and with an `only` list `true` only on the plots it lists.

**`scareCrows`**

- Removes the plot from `only` and keeps the effect while other plots are left; removes the effect when its last plot is scared.
- Returns `null` for a plot with no crows, before `startedAt`, on `endsAt`, and for an effect with `only: null`.
- Leaves other effects untouched and never changes its input.
- `deliverBonusAt` sums working bonuses, is `0` on `endsAt`, and `0` with none.

**`comboShiftAt` / `autoHarvestAt`**

- `comboShiftAt` gives `+1` on ticks `startedAt + 1 … endsAt` for `comboRate 0`, `0` on `startedAt` and after `endsAt`, adds two effects' shifts, and is `0` with none or with only other kinds.
- `tickEffects` moves no plot or order for `comboRate` and `autoHarvest`, and drops them once they end.
- `autoHarvestAt` is `true` from `startedAt` to `endsAt − 1`, `false` on `endsAt`, and respects `exclude` and `only`.

## Open items

- [x] Leaving plots out of an effect (`exclude`), for Greenhouse plots under bad events.
- [x] Effects that hit only chosen plots: an `only` list next to `exclude`. Crows are the first; Frost on one plot and Lucky clover could use it too.
- [x] Effect kinds for the first events: `blockHarvest` (Crows), `stealCrop` (Moles), `deliverBonus` (Generous customer at first; Gold rush since Day 8b's change made Generous customer a `tipOrder`).
- [ ] Should a lasting effect started again reset to its full length instead of adding time? Adding time is simpler to explain on a button ("+10 s").
- [x] Effect kinds for Day 9's last power-ups: `comboRate` (Combo freeze), `autoHarvest` (Auto harvest), `giantOrder` (Giant order).
