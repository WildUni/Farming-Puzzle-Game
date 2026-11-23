# scoring.ts

Score calculation, for every mode. Most points are added **as each order is filled** (`orderPoints`, called by `completeOrder` in `main.ts`), so the score on screen goes up during play. A few bonuses and penalties are added **once, at the end of the run** (`scoreBreakdown`), and shown as lines on the summary.

Every number lives in **`src/data/scoring.json`**, so tuning never needs a code change. Each mode has the same fields; setting one to `0` turns that part off, so a part can be moved to another mode by changing the JSON.

## `src/data/scoring.json`

```json
{
    "survival": {
        "levelBonusPct": 10,
        "speedBonusPct": 0,
        "bestComboPoints": 0,
        "failedOrderPoints": 0,
        "coinsPerPoint": 2
    },
    "timed": {
        "levelBonusPct": 0,
        "speedBonusPct": 50,
        "bestComboPoints": 20,
        "failedOrderPoints": 5,
        "coinsPerPoint": 4
    }
}
```

| Field               | When       | Meaning                                                                                       |
| ------------------- | ---------- | --------------------------------------------------------------------------------------------- |
| `levelBonusPct`     | Each fill  | % added to an order's value per Survival level past the first (level 1 adds nothing)          |
| `speedBonusPct`     | Each fill  | % of an order's value paid on top when it is filled with all its time left; less as time runs |
| `bestComboPoints`   | End of run | Points per order in the run's longest streak (`bestCombo`)                                    |
| `failedOrderPoints` | End of run | Points taken away per failed order                                                            |
| `coinsPerPoint`     | End of run | Coins left over that make 1 point. `0` means coins don't count                                |

All are whole numbers `>= 0`. The numbers are placeholders until a tuning pass. Timed orders pay coins like Survival's (for now), so its coin line counts them; its rate is lower than Survival's on purpose.

Puzzle has no entry yet: it scores with every field at `0` (`NO_SCORING`), so an order is worth its value and nothing is added at the end.

The Timed combo multiplier itself stays in `modes.json` (see [modes.md](modes.md)), next to the rest of the combo rules; `orderPoints` applies it.

## Types

```ts
type ScoringRules = {
    levelBonusPct: number
    speedBonusPct: number
    bestComboPoints: number
    failedOrderPoints: number
    coinsPerPoint: number
}
type ScoringConfig = { survival: ScoringRules; timed: ScoringRules }

type ScoreLineKind = "bestCombo" | "failedOrders" | "coins"
type ScoreLine = { kind: ScoreLineKind; count: number; points: number } // points < 0 for a penalty
type ScoreBreakdown = { orderPoints: number; lines: ScoreLine[]; total: number }
```

## Exports

### `validateScoring(raw: unknown): ScoringConfig`

Checks a parsed JSON value and returns it typed. Throws an `Error` naming the bad field when `survival` or `timed` is not an object, or any of the five fields is missing or not a whole number `>= 0`. A bad config is a setup mistake, so this throws instead of returning `null`.

### `SCORING: ScoringConfig`

`src/data/scoring.json` passed through `validateScoring` once, when the module loads.

### `scoringRules(mode: GameMode, config = SCORING): ScoringRules`

The mode's rules; `NO_SCORING` (every field `0`) for Puzzle.

### `comboPctFor(state: GameState): number`

The Timed combo multiplier for the next fill: `comboPct(state.combo, MODES.timed.combo, comboStepBonusPct, comboStartPct)` with the Combo builder and Head start modifiers. `100` outside Timed. The HUD's combo text uses it too.

### `isFinale(state: GameState): boolean`

True in Timed from tick `runTicks − finaleTicks` on (Grand finale's stretch).

### `isPairFill(state: GameState): boolean`

True in Timed when `pairOpenUntil > 0` and `tick <= pairOpenUntil`: a fill now pairs with the one before (Double delivery).

### `fillBonusPct(state: GameState): number`

Percent added to a fill's base points: `finalePct` while `isFinale`, plus `doubleDeliveryPct` while `isPairFill`. `0` outside Timed and with neither upgrade.

### `orderPoints(state: GameState, order: Order, rules = scoringRules(state.mode)): number`

Points for filling `order` now, in `state` as it is **before** the fill (so the level and combo are the ones the player built up to this order):

1. `multPct = (100 + levelBonusPct × level) × comboPctFor(state) / 100 × (100 + fillBonusPct(state)) / 100`, where `level` is `runLevel(state)` (0 for level 1) in Survival and `0` in other modes.
2. `base = floor(value × multPct / 100)`, worked out in whole numbers with one division at the end.
3. `left = min(timeLeft(order, tick), timeLimit)` (an Order freeze can push the deadline past the time limit).
4. `speed = floor(value × speedBonusPct × left / (100 × timeLimit))`.
5. Returns `base + speed`.

In Timed with the shipped numbers this is the existing combo score plus up to half the order's value for speed.

### `scoreBreakdown(state: GameState, rules = scoringRules(state.mode)): ScoreBreakdown`

The final score and how it is made up. Works on any state; the summary shows it once the run has ended.

- `orderPoints = state.score` (everything `orderPoints` added during the run).
- `lines`, in this order, each only when its rate is above 0:
    - `bestCombo`: `count = bestCombo`, `points = count × bestComboPoints`
    - `failedOrders`: `count = ordersFailed`, `points = −count × failedOrderPoints`
    - `coins`: `count = coins`, `points = floor(count / coinsPerPoint)`
- `total = max(0, orderPoints + sum of line points)`.

### `finalScore(state: GameState): number`

`scoreBreakdown(state).total`. High scores and leaderboards use this.

## Rules

- No Phaser or browser imports. Pure: never reads the clock or draws random numbers, so a server replaying a run's log gets the same score.
- `GameState.score` is only the per-order points. The end-of-run lines are worked out from the state and never stored, so nothing in `GameState` changes.

## Tests (`scoring.test.ts`)

- Accepts the shipped `scoring.json`; accepts a valid config; throws for a missing mode, and for each field missing, negative or fractional.
- `scoringRules` gives each mode's entry, and `NO_SCORING` for Puzzle.
- `orderPoints`:
    - With every rate 0 and no combo, an order is worth its value.
    - Survival: level 1 adds nothing; at level _n_ (0-based) the value goes up by `levelBonusPct × n` %, rounded down.
    - Timed: the combo multiplies the value as `comboPct(combo)` says; the level is ignored.
    - Speed bonus: `speedBonusPct` % of the value with all the time left, half that with half the time left, 0 on the `expiresAt` tick; capped when an effect pushed the deadline past the time limit.
- `scoreBreakdown`:
    - Lists only lines whose rate is above 0, in the order above, with counts and points as listed.
    - Timed: best combo adds, failed orders take away; Survival: coins add, rounded down.
    - The total never goes below 0.
    - Puzzle: no lines, total is the score.
- `finalScore` equals the breakdown's total.

`main.test.ts` checks `completeOrder` adds `orderPoints` (see [main.md](main.md)).

## Open items

- [x] Score each order as it is filled, with end-of-run bonuses on top.
- [x] Read `GameState` directly; `RunData` is removed.
- [x] Timed combo multiplier: applied per order through `orderPoints`, with its numbers in `modes.json`.
- [x] Survival and Timed formulas, in one file with their numbers in `scoring.json`.
- [ ] Tune every number after playtesting.
- [ ] Timed coins count at `coinsPerPoint` 4. Re-check now that Timed orders pay the same coins as Survival.
- [ ] Puzzle scoring once puzzle levels exist.
- [x] Rush pay raises rush orders' value when they are made (see [main.md](main.md)); Grand finale and Double delivery add `fillBonusPct`; Combo builder and Head start go through `comboPctFor`.
