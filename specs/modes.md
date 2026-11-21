# modes.ts

Per-mode rules: how a run starts and when it ends. The numbers live in `src/data/modes.json`, so changing a mode never needs a code change. `modes.ts` loads that file, checks it, and turns seconds into ticks.

Survival's difficulty curve, coins and life prices stay in `difficulty.json` (see [difficulty.md](difficulty.md)). Puzzle has no entry yet, because it has no rules yet.

## `src/data/modes.json`

```json
{
    "survival": { "startLives": 3, "maxLives": 3 },
    "timed": {
        "runSeconds": 300,
        "openOrders": 3,
        "combo": { "stepPct": 25, "capPct": 300, "windowSeconds": 20 }
    }
}
```

| Field                       | Meaning                                                                                   |
| --------------------------- | ----------------------------------------------------------------------------------------- |
| `survival.startLives`       | Lives a Survival run starts with. The run ends when lives reach 0                         |
| `survival.maxLives`         | Most lives a Survival run can hold (Extra heart adds to it). Whole number `>= startLives` |
| `timed.runSeconds`          | Length of a Timed run. Timed has no lives and ends when this runs out                     |
| `timed.openOrders`          | `step` keeps this many orders open in Timed, so a run starts with this many               |
| `timed.combo.stepPct`       | Percent the score multiplier climbs for each order filled in a row                        |
| `timed.combo.capPct`        | Highest multiplier, in percent. Whole number `>= 100`                                     |
| `timed.combo.windowSeconds` | Time after a fill to fill the next order before the streak breaks                         |

The combo numbers are placeholders until a Timed tuning pass.

Lengths in the JSON are in seconds, like `powerups.json` and `events.json`; the loader turns them into ticks.

## Types

```ts
type SurvivalMode = { startLives: number; maxLives: number }
type ComboRules = { stepPct: number; capPct: number; windowTicks: number }
type TimedMode = { runTicks: number; openOrders: number; combo: ComboRules }
type ModesConfig = { survival: SurvivalMode; timed: TimedMode }
```

## Exports

### `validateModes(raw: unknown): ModesConfig`

Checks a parsed JSON value and returns it typed, with `timed.runTicks = runSeconds × TICKS_PER_SECOND`. Throws an `Error` naming the bad field when:

- `survival` or `timed` is not an object.
- `survival.startLives` is not a whole number `>= 1`.
- `survival.maxLives` is not a whole number `>= startLives`.
- `timed.runSeconds` or `timed.openOrders` is not a whole number `>= 1`.
- `timed.combo` is not an object; `stepPct` or `windowSeconds` is not a whole number `>= 1`; `capPct` is not a whole number `>= 100`.

`combo.windowTicks = windowSeconds × TICKS_PER_SECOND`.

A bad config is a setup mistake, not a player move, so this throws instead of returning `null`.

### `MODES: ModesConfig`

`src/data/modes.json` passed through `validateModes` once, when the module loads.

### `comboPct(combo: number, rules: ComboRules = MODES.timed.combo): number`

The score multiplier, in percent, for the next order filled when `combo` orders have already been filled in a row: `min(100 + combo × stepPct, capPct)`. Whole percents keep the score a whole number (`completeOrder` rounds down).

## Where it is read

- `createGame`: `lives` starts at `MODES.survival.startLives` in Survival, `0` otherwise.
- `maxLivesFor`: `MODES.survival.maxLives` plus Extra heart.
- `isRunOver` (in `step`): Timed ends on tick `MODES.timed.runTicks`.
- `orderRules`: Timed keeps `MODES.timed.openOrders` orders open.
- `completeOrder` and `step`: the Timed combo (see [main.md](main.md)).
- The screen: the Timed countdown and the mode button text.

## Rules

- No Phaser or browser imports. The JSON import is bundled by Vite and loaded by Vitest.
- Pure: nothing here reads the clock or draws random numbers.

## Tests (`modes.test.ts`)

- Accepts the shipped `modes.json`, with `runTicks = runSeconds × TICKS_PER_SECOND`.
- Ships 3 starting lives, a 300 s Timed run and 3 open Timed orders.
- Accepts a valid config.
- Throws for each bad field listed above.
- `comboPct` (in `main.test.ts`): 100 with no streak, climbs by `stepPct`, stops at `capPct`.

## Open items

- [ ] Life price rule per mode (Day 6): rises per life bought, or scales with elapsed time.
- [x] Timed combo numbers (placeholders: +25% per fill, up to ×3, 20 s window).
- [ ] Rush wave numbers (Day 5).
- [ ] Combo freeze (Day 9): a lasting effect that pushes `comboEndsAt` back each tick, like Order freeze. Combo keeper, Combo builder and Head start become modifiers on these numbers.
- [ ] Puzzle's entry once it has an end rule.
