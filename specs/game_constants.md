# game_constants.ts

Tuning numbers that are the same for every run. Changing one should never require changing code elsewhere.

## Exports

| Constant              | Value        | Meaning                                                                                                                                               |
| --------------------- | ------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------- |
| `TICKS_PER_SECOND`    | `10`         | Simulation rate. One tick is 100 ms of real time                                                                                                      |
| `START_PLOTS`         | `4`          | Number of plots a run starts with                                                                                                                     |
| `ORDER_TICKS`         | `600`        | Time limit for a new order (`TICKS_PER_SECOND × 60 s`)                                                                                                |
| `ORDER_MIN_AMOUNT`    | `2`          | Smallest amount an order asks for                                                                                                                     |
| `ORDER_MAX_AMOUNT`    | `6`          | Largest amount an order asks for                                                                                                                      |
| `MAX_OPEN_ORDERS`     | `2`          | Puzzle keeps this many orders open (Timed uses `MODES.timed.openOrders`, Survival its level row)                                                      |
| `ORDERS_PER_UPGRADE`  | `10`         | Survival offers an upgrade after every this many filled orders (see [upgrades.md](upgrades.md))                                                       |
| `UPGRADE_CHOICES`     | `3`          | Upgrades shown on one offer                                                                                                                           |
| `TIERS`               | list         | Upgrade tiers in order: `common`, `uncommon`, `rare`, `epic`, `legendary`                                                                             |
| `DEFAULT_ORDER_RULES` | `OrderRules` | The four order constants above as one object. Puzzle uses it as is and Timed with `maxOpenOrders` from `modes.json`; Survival reads `difficulty.json` |

`ORDER_TIMELIMIT` (60 seconds) is used to calculate the tick values but are not exported.

## Rules

- Every duration the simulation uses is in ticks. Convert from seconds here, using `TICKS_PER_SECOND`, not in other modules.
- Per-crop numbers (growth time, yield, value) belong in `src/data/crops.json`, not here.
- Power-up numbers (weights, lengths, amounts) belong in `src/data/powerups.json`. Lengths there are in seconds and `validatePowerUps` turns them into ticks with `TICKS_PER_SECOND` (see [powerups.md](powerups.md)).
- Upgrade numbers (stat caps, tier weights, per-tier amounts) belong in `src/data/upgrades.json`. `MIN_MODIFIER_PCT` was removed when each stat got its own `min` and `max` there (see [upgrades.md](upgrades.md)).

## Open items

- [x] Scoring numbers (level, speed, best combo, failed orders, coins) live in `src/data/scoring.json` (see [scoring.md](scoring.md)), not here.
- [x] Mode rules (Survival's starting lives and lives cap, Timed's run length and open orders) live in `src/data/modes.json` (see [modes.md](modes.md)). The Timed length was `TIMED_MODE_TICKS` here.
- [x] Survival numbers: starting lives, coins, life prices and the difficulty curve live in `src/data/difficulty.json` (see [difficulty.md](difficulty.md)), not here.
