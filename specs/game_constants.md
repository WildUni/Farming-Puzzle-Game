# game_constants.ts

Tuning numbers that are the same for every run. Changing one should never require changing code elsewhere.

## Exports

| Constant              | Value        | Meaning                                                                                                                        |
| --------------------- | ------------ | ------------------------------------------------------------------------------------------------------------------------------ |
| `TICKS_PER_SECOND`    | `10`         | Simulation rate. One tick is 100 ms of real time                                                                               |
| `TIMED_MODE_TICKS`    | `3000`       | Length of a Timed run (`TICKS_PER_SECOND × 300 s`)                                                                             |
| `START_PLOTS`         | `4`          | Number of plots a run starts with                                                                                              |
| `ORDER_TICKS`         | `600`        | Time limit for a new order (`TICKS_PER_SECOND × 60 s`)                                                                         |
| `ORDER_MIN_AMOUNT`    | `2`          | Smallest amount an order asks for                                                                                              |
| `ORDER_MAX_AMOUNT`    | `6`          | Largest amount an order asks for                                                                                               |
| `MAX_OPEN_ORDERS`     | `2`          | `step` keeps this many orders open, creating new ones as orders close                                                          |
| `DEFAULT_ORDER_RULES` | `OrderRules` | The four order constants above as one object. Timed and Puzzle use it; Survival reads its rules from `difficulty.json` instead |

`TIMED_MODE_TIMELIMIT` (300 seconds) and `ORDER_TIMELIMIT` (60 seconds) are used to calculate the tick values but are not exported.

## Rules

- Every duration the simulation uses is in ticks. Convert from seconds here, using `TICKS_PER_SECOND`, not in other modules.
- Per-crop numbers (growth time, yield, value) belong in `src/data/crops.json`, not here.

## Open items

- [ ] Base points per filled order and the bonus for time left (see [scoring.md](scoring.md)).
- [x] Survival numbers: starting lives, coins, life prices and the difficulty curve live in `src/data/difficulty.json` (see [difficulty.md](difficulty.md)), not here.
