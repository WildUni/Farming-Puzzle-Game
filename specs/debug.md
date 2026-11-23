# debug.ts

Cheats for testing a run by hand: start any event, add any upgrade, give any power-up. The debug menu (see [ui.md](ui.md#debug-menu)) calls these; nothing else does.

These are **not actions**. They don't go through `applyAction` and are never logged, so a run that uses one can't be replayed. The Game scene remembers that the run was changed (see [ui.md](ui.md#debug-menu)); the sim doesn't store it.

Like the rest of `src/sim/`, every function is pure: it returns a new state, or `null` when the change makes no sense, and never touches any random stream.

## Exports

### `debugEvent(state, id, options): GameState | null`

`options` is `{ plot: number | null; skipWarning: boolean }`.

Announces event `id` now, in place of whatever event is announced or running. Lasting effects already working keep running.

- Returns `null` when the run has ended, events are off (`allowEvents`), `id` is not an event, the event doesn't happen in the run's mode, or the plot is wrong: a plot event needs `plot` in `eventTargets(state, def)`, and other events need `plot` to be `null`.
- The event is built exactly as `announceEvent` builds it (warning, length and amount with the run's modifiers; see [events.md](events.md)), with `announcedAt = tick`. `events.ts` exports that part as `buildEvent(state, def, plot)` so the two can't differ.
- `skipWarning: true` moves it to start on the next step: `startsAt = tick + 1`, and `endsAt` moves by the same amount.
- Doesn't change `nextEventAt`; when the event ends, the next one is scheduled a gap later as usual.

### `debugUpgrade(state, id, tier, target, crops): GameState | null`

Adds one copy of upgrade `id` at `tier`, as if it had been picked.

- Returns `null` when the run has ended, `id` is not an upgrade, `tier` is not one it exists at (any tier for a tiered upgrade, only its own for a non-tiered one), or the target is wrong: untargeted upgrades need `target` to be `null`; targeted ones need it in `validTargets`.
- Ignores pools, `needs`, `requires` and `maxCopies`, so any upgrade can be tested in any mode. Stat caps still apply, through `modifiersFor`.
- Adds plots for `extraPlots` the same way `chooseUpgrade` does. `main.ts` exports that part as `withUpgrade(state, copy)` so the two can't differ.
- Doesn't touch an open upgrade offer.

### `debugOpenShop(state, crops): GameState | null`

Opens a shop visit now with `openShop`, as if one were due (it counts as a visit). `null` once the run has ended, in Puzzle, or while a shop or an upgrade offer is open. The debug menu's **Shop** section has an **Open shop** button for it. `debugUpgrade` returns `null` for an instant upgrade (Promotion), since there is no copy to add.

### `debugPowerUp(state, id): GameState | null`

Gives power-up `id`, appended to `powerUps`.

- Returns `null` when the run has ended, power-ups are off (`allowPowerUps`), `id` is not a power-up, or every slot is full (`powerUpSlots`).
- Ignores the power-up's `modes`.

## Rules

- No Phaser or browser imports. Pure; draws nothing from any stream.
- Never changes `tick`, the action log or anything the scene owns.

## Tests (`debug.test.ts`)

**`debugEvent`**

- Announces each shipped event with the same `RunEvent` that `buildEvent` gives, replacing an event already announced.
- `skipWarning` makes the event start on the next `step`: Frost's effect is active after one step.
- Moles needs a plot with a crop; refuses a missing, empty or out-of-range plot, and a plot on an untargeted event.
- Refuses: events off, unknown id, Generous customer in Timed, an ended run.
- Leaves every RNG stream and `nextEventAt` as they were.

**`debugUpgrade`**

- Adds the copy at the given tier; a non-tiered upgrade only at its own tier.
- Adds a copy past `maxCopies` and outside the run's pool; refuses an invalid target and a target on an untargeted upgrade.
- Extra plot adds a plot.
- Refuses an unknown id and an ended run.

**`debugPowerUp`**

- Appends the power-up; refuses with full slots, power-ups off, an unknown id and an ended run.

## Open items

- [ ] Record debug changes in the log as their own entry type, so a debugged run can still be replayed for bug reports.
