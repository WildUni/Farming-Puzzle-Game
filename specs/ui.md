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

## Upgrade pick (UpgradePickView)

Shown over the board while `state.upgradeOffer` is not `null` (Survival only).

- A shade covers the board and swallows clicks, like the pause shade. The plant picker closes when it opens.
- Title `Choose an upgrade`, and one card per offered card, side by side.
- Each card's text (`upgradeCardText`): name, tier, the one-line description with the tier's values filled in, and how many copies the player will have after picking it out of `maxCopies`, e.g. `Fast growth
Rare
Crops grow 7% faster
2 / 5`. Non-tiered upgrades show their tier the same way.
- The card's frame is coloured by tier, one colour per tier, so the tier reads at a glance.
- **Untargeted card:** clicking it sends `chooseUpgrade` through `act()`, so it is logged; the view closes and time resumes.
- **Targeted card:** clicking it moves to a second step instead of picking. The title becomes `Choose a plot` or `Choose a crop`.
    - One button per target in `validTargets`, in that order: `Plot 1`, `Plot 2`, … for plot upgrades (`targetText`), crop ids for crop upgrades.
    - Clicking a target sends `chooseUpgrade { upgradeId, target }` through `act()`. A **Back** button returns to the cards without sending anything.
- The game loop does not step while an offer is open. Pause still works on top of it.

## Power-ups (PowerUpBar)

A row of slot buttons under the plots, in both modes. Hidden when `allowPowerUps` is off. The Game scene starts runs with `allowPowerUps: true` (the Daily Challenge will turn it off).

- One button per slot (`powerUpSlots`), left to right in `powerUps` order. A held power-up shows its name (`powerUpButtonText`); an empty slot is drawn greyed out with no text.
- A held power-up's button shows its name and, on the next line, its text with `{seconds}` filled in from `durationFor` (`powerUpButtonText`), so Long-lasting shows the longer time.
- A button is enabled only when `canUsePowerUp` is true for it (with any valid target, for a plot power-up), so the screen and the rules can't disagree.
- **Untargeted power-up:** clicking sends `usePowerUp { slot }` through `act()`.
- **Plot power-up (Ready one):** clicking enters target mode. The plots in `powerUpTargets` are highlighted and the rest greyed out; clicking a highlighted plot sends `usePowerUp { slot, target }` through `act()`. Clicking the button again, Esc (which pauses otherwise) or a click on a dimmed plot cancels without sending anything. Target mode also ends when no plot is a valid target any more, and when the game pauses, ends or opens an upgrade offer. While in target mode a plot click never plants or harvests.
- The bar is covered by the upgrade-pick shade like the rest of the board.

### Active effects

A line under the slot buttons lists each lasting effect with `endsAt > tick` and the seconds left (`activeEffectText`), e.g. `Order freeze 7s`. Seconds left are `ceil((endsAt − tick) / TICKS_PER_SECOND)`, so it never shows `0s` while the effect still has ticks to run. An effect on its `endsAt` tick has done its last tick and is not listed. While an Order freeze is active, order countdown bars are drawn in a frozen colour.

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
- `upgradeCardText` shows name, tier, description with that tier's values (a tiered and a non-tiered example, and one with two effects) and the copy count after picking.
- `buyLifeText` shows the price with the `lifePricePct` modifier applied.
- `powerUpButtonText` gives the name, then the text with `{seconds}` filled from `durationFor`, with and without Long-lasting.
- `shownEffects` and `ordersFrozen` leave out an effect on its `endsAt` tick.
- `activeEffectText` shows the name and seconds left, rounding up: `1s` with one tick left, `10s` with 100.

## Open items

- [ ] Plot upgrades: pick the plot on the board itself (valid plots highlighted, the rest greyed out) instead of a row of `Plot N` buttons, once a plot upgrade can be offered.

- [ ] Combo multiplier and rush waves in Timed (Day 5), with a combo row in the HUD and best combo on the summary.
- [ ] High score per mode on the mode select (Day 5 saves).
- [ ] Puzzle in the picker once puzzle levels exist.
