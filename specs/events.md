# events.ts

Events: good and bad things that happen to a run on their own, on a schedule. Every event is **announced** first, with a warning countdown, and then **starts**: it fires one effect from [effects.md](effects.md), either instant (Rain shower, Moles) or lasting (Frost, Crows). The player can't trigger or cancel an event; the warning is their chance to prepare.

Events come only from `step`. There is no event action, so the action log doesn't change: a run with events is still fully rebuilt from its seed, config and log.

What each event does lives in **`src/data/events.json`**. The announced or running event lives in **`GameState.event`**, and lasting effects it started live in **`GameState.activeEffects`**, next to power-ups' effects.

This spec is the first slice: the scheduler, six events and their counter upgrades. Tradeoff events (Bee swarm, Festival, …), news broadcasts, Pest control and more events come later (see Open items).

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
| `effect`       | yes          | One `Effect` from [effects.md](effects.md). Not `finishGrowth` or `grantCoins`                                |
| `target`       | no           | `"plot"` when the event hits one plot. Required exactly when the effect is `stealCrop`                        |
| `durationStat` | no           | A `…Pct` modifier that scales `seconds`. Lasting events only                                                  |
| `amountStat`   | no           | A `…Pct` modifier that scales the effect's amount (`ticks` of `cutGrowth`, `coins` of `deliverBonus`)         |
| `blockStat`    | no           | A `…Chance` modifier: the % chance the event does nothing when it starts (see [Starting](#starting-an-event)) |

The three `…Stat` fields are how counter upgrades work without any rule reading an event id: the event names the stat that changes it, and the stat comes from upgrades like any other.

### Shipped events

All numbers are placeholders until playtesting.

| id                 | name              | kind | modes           | weight | warn | effect                 | lasts | target | stat fields                      |
| ------------------ | ----------------- | ---- | --------------- | ------ | ---- | ---------------------- | ----- | ------ | -------------------------------- |
| `rainShower`       | Rain shower       | good | survival, timed | 30     | 3 s  | `cutGrowth` 50 ticks   | –     | –      | `amountStat: rainCutPct`         |
| `sunnySpell`       | Sunny spell       | good | survival, timed | 20     | 3 s  | `growthRate` 150%      | 15 s  | –      | `durationStat: sunnyDurationPct` |
| `generousCustomer` | Generous customer | good | survival        | 15     | 5 s  | `deliverBonus` 3 coins | 20 s  | –      | `amountStat: deliverBonusPct`    |
| `frost`            | Frost             | bad  | survival, timed | 30     | 5 s  | `growthRate` 0%        | 8 s   | –      | `durationStat: frostDurationPct` |
| `crows`            | Crows             | bad  | survival, timed | 30     | 5 s  | `blockHarvest`         | 6 s   | –      | `durationStat: crowDurationPct`  |
| `moles`            | Moles             | bad  | survival, timed | 25     | 5 s  | `stealCrop`            | –     | plot   | `blockStat: moleBlockChance`     |

Generous customer is Survival only because Timed earns no coins.

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
- `effect` breaks the rules in [effects.md](effects.md), or is `finishGrowth` or `grantCoins`.
- `seconds` is missing for a lasting effect, present for an instant one, or not a whole number `>= 1`.
- `target` is not `"plot"` when present; it is missing on a `stealCrop` event or present on any other.
- `durationStat` is on an instant event; `amountStat` is on an effect with no amount (`growthRate`, `orderRate`, `blockHarvest`, `stealCrop`); a stat field names something that isn't a `Modifiers` stat; `durationStat` or `amountStat` names a stat that doesn't end in `Pct`; `blockStat` names one that doesn't end in `Chance`.

### `EVENTS: EventConfig`

`events.json` passed through `validateEvents` once, when the module loads. Every function below takes an optional last argument `config: EventConfig = EVENTS`.

### `gapTicks(state: GameState, config?): number`

The gap after an event ends: `eventGapTicks(levelFor(ordersCompleted))` in Survival, `timedGapTicks` in Timed, then `scalePct(…, eventGapPct)`.

### `shieldedPlots(state: GameState): number[]`

Plot indexes where `modifiersAt(upgrades, { plot, cropId: null }).shielded > 0`, ascending.

### `eventTargets(state: GameState, def: EventDef): number[]`

For a plot event, the plots it can hit, ascending: plots that are `growing` or `ready`, minus shielded plots when `kind` is `bad`. `[]` for events without a target.

### `eligibleEvents(state: GameState, kind: EventKind, config?): string[]`

Ids of `kind` that can be announced now, sorted: in `modes` for the run's mode, and with at least one target if they need one.

### `announceEvent(state: GameState, config?): [RunEvent | null, RNGState]`

Picks the next event from `state.rng.events`. Returns the event (or `null`) and the new state of the stream.

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

## In `main.ts` (see [main.md](main.md))

### Starting and ending (step 2 of `step`)

On each tick, before effects move any clocks:

1. If `event` is set and `tick === event.startsAt`, the event **starts** (see below).
2. Then, if `event` is set and `tick >= event.endsAt`, the event **ends**: `event` becomes `null` and `nextEventAt = tick + gapTicks(state)`.

An instant event starts and ends on the same tick.

### Starting an event (`startEvent(state, config?): GameState`, in `events.ts`)

`step` calls `startEvent` with the new tick; it returns `state` unchanged unless the announced event starts on that tick.

1. **Block roll.** If the event has a `blockStat` whose value is above 0, draw `roll = randomInt(rng.events, 0, 99)` and store the stream. If `roll < value`, the event does nothing more. With no `blockStat` or a value of 0, nothing is drawn.
2. **Fire the effect**, with `amount` in place of the definition's amount:

| Effect      | What happens                                                                                                                                                   |
| ----------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `cutGrowth` | `plots = cutGrowth(plots, amount, tick)`                                                                                                                       |
| `stealCrop` | If `plots[event.plot]` is `growing` or `ready`, it becomes `empty`. If the player emptied it during the warning, nothing happens and the block roll is skipped |
| lasting     | `activeEffects = startEffect(activeEffects, id, effect, tick, endsAt − startsAt, exclude)`                                                                     |

For a lasting **bad** event, `exclude` is `shieldedPlots(state)` at the start; for a good one, `[]`. A plot shielded later is not added to a running effect.

`stealCrop`'s empty-plot check comes before the block roll, so a fizzled Moles draws nothing.

### Announcing (step 8 of `step`)

After new orders, and only if the run didn't end on this step: if `allowEvents`, `event` is `null` and `tick >= nextEventAt`, call `announceEvent(state)` and store the stream. If it returns an event, store it in `event`. If it returns `null` (nothing eligible, for example a Moles-only config with every plot empty), set `nextEventAt = tick + gapTicks(state)` and try again then.

### Reading active effects in actions

- **`harvest`** returns `null` while `harvestBlocked(activeEffects, plot, tick)` (see [effects.md](effects.md)).
- **`deliver`** in Survival adds `deliverBonusAt(activeEffects, tick)` to the coins paid.

## Upgrades this unlocks (in [upgrades.md](upgrades.md))

All have `"needs": ["events"]`. `GameSystem` becomes `"powerUps" | "events"`.

| id             | name          | pools           | tier   | maxCopies | effects (common → legendary)                | target                | sellable |
| -------------- | ------------- | --------------- | ------ | --------- | ------------------------------------------- | --------------------- | -------- |
| `earlyWarning` | Early warning | survival, timed | rare   | 1         | `warnBonusSeconds` +3                       | –                     | yes      |
| `goodFortune`  | Good fortune  | survival, timed | tiered | 5         | `goodEventPct` +3, +5, +8, +12, +15         | –                     | yes      |
| `calmSkies`    | Calm skies    | survival, timed | tiered | 5         | `eventGapPct` +5, +8, +12, +18, +25         | –                     | yes      |
| `rainmaker`    | Rainmaker     | survival, timed | tiered | 3         | `rainCutPct` +20, +30, +50, +75, +100       | –                     | yes      |
| `longSummer`   | Long summer   | survival, timed | tiered | 3         | `sunnyDurationPct` +15, +25, +40, +60, +100 | –                     | yes      |
| `bigSpender`   | Big spender   | survival        | tiered | 3         | `deliverBonusPct` +20, +35, +50, +75, +100  | –                     | yes      |
| `frostCover`   | Frost cover   | survival, timed | tiered | 3         | `frostDurationPct` −10, −15, −25, −35, −50  | –                     | yes      |
| `crowDecoy`    | Crow decoy    | survival, timed | tiered | 3         | `crowDurationPct` −10, −15, −25, −35, −50   | –                     | yes      |
| `moleTraps`    | Mole traps    | survival, timed | tiered | 3         | `moleBlockChance` +10, +15, +20, +30, +40   | –                     | yes      |
| `greenhouse`   | Greenhouse    | survival, timed | epic   | 2         | `shielded` +1                               | plot, `oncePerTarget` | no       |

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
- Events never change `tick`, the run timer, `score`, `lives` or `ordersCompleted`.

## Tests (`events.test.ts`)

**`validateEvents`**

- Accepts the shipped `events.json`.
- Throws for each case in its list above, one test per case, using a small valid config with one field changed.
- Turns seconds into ticks and missing optional fields into `null`.

**`gapTicks` / `eventGapTicks`**

- Survival follows the level's row and shrinks from level to level; Timed uses `timedGapTicks`; Calm skies stretches both.

**`shieldedPlots` / `eventTargets` / `eligibleEvents`**

- A Greenhouse plot is shielded; Moles targets only plots with a crop, and never a shielded one.
- Generous customer is eligible in Survival only; Moles is not eligible with every plot empty.

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
- **Generous customer** adds its bonus to deliveries from `startsAt` to `endsAt − 1`, and not after.
- **Crows** refuse `harvest` from `startsAt` to `endsAt − 1` (but not on a shielded plot) and allow it on `endsAt`.
- **Moles** empties its plot on `startsAt`; does nothing (and draws nothing) if the plot was harvested during the warning; does nothing when the Mole traps roll hits.
- Two runs on the same seed and the same actions, one with events on and one off, create the same orders (same `rng.orders`).

**Replay (`verification.test.ts`)**

- Scripted Survival and Timed runs with events (and power-ups) on replay equal, and their final states show at least one event has run.

## Open items

- [ ] Tune every number (weights, warnings, lengths, gaps, stat caps) after playtesting.
- [ ] More events: Worms, Scarecrow, Lucky clover, Helpful neighbor, Slow day (good); Drought, Birds, Emergency order, Fake merchant, Raccoon, Rot, Fog, Mix-up, Price crash (bad). Several need new effect kinds or player actions (Drought taps, Raccoon taps).
- [ ] Tradeoff events (Bee swarm, Market day, Festival, …), which need a choice from the player.
- [ ] News broadcasts: a ticker that announces some events earlier and in words.
- [ ] Pest control, which needs an `"event"` upgrade target.
- [ ] Should a good event be allowed to overlap a bad one, or run back to back with no gap?
- [ ] Good omen power-up: announce a random good event now (needs `announceEvent` to take a forced kind).
