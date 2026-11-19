# Screens (`src/render/`)

What the player sees for each mode. Phaser code lives in `src/render/scenes` and `src/render/views`. Every piece of text comes from `src/render/format.ts`, which has no Phaser imports so it can be unit tested (`format.test.ts`).

## Mode select (MainMenu)

The landing page has, top to bottom: the logo, the seed field, a **mode picker** and a **Play** button.

- The mode picker has one button per playable mode, in this order: **Survival**, **Timed**. Puzzle is not offered yet.
- Each button shows the mode's name and a one-line description (`modeButtonText`).
- Exactly one mode is selected at a time and is drawn highlighted. Clicking a mode selects it; it does not start the run.
- Survival is selected when the menu opens. Coming back from a run selects the mode that was just played.
- **Play** (or Enter in the seed field) starts the selected mode with the typed seed, or a random one if the field is blank. A bad seed shows the error and starts nothing, as before.
- The Game scene receives `{ seed, mode }` and passes `mode` to `createGame`.

### `PLAYABLE_MODES: GameMode[]`

`["survival", "timed"]`, the modes the picker offers, in order.

### `modeName(mode): string`

`"Survival"`, `"Timed"` or `"Puzzle"`.

### `modeButtonText(mode): string`

Name on the first line, description on the second:

| Mode     | Text                                |
| -------- | ----------------------------------- |
| survival | `Survival\nLast as long as you can` |
| timed    | `Timed\nBest score in 5:00`         |

The Timed length comes from `TIMED_MODE_TICKS`, so it stays right if the constant changes.

## Heads-up display (stats table)

`statRows(state, crops)` gives the rows, in order. The two modes show different stats:

| Row    | Survival                        | Timed                                |
| ------ | ------------------------------- | ------------------------------------ |
| Mode   | `Survival`                      | `Timed`                              |
| Time   | `Time`: counts **up** from 0:00 | `Time left`: counts **down** to 0:00 |
| Score  | yes                             | yes                                  |
| Level  | yes, counted from 1             | no                                   |
| Lives  | yes, as hearts (`heartsText`)   | no                                   |
| Coins  | yes                             | no                                   |
| Filled | yes                             | yes                                  |
| Failed | yes                             | yes                                  |
| Crops  | one row per crop, sorted        | one row per crop, sorted             |

- Timed has no lives, coins or levels (see [main.md](main.md)), so those rows are left out instead of showing zeros.
- The **Buy life** button only shows in Survival.

## End of run (GameOverView)

Shown over the board as soon as `status` is `'ended'`.

- Title (`gameOverTitle`): `Game over` in Survival (lives ran out), `Time's up` in Timed.
- Summary (`gameOverText`), one item per line:
    - Survival: `Score`, `Orders filled`, `Time survived`, `Level reached`.
    - Timed: `Score`, `Orders filled`, `Orders failed`.
- Two buttons:
    - **Restart:** a new run of the same mode on a new random seed.
    - **Menu:** back to the mode select, with the mode just played selected.
- The R debug key still restarts the same mode on the same seed.

## Debug overlay

`debugText` also shows the mode: `tick 0  seed 7  survival`.

## Tests (`format.test.ts`)

- `PLAYABLE_MODES` is Survival then Timed.
- `modeName` and `modeButtonText` for each mode; the Timed description follows `TIMED_MODE_TICKS`.
- `statRows`: the exact rows for Timed, and for Survival; Timed has no Level, Lives or Coins rows.
- `gameOverTitle` and `gameOverText` for each mode.
- `debugText` includes the mode.

## Open items

- [ ] Combo multiplier and rush waves in Timed (Day 5), with a combo row in the HUD and best combo on the summary.
- [ ] High score per mode on the mode select (Day 5 saves).
- [ ] Puzzle in the picker once puzzle levels exist.
