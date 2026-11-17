# scoring.ts

Score calculation. Kept in its own module because each mode will score differently, and the rules will change during tuning.

## Exports

### `calcScore(data: RunData): number`

Returns `data.points + data.orders_completed * 10`.

- `data.time_left` is not used yet.
- This is a placeholder rule.

## Target rule (from the build plan)

Base points per filled order, plus a bonus for the time left on that order.

## Rules

- Scoring runs on the player's device for now. It must be deterministic, so a server can replay a run's log and get the same score.
- Point values belong in `game_constants.ts`, not inside the function.

## Open items

- [ ] Replace the placeholder with the target rule, and move the `10` into `game_constants.ts`.
- [ ] Decide whether scoring is per order (added when an order is delivered) or calculated once at the end of the run.
- [ ] Decide whether to take `GameState` directly instead of `RunData` (see [types.md](types.md)).
- [ ] Scoring for each mode: combo multiplier in Timed, and Survival and Puzzle rules (open question in the design doc).
- [ ] No tests yet.
