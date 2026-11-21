# effects.ts

Effects that change a run's clocks: how fast crops grow and how fast order timers run. Power-ups use them now (see [powerups.md](powerups.md)); events will use the same effects later, so Order freeze and Slow day, or Growth boost and Rain shower, run the same code.

`plot.ts` and `orders.ts` fix a crop's `readyAt` and an order's `expiresAt` when they are made. An effect never adds a new clock. It **moves those deadlines**: once when an instant effect fires, or a little on every tick while a lasting effect is active. So the `Plot` and `Order` shapes don't change, every number stays a whole tick, and replay stays exact.

Like the other rule modules, `effects.ts` never reads or returns a whole `GameState`. It takes plots, orders and effect lists, and returns new ones; `main.ts` stores them.

## Concepts

- **Lasting effect.** Works for a number of ticks, then ends. Stored in `GameState.activeEffects` while it works.
- **Instant effect.** Happens once, when it is used. Never stored.
- **Source.** The id of what started a lasting effect (a power-up id now, an event id later). One active effect per source: starting it again while it is active adds time instead of a second copy.
- **Rate.** A lasting effect's `pct`: how fast its clock runs while it is active, as a % of normal. `0` stops the clock, `50` is half speed, `150` is one and a half times as fast.

## Types (in [types.md](types.md))

```ts
type LastingEffect =
    | { kind: "growthRate"; pct: number } // growing crops' clocks
    | { kind: "orderRate"; pct: number } // open orders' timers

type InstantEffect =
    | { kind: "cutGrowth"; ticks: number } // every growing crop gets this many ticks closer to ready
    | { kind: "finishGrowth" } // one growing crop becomes ready now (targets a plot)
    | { kind: "grantCoins"; amount: number }

type Effect = LastingEffect | InstantEffect

type ActiveEffect = {
    source: string // power-up id (later: event id)
    effect: LastingEffect
    startedAt: number // tick it started on
    endsAt: number // last tick it moves a clock on
}
```

`pct`, `ticks` and `amount` are whole numbers. `pct >= 0` and `pct !== 100`; `ticks >= 1`; `amount >= 1`. The files that use effects (`powerups.json`, later `events.json`) check this when they load.

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
2. Adds up the remaining `growthRate` shifts and moves every growing plot by the total.
3. Adds up the remaining `orderRate` shifts and moves every open order by the total.

Rules:

- Returns the same `active`, `plots` or `orders` array when nothing in it changed, and the same object for every plot and order that didn't move.
- With `active` empty, returns all three inputs as they are.
- Keeps the order of `active`, `plots` and `orders`.

### `startEffect(active, source, effect, now, durationTicks): ActiveEffect[]`

Starts a lasting effect, or adds time to one already running.

- No active effect has `source`: appends `{ source, effect, startedAt: now, endsAt: now + durationTicks }`.
- One does: replaces it with the same entry, but `endsAt` raised by `durationTicks`. `startedAt` stays, so its shifts carry on without a jump.
- `durationTicks` is a whole number `>= 1`.
- Never changes `active`; returns a new array.

The first tick it moves a clock on is `now + 1` (the next `step`), and the last is `endsAt`. So a 100-tick effect moves clocks on exactly 100 ticks.

### `cutGrowth(plots: Plot[], ticks: number, now: number): Plot[]`

Moves every growing plot by `−ticks`, then runs `updateGrowth(plot, now)` on the ones that moved, so crops brought to `now` are ready at once. Returns the same array when no plot was growing.

### `finishGrowth(plot: Plot): Plot | null`

Makes a growing crop ready now: `{ state: "ready", cropId }`. Returns `null` for an empty or ready plot.

`grantCoins` needs no helper: `usePowerUp` adds `amount` to `coins` itself.

## Rules

- No Phaser or browser imports. Pure: never changes its inputs.
- No randomness. Effects never draw from any stream.
- Times are ticks. No effect changes `tick` or the run timer (`TIMED_MODE_TICKS`).
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
- A crop effect never moves orders and an order effect never moves plots.
- With nothing active, returns the inputs as they are (same arrays).
- Never changes its inputs.

**`startEffect`**

- A new source is appended with `endsAt = now + durationTicks`.
- The same source again adds `durationTicks` to `endsAt` and keeps `startedAt`; the list still has one entry for it.
- A 100-tick effect moves clocks on exactly 100 steps.

**`cutGrowth` / `finishGrowth`**

- `cutGrowth` brings every growing crop `ticks` closer, clamped at `now`; a crop brought to `now` is `ready`; empty and ready plots are untouched.
- `finishGrowth` turns a growing plot ready and returns `null` for empty and ready plots.

## Open items

- [ ] Effects on one plot only (`plot` on `ActiveEffect`), for events such as Frost on one plot or a Greenhouse-protected plot. Everything is run-wide for now.
- [ ] More effect kinds for events: `blockHarvest` (Crows), `resetPlot` (Moles), `bonusCoinsNextOrder` (Generous customer). See [the events plan](#events-later).
- [ ] Should a lasting effect started again reset to its full length instead of adding time? Adding time is simpler to explain on a button ("+10 s").

## Events (later)

Events (`events.ts`, its own spec) will start lasting effects with `startEffect(active, eventId, …)` and fire instant ones through the same helpers. `tickEffects` won't need changing: it already moves every clock by the sum of what is active, whatever started it.
