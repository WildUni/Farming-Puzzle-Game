# modes.ts

Per-mode rules: how a run starts and when it ends. The numbers live in `src/data/modes.json`, so changing a mode never needs a code change. `modes.ts` loads that file, checks it, and turns seconds into ticks.

Survival's difficulty curve, coins and life prices stay in `difficulty.json` (see [difficulty.md](difficulty.md)). Puzzle has no entry yet, because it has no rules yet.

## `src/data/modes.json`

```json
{
    "survival": { "startLives": 3, "maxLives": 3, "storageCap": 25 },
    "timed": {
        "runSeconds": 300,
        "openOrders": 3,
        "storageCap": 30,
        "finaleSeconds": 30,
        "pairSeconds": 3,
        "combo": { "stepPct": 25, "capPct": 300, "windowSeconds": 20 },
        "rush": {
            "atSeconds": [75, 160, 245],
            "warnSeconds": 5,
            "orders": 3,
            "timePct": 50,
            "valuePct": 150
        }
    }
}
```

| Field                       | Meaning                                                                                   |
| --------------------------- | ----------------------------------------------------------------------------------------- |
| `survival.startLives`       | Lives a Survival run starts with. The run ends when lives reach 0                         |
| `survival.maxLives`         | Most lives a Survival run can hold (Extra heart adds to it). Whole number `>= startLives` |
| `survival.storageCap`       | Most crops a Survival run can hold (Bigger barn adds to it). Whole number `>= 1`          |
| `timed.storageCap`          | Most crops a Timed run can hold. Separate from Survival's so the two can be tuned apart   |
| `timed.runSeconds`          | Length of a Timed run. Timed has no lives and ends when this runs out                     |
| `timed.openOrders`          | `step` keeps this many orders open in Timed, so a run starts with this many               |
| `timed.finaleSeconds`       | Grand finale: the run's last stretch, in seconds, that scores more. `1` to `runSeconds`   |
| `timed.pairSeconds`         | Double delivery: a fill this soon after an unpaired fill pairs with it. `>= 1`            |
| `timed.combo.stepPct`       | Percent the score multiplier climbs for each order filled in a row                        |
| `timed.combo.capPct`        | Highest multiplier, in percent. Whole number `>= 100`                                     |
| `timed.combo.windowSeconds` | Time after a fill to fill the next order before the streak breaks                         |
| `timed.rush.atSeconds`      | Times a rush wave starts, from the run start. Ascending, each `>= 1` and `< runSeconds`   |
| `timed.rush.warnSeconds`    | Warning shown before each wave. `>= 0`, and shorter than the gap before every wave        |
| `timed.rush.orders`         | Rush orders a wave adds at once                                                           |
| `timed.rush.timePct`        | A rush order's time limit, in % of the usual order time (1 to 100)                        |
| `timed.rush.valuePct`       | A rush order's value, in % of what the same order would be worth normally                 |

The combo and rush numbers are placeholders until a Timed tuning pass.

Lengths in the JSON are in seconds, like `powerups.json` and `events.json`; the loader turns them into ticks.

## Types

```ts
type SurvivalMode = { startLives: number; maxLives: number; storageCap: number }
type ComboRules = { stepPct: number; capPct: number; windowTicks: number }
type RushRules = {
    atTicks: number[]
    warnTicks: number
    orders: number
    timePct: number
    valuePct: number
}
type TimedMode = {
    runTicks: number
    openOrders: number
    storageCap: number
    finaleTicks: number
    pairTicks: number
    combo: ComboRules
    rush: RushRules
}
type ModesConfig = { survival: SurvivalMode; timed: TimedMode }
```

## Exports

### `validateModes(raw: unknown): ModesConfig`

Checks a parsed JSON value and returns it typed, with `timed.runTicks = runSeconds × TICKS_PER_SECOND`. Throws an `Error` naming the bad field when:

- `survival` or `timed` is not an object.
- `survival.startLives` is not a whole number `>= 1`.
- `survival.maxLives` is not a whole number `>= startLives`.
- `survival.storageCap` or `timed.storageCap` is not a whole number `>= 1`.
- `timed.runSeconds` or `timed.openOrders` is not a whole number `>= 1`.
- `timed.finaleSeconds` is not a whole number `>= 1` or is above `runSeconds`; `timed.pairSeconds` is not a whole number `>= 1`.
- `timed.combo` is not an object; `stepPct` or `windowSeconds` is not a whole number `>= 1`; `capPct` is not a whole number `>= 100`.
- `timed.rush` is not an object; `atSeconds` is not an array of whole numbers, strictly ascending, each `>= 1` and `< runSeconds` (an empty array means no waves); `warnSeconds` is not a whole number `>= 0`, or is not shorter than the first wave's time or the gap between two waves; `orders`, `timePct` or `valuePct` is not a whole number `>= 1`; `timePct` is above 100.

`combo.windowTicks = windowSeconds × TICKS_PER_SECOND`; `rush.atTicks` and `rush.warnTicks` are the seconds times `TICKS_PER_SECOND`.

A bad config is a setup mistake, not a player move, so this throws instead of returning `null`.

### `MODES: ModesConfig`

`src/data/modes.json` passed through `validateModes` once, when the module loads.

### `comboPct(combo: number, rules: ComboRules = MODES.timed.combo, stepBonusPct = 0, startPct = 0): number`

The score multiplier, in percent, for the next order filled when `combo` orders have already been filled in a row: `min(100 + startPct + combo × (stepPct + stepBonusPct), capPct)`. The two bonuses are Combo builder's `comboStepBonusPct` and Head start's `comboStartPct`; `comboPctFor` in [scoring.md](scoring.md) passes them in. Whole percents keep the score a whole number (`completeOrder` rounds down).

### `rushWaveAt(tick: number, rules: RushRules = MODES.timed.rush): number | null`

The index (in `atTicks`) of the rush wave that starts on `tick`, or `null` when none does.

### `upcomingRushWave(tick: number, rules: RushRules = MODES.timed.rush): { index: number; startsAt: number } | null`

The wave whose warning is showing on `tick`: the first wave with `startsAt - warnTicks <= tick < startsAt`. `null` outside every warning (and always with `warnTicks` 0). The screen uses it for the warning banner.

Both work from `tick` alone, so `GameState` stores nothing about waves.

## Where it is read

- `createGame`: `lives` starts at `MODES.survival.startLives` in Survival, `0` otherwise.
- `maxLivesFor`: `MODES.survival.maxLives` plus Extra heart.
- `storageCap` (economy): each mode's `storageCap` plus Bigger barn.
- `isRunOver` (in `step`): Timed ends on tick `MODES.timed.runTicks`.
- `orderRules`: Timed keeps `MODES.timed.openOrders` orders open.
- `completeOrder` and `step`: the Timed combo (see [main.md](main.md)).
- `step`: Timed rush waves (`rushWaveAt`, see [main.md](main.md)).
- The screen: the Timed countdown, the mode button text and the rush wave banner (`upcomingRushWave`).

## Rules

- No Phaser or browser imports. The JSON import is bundled by Vite and loaded by Vitest.
- Pure: nothing here reads the clock or draws random numbers.

## Tests (`modes.test.ts`)

- Accepts the shipped `modes.json`, with `runTicks = runSeconds × TICKS_PER_SECOND`.
- Ships 3 starting lives, a 300 s Timed run and 3 open Timed orders.
- Accepts a valid config.
- Throws for each bad field listed above.
- `comboPct` (in `main.test.ts`): 100 with no streak, climbs by `stepPct`, stops at `capPct`.
- Ships rush waves inside the run, and accepts an empty `atSeconds`.
- `rushWaveAt`: the wave's index on each start tick, `null` on the ticks either side.
- `upcomingRushWave`: `null` before the warning, the wave from `startsAt - warnTicks` to `startsAt - 1`, `null` on `startsAt`; never with `warnTicks` 0.

## Open items

- [ ] Life price rule per mode: rises per life bought, or scales with elapsed time. Per life only for now; the time rule is likely to be dropped (see [economy.md](economy.md)).
- [x] `survival.storageCap` and `timed.storageCap` (Day 6): each mode's storage limit, kept separate so they can be tuned apart (see [economy.md](economy.md)). Placeholders 25 and 30 until the Day 6 tuning pass.
- [x] Timed combo numbers (placeholders: +25% per fill, up to ×3, 20 s window).
- [x] Rush wave numbers (placeholders: 3 waves at 75 s, 160 s and 245 s, 5 s warning, 3 orders each at half time and 150% value).
- [x] Rush pay (Timed upgrade): `rushValuePct` is added to `rush.valuePct` (see [main.md](main.md)).
- [x] Combo builder and Head start: `comboPct` takes their bonuses. Combo keeper forgives failed orders in `step` (see [main.md](main.md)).
- [x] `finaleSeconds` (Grand finale, placeholder 30 s, from the design doc) and `pairSeconds` (Double delivery, placeholder 3 s).
- [ ] Combo freeze (Day 9): a lasting effect that pushes `comboEndsAt` back each tick, like Order freeze.
- [ ] Puzzle's entry once it has an end rule.
