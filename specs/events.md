# events.ts

Events: good and bad things that happen to a run on their own, on a schedule. Every event is **announced** first, with a warning countdown, and then **starts**: it fires one effect from [effects.md](effects.md), either instant (Rain shower, Moles) or lasting (Frost, Crows). The player can't trigger or cancel an event; the warning is their chance to prepare.

Events come only from `step`. There is no event action, so the action log doesn't change: a run with events is still fully rebuilt from its seed, config and log.

What each event does lives in **`src/data/events.json`**. The announced or running event lives in **`GameState.event`**, and lasting effects it started live in **`GameState.activeEffects`**, next to power-ups' effects.

This spec covers the scheduler, thirteen events and their counter upgrades. Tradeoff events (Bee swarm, Festival, …), news broadcasts and the events that need new player actions or systems come later (see Open items).

## Concepts

- **Announcement.** The tick an event is chosen. From then on the player sees its name, its countdown and, for a plot event, its plot.
- **Warning.** The ticks between announcement and start: the event's `warnSeconds`, plus the Early warning upgrade.
- **Start.** The tick the event fires. Instant events are over on the same tick; lasting ones run for their length.
- **Gap.** The ticks from the end of one event to the next announcement. In Survival it shrinks as the level rises.
- **One at a time.** At most one event is announced or running. The next one is only scheduled once it ends.
- **Events allowed.** A run's `GameConfig.allowEvents`, copied into `GameState.allowEvents`. With it off nothing is ever announced and upgrades that only matter for events are never offered. The game turns it on; tests and replays made before events keep it off, so their results don't change.
- **Shielded plot.** A plot with the Greenhouse upgrade. Bad events never target it, and bad lasting effects skip it.

## `src/data/events.json`

```json
{
    "firstEventSeconds": 30,
    "timedGapSeconds": 40,
    "events": [
        {
            "id": "frost",
            "name": "Frost",
            "kind": "bad",
            "modes": ["survival", "timed"],
            "weight": 30,
            "warnSeconds": 5,
            "seconds": 8,
            "effect": { "kind": "growthRate", "pct": 0 },
            "durationStat": "frostDurationPct"
        }
    ]
}
```

| Field               | Meaning                                                                                        |
| ------------------- | ---------------------------------------------------------------------------------------------- |
| `firstEventSeconds` | Seconds from the start of a run to the first announcement. Whole number `>= 1`                 |
| `timedGapSeconds`   | The gap between events in Timed. Whole number `>= 1`. Survival reads its gap per level (below) |
| `events`            | Non-empty list of event definitions                                                            |

Each event:

| Field          | Required     | Meaning                                                                                                       |
| -------------- | ------------ | ------------------------------------------------------------------------------------------------------------- |
| `id`           | yes          | Unique id, stored in `GameState.event` and used as the `source` of its effect. Must not be a power-up id      |
| `name`         | yes          | Shown on the banner                                                                                           |
| `kind`         | yes          | `"good"` or `"bad"`                                                                                           |
| `modes`        | yes          | Non-empty list of `survival`, `timed`, no repeats. It only happens in these modes                             |
| `weight`       | yes          | Relative chance among events of the same kind. Whole number `>= 1`                                            |
| `warnSeconds`  | yes          | Seconds of warning. Whole number `>= 1`                                                                       |
| `seconds`      | lasting only | How long its effect lasts. Whole number `>= 1`                                                                |
| `effect`       | yes          | One `Effect` from [effects.md](effects.md). Not one of the power-up-only kinds (see `validateEvents`)         |
| `target`       | no           | `"plot"` when the event hits one plot. Required exactly when the effect is `stealCrop`                        |
| `durationStat` | no           | A `…Pct` modifier that scales `seconds`. Lasting events only                                                  |
| `amountStat`   | no           | A `…Pct` modifier that scales the effect's amount (`ticks` of `cutGrowth`, `coins` of `tipOrder`)             |
| `blockStat`    | no           | A `…Chance` modifier: the % chance the event does nothing when it starts (see [Starting](#starting-an-event)) |
| `banStat`      | no           | A `…Ban` modifier: while it is above 0 the event is never announced (Pest control)                            |

The four `…Stat` fields are how counter upgrades work without any rule reading an event id: the event names the stat that changes it, and the stat comes from upgrades like any other.

### Shipped events

All numbers are placeholders until playtesting.

| id                 | name              | kind | modes           | weight | warn | effect                 | lasts | target | stat fields                      |
| ------------------ | ----------------- | ---- | --------------- | ------ | ---- | ---------------------- | ----- | ------ | -------------------------------- |
| `rainShower`       | Rain shower       | good | survival, timed | 30     | 3 s  | `cutGrowth` 50 ticks   | –     | –      | `amountStat: rainCutPct`         |
| `sunnySpell`       | Sunny spell       | good | survival, timed | 20     | 3 s  | `growthRate` 150%      | 15 s  | –      | `durationStat: sunnyDurationPct` |
| `generousCustomer` | Generous customer | good | survival, timed | 15     | 5 s  | `tipOrder` 10 coins    | –     | –      | `amountStat: deliverBonusPct`    |
| `frost`            | Frost             | bad  | survival, timed | 30     | 5 s  | `growthRate` 0%        | 8 s   | –      | `durationStat: frostDurationPct` |
| `crows`            | Crows             | bad  | survival, timed | 30     | 5 s  | `blockHarvest` 2 plots | 6 s   | –      | `durationStat: crowDurationPct`  |
| `moles`            | Moles             | bad  | survival, timed | 25     | 5 s  | `stealCrop`            | –     | plot   | `blockStat: moleBlockChance`     |
| `slowDay`          | Slow day          | good | survival, timed | 15     | 3 s  | `orderRate` 50%        | 15 s  | –      | –                                |
| `worms`            | Worms             | good | survival, timed | 15     | 3 s  | `harvestBonus` 1 crop  | 20 s  | –      | `amountStat: wormBonusPct`       |
| `helpfulNeighbor`  | Helpful neighbor  | good | survival, timed | 10     | 5 s  | `harvestAll`           | –     | –      | –                                |
| `birds`            | Birds             | bad  | survival, timed | 20     | 5 s  | `seedPlots` 3 plots    | –     | –      | `amountStat: birdPlotsPct`       |
| `emergencyOrder`   | Emergency order   | bad  | survival, timed | 15     | 5 s  | `addOrder` 50% time    | –     | –      | `amountStat: emergencyTimePct`   |
| `rot`              | Rot               | bad  | survival, timed | 15     | 5 s  | `rotStorage` 30%       | –     | –      | `amountStat: rotPct`             |
| `fog`              | Fog               | bad  | survival, timed | 15     | 3 s  | `fog`                  | 10 s  | –      | `durationStat: fogDurationPct`   |

Crows also have `banStat: crowBan` (Pest control). They land on up to 2 plots that hold a crop when they start, and stop each one being harvested until the player taps it to scare them off (`scareCrows`) or they leave on `endsAt`. They can't be scared during the warning, which is the player's chance to harvest first.

Generous customer was Survival only when it shipped, because Timed earned no coins then; now that Timed orders pay coins it is in both modes. Since the Day 8b design change it tips **one random open order** (`tipOrder`) instead of adding coins to every delivery for 20 s; the 10 coins are a placeholder, raised from 3 because one order now gets the whole bonus.

| Constant (in `events.json`) | Value |
| --------------------------- | ----- |
| `firstEventSeconds`         | 30    |
| `timedGapSeconds`           | 40    |

## Survival gap (in [difficulty.md](difficulty.md))

Each row of `difficulty.json`'s `levels` gets an `eventGapSeconds` field (whole number `>= 1`), which never goes up from one level to the next. Shipped: 45, 40, 35, 30, 26, 22, 18.

`difficulty.ts` adds `eventGapTicks(level, config?)`: `eventGapSeconds × TICKS_PER_SECOND` for the level's row (the last row past the end).

## Types (in [types.md](types.md))

```ts
type EventKind = "good" | "bad"

type EventDef = {
    id: string
    name: string
    kind: EventKind
    modes: GameMode[]
    weight: number
    warnTicks: number // warnSeconds × TICKS_PER_SECOND
    durationTicks: number | null // seconds × TICKS_PER_SECOND for lasting effects, null for instant
    effect: Effect
    target: "plot" | null
    durationStat: ModifierStat | null
    amountStat: ModifierStat | null
    blockStat: ModifierStat | null
    banStat: ModifierStat | null
}

type EventConfig = {
    firstEventTicks: number
    timedGapTicks: number
    events: Record<string, EventDef> // id -> definition
}

// The announced or running event.
type RunEvent = {
    id: string
    announcedAt: number
    startsAt: number // the tick it fires on
    endsAt: number // last tick its effect works; equals startsAt for instant events
    plot: number | null // the target, for plot events
    amount: number | null // effect amount after amountStat, fixed at announcement
}
```

`GameState` gains:

| Field         | Starting value           | Meaning                                         |
| ------------- | ------------------------ | ----------------------------------------------- |
| `allowEvents` | `config.allowEvents`     | Copied from the config so the rules can read it |
| `event`       | `null`                   | The announced or running `RunEvent`             |
| `nextEventAt` | `EVENTS.firstEventTicks` | The first tick a new event may be announced on  |

`GameConfig` gains `allowEvents: boolean`.

## Exports

### `validateEvents(raw: unknown): EventConfig`

Checks a parsed JSON value and returns it in the typed shape. Throws an `Error` naming the bad entry when:

- `raw` is not an object; `firstEventSeconds` or `timedGapSeconds` is not a whole number `>= 1`; `events` is not a non-empty list.
- `id` or `name` is not a non-empty string; an `id` is used twice or is also a power-up id.
- `kind` is not `good` or `bad`.
- `modes` is empty, has a repeat, or has a value other than `survival` or `timed`.
- `weight` or `warnSeconds` is not a whole number `>= 1`.
- `effect` breaks the rules in [effects.md](effects.md), or is a power-up-only kind (`finishGrowth`, `grantCoins`, `finishAll`, `clearField`, `fillOrder`, `fillAllOrders`, `goodEvent`). `addOrder`'s `timePct` and `rotStorage`'s `pct` must be from 1 to 100.
- `seconds` is missing for a lasting effect, present for an instant one, or not a whole number `>= 1`.
- `target` is not `"plot"` when present; it is missing on a `stealCrop` event or present on any other.
- `durationStat` is on an instant event; `amountStat` is on an effect with no amount (`growthRate`, `orderRate`, `blockHarvest`, `stealCrop`, `fog`, `harvestAll`); a stat field names something that isn't a `Modifiers` stat; `durationStat` or `amountStat` names a stat that doesn't end in `Pct`; `blockStat` names one that doesn't end in `Chance`; `banStat` names one that doesn't end in `Ban`.

### `EVENTS: EventConfig`

`events.json` passed through `validateEvents` once, when the module loads. Every function below takes an optional last argument `config: EventConfig = EVENTS`.

### `gapTicks(state: GameState, config?): number`

The gap after an event ends: `eventGapTicks(levelFor(ordersCompleted))` in Survival, `timedGapTicks` in Timed, then `scalePct(…, eventGapPct)`.

### `shieldedPlots(state: GameState): number[]`

Plot indexes where `modifiersAt(upgrades, { plot, cropId: null }).shielded > 0`, ascending.

### `eventTargets(state: GameState, def: EventDef): number[]`

For a plot event, the plots it can hit, ascending: plots that are `growing` or `ready`, minus shielded plots when `kind` is `bad`. `[]` for events without a target.

### `eligibleEvents(state: GameState, kind: EventKind, config?): string[]`

Ids of `kind` that can be announced now, sorted: in `modes` for the run's mode, not banned (`banStat` is null or its value is 0), and with at least one target if they need one.

### `announceEvent(state: GameState, config?, kind: EventKind | null = null): [RunEvent | null, RNGState]`

Picks the next event from `state.rng.events`. Returns the event (or `null`) and the new state of the stream.

With `kind` given (the Good omen power-up), step 2 is skipped: only `eligibleEvents(state, kind)` are used, and if there are none the result is `[null, rng.events]` with no draw. So a forced announcement uses one draw, or two for a plot event.

1. If both `eligibleEvents(state, "good")` and `(state, "bad")` are empty: `[null, rng.events]`, no draw.
2. **Kind.** `roll = randomInt(rng.events, 0, 99)`; good when `roll < goodEventPct`. If that kind has no eligible events, the other kind is used. One draw.
3. **Event.** `r = randomInt(0, W − 1)`, where `W` is the sum of the weights of that kind's eligible ids. Walking the sorted ids and subtracting each weight, the id where `r` drops below its weight is chosen. One draw.
4. **Target.** For a plot event, `pick` one of `eventTargets`. One draw.
5. With `now = state.tick` and `warn = warnTicks + warnBonusSeconds × TICKS_PER_SECOND`:
    - `startsAt = now + warn`
    - `endsAt = startsAt + scalePct(durationTicks, durationStat)` for a lasting event, `startsAt` for an instant one (no `durationStat` means 100%)
    - `amount` = the effect's amount scaled by `amountStat` (`scalePct`), or `null` for effects without one.

Rules:

- Two draws per announcement, three for a plot event. Never more, never fewer.
- Draws only from `rng.events`.
- Every number the event uses is fixed here, so the banner can show it and an upgrade picked during the warning doesn't change an event already announced. `blockStat` is the one exception: it is rolled when the event starts (see below).

### `buildEvent(state: GameState, def: EventDef, plot: number | null): RunEvent`

Step 5 of `announceEvent` on its own: the `RunEvent` for `def` announced on `state.tick`. The debug menu uses it too (see [debug.md](debug.md)).

## In `main.ts` (see [main.md](main.md))

### Starting and ending (step 2 of `step`)

On each tick, before effects move any clocks:

1. If `event` is set and `tick === event.startsAt`, the event **starts** (see below).
2. Then, if `event` is set and `tick >= event.endsAt`, the event **ends**: `event` becomes `null` and `nextEventAt = tick + gapTicks(state)`.

An instant event starts and ends on the same tick.

### Starting an event (`startEvent(state, crops, rules, config?): GameState`, in `events.ts`)

`step` calls `startEvent` with the new tick, the crop table and the current `orderRules`; it returns `state` unchanged unless the announced event starts on that tick.

1. **Block roll.** If the event has a `blockStat` whose value is above 0, draw `roll = randomInt(rng.events, 0, 99)` and store the stream. If `roll < value`, the event does nothing more. With no `blockStat` or a value of 0, nothing is drawn.
2. **Fire the effect**, with `amount` in place of the definition's amount:

| Effect         | What happens                                                                                                                                                                                                                                                                                                   |
| -------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `cutGrowth`    | `plots = cutGrowth(plots, amount, tick)`                                                                                                                                                                                                                                                                       |
| `stealCrop`    | If `plots[event.plot]` is `growing` or `ready`, it becomes `empty`. If the player emptied it during the warning, nothing happens and the block roll is skipped                                                                                                                                                 |
| `harvestAll`   | Every `ready` plot is harvested into `inventory` (`yield + yieldBonus` from `modifiersAt`; no bumper roll and no drop, so no draws) and becomes `empty`. With `neighborReplant` above 0 it is replanted with the same crop on this tick (growth from `plantGrowthPct`)                                         |
| `seedPlots`    | Up to `amount` of the `empty`, unshielded plots get a crop planted on this tick (growth from `plantGrowthPct`). For each: `pick` a plot from those still free, then `pick` a crop id from the sorted crop table, both from `rng.events`. With no free plot nothing is drawn                                    |
| `addOrder`     | `createOrder(nextOrderId, tick, rng.events, crops, rules)` with `orderTicks = scalePct(rules.orderTicks, amount)`, appended to `orders` even past `maxOpenOrders`; `nextOrderId` goes up by 1. Two draws                                                                                                       |
| `blockHarvest` | Crows land: from the `growing` or `ready` plots not in `exclude`, `pick` up to `amount` plots one at a time from those still free, all from `rng.events`, then `startEffect(…, exclude, only)` with the chosen plots ascending. With no such plot nothing happens and nothing is drawn                         |
| `rotStorage`   | Each stored crop loses `floor(amount_held × amount / 100)`; crops that reach 0 are removed (`rotStorage(inventory, pct)`)                                                                                                                                                                                      |
| `tipOrder`     | From the open orders not failing on this tick, in board order, `pick` one with `randomInt(rng.events, 0, n − 1)` and add `amount` to its `tip` (`tipOrder(state, coins)`). Filling it pays the tip on top of the usual coins (see [main.md](main.md)). With no open order nothing happens and nothing is drawn |
| other lasting  | `activeEffects = startEffect(activeEffects, id, effect, tick, endsAt − startsAt, exclude)`; `deliverBonus` and `harvestBonus` use `amount` as their coins or crops                                                                                                                                             |

For a lasting **bad** event, `exclude` is `shieldedPlots(state)` at the start; for a good one, `[]`. A plot shielded later is not added to a running effect.

`stealCrop`'s empty-plot check, and Crows' check for a plot with a crop, come before the block roll, so a fizzled Moles or Crows draws nothing.

### Announcing (step 8 of `step`)

After new orders, and only if the run didn't end on this step: if `allowEvents`, `event` is `null` and `tick >= nextEventAt`, call `announceEvent(state)` and store the stream. If it returns an event, store it in `event`. If it returns `null` (nothing eligible, for example a Moles-only config with every plot empty), set `nextEventAt = tick + gapTicks(state)` and try again then.

### Reading active effects in actions

- **`harvest`** returns `null` while `harvestBlocked(activeEffects, plot, tick)` (see [effects.md](effects.md)).
- **`scareCrows`** clears the crows from one plot (see [main.md](main.md)).
- **`deliver`** adds `deliverBonusAt(activeEffects, tick)` (Gold rush) and the order's `tip` (Generous customer) to the coins paid.

## Upgrades this unlocks (in [upgrades.md](upgrades.md))

All have `"needs": ["events"]`. `GameSystem` becomes `"powerUps" | "events"`.

| id             | name          | pools           | tier   | maxCopies | effects (common → legendary)                | target                | sellable |
| -------------- | ------------- | --------------- | ------ | --------- | ------------------------------------------- | --------------------- | -------- |
| `earlyWarning` | Early warning | survival, timed | rare   | 1         | `warnBonusSeconds` +3                       | –                     | yes      |
| `goodFortune`  | Good fortune  | survival, timed | tiered | 5         | `goodEventPct` +3, +5, +8, +12, +15         | –                     | yes      |
| `calmSkies`    | Calm skies    | survival, timed | tiered | 5         | `eventGapPct` +5, +8, +12, +18, +25         | –                     | yes      |
| `rainmaker`    | Rainmaker     | survival, timed | tiered | 3         | `rainCutPct` +20, +30, +50, +75, +100       | –                     | yes      |
| `longSummer`   | Long summer   | survival, timed | tiered | 3         | `sunnyDurationPct` +15, +25, +40, +60, +100 | –                     | yes      |
| `bigSpender`   | Big spender   | survival, timed | tiered | 3         | `deliverBonusPct` +20, +35, +50, +75, +100  | –                     | yes      |
| `frostCover`   | Frost cover   | survival, timed | tiered | 3         | `frostDurationPct` −10, −15, −25, −35, −50  | –                     | yes      |
| `crowDecoy`    | Crow decoy    | survival, timed | tiered | 3         | `crowDurationPct` −10, −15, −25, −35, −50   | –                     | yes      |
| `moleTraps`    | Mole traps    | survival, timed | tiered | 3         | `moleBlockChance` +10, +15, +20, +30, +40   | –                     | yes      |
| `greenhouse`   | Greenhouse    | survival, timed | epic   | 2         | `shielded` +1                               | plot, `oncePerTarget` | no       |

The second batch adds Pest control, Worm farm, Good neighbors, Bird net, Root cellar, Lantern and Calm nerves, listed with their stats in [upgrades.md](upgrades.md#shipped-with-the-second-batch).

New stats:

| Stat               | base | min | max | Read by                                         |
| ------------------ | ---- | --- | --- | ----------------------------------------------- |
| `warnBonusSeconds` | 0    | 0   | 5   | `announceEvent`                                 |
| `goodEventPct`     | 40   | 0   | 70  | `announceEvent` (kind roll)                     |
| `eventGapPct`      | 100  | 100 | 200 | `gapTicks`                                      |
| `rainCutPct`       | 100  | 100 | 300 | Rain shower's `amountStat`                      |
| `sunnyDurationPct` | 100  | 100 | 250 | Sunny spell's `durationStat`                    |
| `deliverBonusPct`  | 100  | 100 | 250 | Generous customer's `amountStat`                |
| `frostDurationPct` | 100  | 25  | 100 | Frost's `durationStat`                          |
| `crowDurationPct`  | 100  | 25  | 100 | Crows' `durationStat`                           |
| `moleBlockChance`  | 0    | 0   | 75  | Moles' `blockStat`                              |
| `shielded`         | 0    | 0   | 1   | `shieldedPlots`, through `modifiersAt` per plot |

`shielded` joins the stats a targeted upgrade may use (read per plot). Greenhouse is not sellable for the same reason as other plot upgrades.

## Rules

- No Phaser or browser imports. Pure: never changes its inputs.
- Draws only from `rng.events`: in `announceEvent`, and in the block roll when an event starts. No draw depends on another stream, so events never change which orders come next, which upgrades are offered, or which power-ups drop.
- No rule reads an event id except to look up its definition. What an event does is its `effect` and its stat fields.
- Events never change `tick`, the run timer, `score`, `lives`, `coins` or `ordersCompleted`. They can change `plots` (Rain shower, Moles, Helpful neighbor, Birds), `inventory` (Helpful neighbor, Rot) and `orders` / `nextOrderId` (Emergency order).
- Birds and Emergency order draw from `rng.events` when they start; the number of Birds draws depends on how many plots are free, which is fixed by the state, so replays stay exact.

## Tests (`events.test.ts`)

**`validateEvents`**

- Accepts the shipped `events.json`.
- Throws for each case in its list above, one test per case, using a small valid config with one field changed.
- Turns seconds into ticks and missing optional fields into `null`.

**`gapTicks` / `eventGapTicks`**

- Survival follows the level's row and shrinks from level to level; Timed uses `timedGapTicks`; Calm skies stretches both.

**`shieldedPlots` / `eventTargets` / `eligibleEvents`**

- A Greenhouse plot is shielded; Moles targets only plots with a crop, and never a shielded one.
- Generous customer is eligible in both modes; Moles is not eligible with every plot empty.

**`announceEvent`**

- No draw when nothing is eligible; two draws for an untargeted event and three for Moles; only `rng.events` changes.
- The same state gives the same event.
- `startsAt`, `endsAt` and `amount` follow the warning, length and stat rules, including Early warning, Long summer, Frost cover and Rainmaker.
- With `goodEventPct` 0 every event is bad, and the other kind is used when the rolled kind has nothing eligible.
- Over many seeds, the good/bad split and the split within a kind are close to `goodEventPct` and the weights (a loose bound).

**Lifecycle through `step` (also in `events.test.ts`)**

- With events off, nothing is ever announced and `rng.events` never moves.
- The first event is announced on `firstEventTicks`; the next one `gapTicks` after the previous one ends; never two at once.
- Nothing is announced, started or ended while an upgrade offer is open; the warning resumes where it stopped.
- **Rain shower** brings every growing crop `amount` ticks closer on its start tick, and crops brought to that tick are ready on it.
- **Sunny spell** and **Frost** move crops by the rate rule for exactly their length; Frost skips a shielded plot.
- **Generous customer** has no length; on its start tick it tips one open order (one draw from `rng.events`), and filling that order pays the tip while the others pay as usual. With no open order it does nothing and draws nothing.
- **Crows** land on up to 2 plots holding a crop (never a shielded or empty one), drawing one `pick` per plot from `rng.events`; with no crop on the field they do nothing and draw nothing. They refuse `harvest` on those plots from `startsAt` to `endsAt − 1`, never on the others, and allow it on `endsAt`.
- **Scaring Crows:** `scareCrows` on a crow plot lets it be harvested on the same tick while the other crow plot stays blocked; scaring the last one removes the effect; it is refused on a plot without crows and during the warning. A run that scares crows replays equal.
- **Moles** empties its plot on `startsAt`; does nothing (and draws nothing) if the plot was harvested during the warning; does nothing when the Mole traps roll hits.
- Two runs on the same seed and the same actions, one with events on and one off, create the same orders (same `rng.orders`).

**Second batch (also in `events.test.ts`)**

- `validateEvents` accepts each new kind (`tipOrder` included) and `banStat`, and throws for a zero or out-of-range amount (`tipOrder` of 0 coins), `seconds` on `tipOrder`, a power-up-only kind, Fog without seconds, an `amountStat` on Fog, and a `banStat` that isn't a `…Ban` stat.
- Pest control removes Crows from `eligibleEvents`. A forced kind uses one draw and only that kind; with nothing of that kind eligible it gives `null` and draws nothing.
- **Slow day** holds open orders' timers by half its length.
- **Worms** add 1 crop to harvests while they work (3 with a legendary Worm farm) and none after.
- **Helpful neighbor** harvests every ready plot without touching `rng.harvest` or `rng.drops`; with Good neighbors the plots are replanted.
- **Birds** seed 3 free plots with two draws each, skip a Greenhouse plot and ready plots, seed 1 with Bird net at its cap, and only as many as are free.
- **Emergency order** adds an order past the limit with `scalePct(orderTicks, 50)` (75% with a legendary Calm nerves) and leaves `rng.orders` alone.
- **Rot** removes `floor(30%)` of each crop (`floor(15%)` with a legendary Root cellar).
- **Fog** starts a `fog` effect for its length, halved by a legendary Lantern.

**Replay (`verification.test.ts`)**

- Scripted Survival and Timed runs with events (and power-ups) on replay equal, and their final states show at least one event has run.

## Open items

- [ ] Tune every number (weights, warnings, lengths, gaps, stat caps) after playtesting.
- [x] Slow day, Worms, Helpful neighbor (good); Birds, Emergency order, Rot, Fog (bad).
- [ ] Still to come: Scarecrow (its guard would have to outlast its own event, since events don't overlap), Lucky clover and Four-leaf (a per-plot mark that lasts until the next harvest), Drought and Raccoon (tap actions), Mix-up (re-rolling an open order), Fake merchant (the shop), Price crash (selling crops).
- [ ] Should Birds' seeds be the crops orders want, or random as now? Should the player be able to dig a seeded plot up without Clean slate?
- [ ] Tradeoff events (Bee swarm, Market day, Festival, …), which need a choice from the player.
- [ ] News broadcasts: a ticker that announces some events earlier and in words.
- [x] Pest control, as a `banStat` (`crowBan`) on Crows instead of an `"event"` upgrade target. Banning Frost or Moles too would be one more stat each.
- [ ] Should a good event be allowed to overlap a bad one, or run back to back with no gap?
- [x] Good omen power-up: announce a random good event now (`announceEvent` takes a forced kind).
- [x] Generous customer tips one random open order (`tipOrder`, the order's `tip` field) instead of a 20 s bonus on every delivery (Day 8b design change).
- [x] Generous customer and Big spender are in both modes, now that Timed orders pay coins.
- [ ] Generous customer's tip is 10 coins for now. Tune it, and decide whether the tipped order should be picked at announcement (so the warning names it) instead of at the start.
