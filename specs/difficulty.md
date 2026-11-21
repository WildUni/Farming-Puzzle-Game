# difficulty.ts

Survival tuning: lives, coins, life prices and the difficulty curve. Every number lives in **one file**, `src/data/difficulty.json`, so tuning a run never needs a code change. `difficulty.ts` loads that file, checks it, and turns it into the rules `main.ts` uses.

Only Survival reads this module. Timed and Puzzle keep the fixed order rules in `game_constants.ts`.

## `src/data/difficulty.json`

```json
{
    "startLives": 3,
    "coinsPerOrder": 4,
    "lifePrice": { "base": 10, "growth": 1.5 },
    "ordersPerLevel": 5,
    "levels": [
        { "orderTimeMultiplier": 1.5, "maxOpenOrders": 1, "minAmount": 2, "maxAmount": 4 },
        ...
    ]
}
```

| Field                  | Meaning                                                                                    |
| ---------------------- | ------------------------------------------------------------------------------------------ |
| `startLives`           | Lives a Survival run starts with                                                           |
| `coinsPerOrder`        | Coins paid for each filled order                                                           |
| `lifePrice.base`       | Price of the first life bought                                                             |
| `lifePrice.growth`     | Each later life costs this many times the one before                                       |
| `ordersPerLevel`       | Filled orders needed to go up one level                                                    |
| `levels`               | One row per level, easiest first. The last row is used for every level past the end        |
| `orderTimeMultiplier`  | Time limit of a new order, as a multiple of `ORDER_TICKS` (600 ticks = 60 s)               |
| `maxOpenOrders`        | `step` keeps this many orders open at this level                                           |
| `minAmount, maxAmount` | Range (inclusive) for the amount a new order asks for                                      |
| `eventGapSeconds`      | Seconds between one event ending and the next being announced (see [events.md](events.md)) |

The default values are listed in the file itself. They were chosen so that:

- Level 1 is gentle: one order at a time, 90 s to fill it, small amounts.
- Each level adds pressure through shorter timers, more open orders or bigger amounts.
- The last level asks for crops faster than 4 plots can grow them, so a run that reaches it loses lives steadily (see "Why every run ends").

**Tuning results (Nov 19, 2026).** Scripted players that plan for the most urgent order and buy a life whenever they can, 12 seeds each, acting every 0.1 s / 2 s / 4 s / 7 s to stand in for reaction time. With `ordersPerLevel: 3` the median run lasted 4.0–5.7 min, too short. With `ordersPerLevel: 5` (shipped) the medians were 6.0 / 6.6 / 7.2 / 8.4 min, every run fell between 5.5 and 9.1 min, and every run ended. A player who does nothing lasts 4 min 30 s. Real players still need to try it (Day 7 playtest).

## Types

```ts
type LevelRow = {
    orderTimeMultiplier: number
    maxOpenOrders: number
    minAmount: number
    maxAmount: number
    eventGapSeconds: number
}
type DifficultyConfig = {
    startLives: number
    coinsPerOrder: number
    lifePrice: { base: number; growth: number }
    ordersPerLevel: number
    levels: LevelRow[]
}
```

`OrderRules` (in [types.md](types.md)) is what a level means for orders:

```ts
type OrderRules = {
    maxOpenOrders: number
    orderTicks: number
    minAmount: number
    maxAmount: number
}
```

## Exports

### `validateDifficulty(raw: unknown): DifficultyConfig`

Checks a parsed JSON value and returns it typed. Throws an `Error` naming the bad field when:

- `startLives` or `ordersPerLevel` is not a whole number `>= 1`.
- `coinsPerOrder` is not a whole number `>= 0`.
- `lifePrice.base` is not a whole number `>= 1`, or `lifePrice.growth` is not a number `>= 1`.
- `levels` is not a non-empty array.
- A row's `orderTimeMultiplier` is not a number `> 0`, or gives fewer than 1 tick once rounded.
- A row's `maxOpenOrders` or `minAmount` is not a whole number `>= 1`, or `maxAmount` is not a whole number `>= minAmount`.
- A row's `eventGapSeconds` is not a whole number `>= 1`.

A bad config is a setup mistake, not a player move, so this throws instead of returning `null`.

### `DIFFICULTY: DifficultyConfig`

`src/data/difficulty.json` passed through `validateDifficulty` once, when the module loads. A bad file fails at startup and in every test run.

Every function below takes an optional last argument `config: DifficultyConfig = DIFFICULTY`, so tests can use their own numbers.

### `levelFor(ordersCompleted: number, config?): number`

The level for a run, counted from 0: `floor(ordersCompleted / ordersPerLevel)`, capped at `levels.length − 1`. The level is worked out from `ordersCompleted`, so it is not stored in `GameState`. Players see it counted from 1.

### `runLevel(state: GameState, config?): number`

The Survival level a run is on: `levelFor(floor(ordersCompleted × 100 / levelPacePct))`, with `levelPacePct` from `modifiersFor(upgrades)` (Steady pace; 100 without it). `orderRules` (main), `gapTicks` (events) and the screen read the level through it.

### `orderRulesFor(level: number, config?): OrderRules`

The order rules at a level. Levels past the end use the last row.

- `orderTicks` is `round(ORDER_TICKS × orderTimeMultiplier)`.
- `maxOpenOrders`, `minAmount` and `maxAmount` are copied from the row.

### `eventGapTicks(level: number, config?): number`

The gap between events at a level: `eventGapSeconds × TICKS_PER_SECOND` from the level's row (the last row past the end). `gapTicks` in `events.ts` applies the Calm skies modifier on top.

### `lifePrice(livesBought: number, config?): number`

Price of the next life when `livesBought` lives have already been bought this run: `round(base × growth ^ livesBought)`. With the defaults the sequence is 10, 15, 23, 34, 51, …

## Rules

- No Phaser or browser imports. The JSON import is bundled by Vite and loaded by Vitest, so the sim still runs in plain Node.
- Pure: nothing here reads the clock, draws random numbers or changes its input.

## Why every run ends

- A player who does nothing never fills an order, so stays on level 1. Each order fails after its time limit and costs a life, so the run ends after a fixed number of ticks (see the test below).
- A player who keeps filling orders climbs to the last level. There, orders ask for more crops per tick than 4 plots can grow, so orders fail and cost lives.
- Coins per order are fixed but life prices grow geometrically, so buying lives only delays the end.

## Tests (`difficulty.test.ts`)

**`validateDifficulty`**

- Accepts the shipped `difficulty.json`.
- Throws for each bad field listed above.

**`levelFor`**

- Is 0 at the start, goes up by one every `ordersPerLevel` filled orders, and stops at the last level.

**`runLevel`** (in `main.test.ts`, with Steady pace)

- Equals `levelFor(ordersCompleted)` without Steady pace, and stays a level lower with it.

**`orderRulesFor`**

- Matches each row of the config, with `orderTicks = round(ORDER_TICKS × multiplier)`.
- Levels past the end use the last row.

**`eventGapTicks`**

- Matches each row's `eventGapSeconds × TICKS_PER_SECOND`; levels past the end use the last row.

**`lifePrice`**

- The price sequence matches `round(base × growth ^ n)` from the config.
- With the defaults: 10, 15, 23, 34, 51.

**Curve sanity** (so tuning can't quietly make the game easier as it goes)

- From one level to the next, `orderTicks` never goes up, `maxOpenOrders` never goes down, `minAmount`/`maxAmount` never go down, and `eventGapSeconds` never goes up.

## Open items

- [ ] Pass the config into `createGame` (or record a rules version in the log) so a server replay knows which numbers a run used.
- [x] Events get more frequent as the level rises: `eventGapSeconds` per row (shipped 45, 40, 35, 30, 26, 22, 18).
- [x] Upgrades that change prices, timers and coins read from `modifiersFor(state.upgrades)` on top of these numbers (see [upgrades.md](upgrades.md)). The functions here stay unmodified; `main.ts` applies the modifiers.
