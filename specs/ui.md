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

The Timed length comes from `MODES.timed.runTicks` (`modes.json`), so it stays right if the config changes.

## Heads-up display (stats table)

`statRows(state, crops)` gives the rows, in order. The two modes show different stats:

| Row    | Survival                                                   | Timed                                             |
| ------ | ---------------------------------------------------------- | ------------------------------------------------- |
| Mode   | `Survival`                                                 | `Timed`                                           |
| Time   | `Time`: counts **up** from 0:00                            | `Time left`: counts **down** to 0:00              |
| Score  | yes                                                        | yes                                               |
| Combo  | no                                                         | `comboText`: `x1.75 0:05`, or `x1` with no streak |
| Level  | yes, counted from 1                                        | no                                                |
| Lives  | yes, as full and empty hearts up to the cap (`heartsText`) | no                                                |
| Coins  | yes                                                        | no                                                |
| Filled | yes                                                        | yes                                               |
| Failed | yes                                                        | yes                                               |
| Crops  | one row per crop, sorted                                   | one row per crop, sorted                          |

- Timed has no lives, coins or levels (see [main.md](main.md)), so those rows are left out instead of showing zeros.
- The **Buy life** button only shows in Survival. At the lives cap it reads `Lives full` and is disabled.

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
- **Order power-up (Finish one):** the same, on the order cards: the cards in `powerUpTargets` (open order ids) are outlined and the rest dimmed; clicking one sends `usePowerUp { slot, target: orderId }`. A click on any card or plot that isn't a valid target cancels. While in target mode an order click never delivers.
- The bar is covered by the upgrade-pick shade like the rest of the board.

### Active effects

A line under the slot buttons lists each lasting effect **started by a power-up** with `endsAt > tick` and the seconds left (`activeEffectText`), e.g. `Order freeze 7s`. Seconds left are `ceil((endsAt − tick) / TICKS_PER_SECOND)`, so it never shows `0s` while the effect still has ticks to run. An effect on its `endsAt` tick has done its last tick and is not listed. While an Order freeze is active, order countdown bars are drawn in a frozen colour. Event effects are shown by the event banner instead, so they are not listed twice.

## Events (EventBanner)

A banner across the top of the board, above the plots, shown while `state.event` is not `null`. Hidden when `allowEvents` is off. It never blocks clicks.

- **Warning** (`tick < startsAt`): `eventBannerText` gives `Frost in 4s`, with the seconds until `startsAt` rounded up. A plot event adds its plot: `Moles → Plot 2 in 4s`.
- **Running** (lasting events, `startsAt <= tick < endsAt`): `Frost 6s`, with the seconds until `endsAt` rounded up.
- Instant events show their warning only; on the tick they start the banner is gone.
- The banner is green for good events and red for bad ones.

### Plot overlays

Drawn by `PlotsView` from the state, on top of the plot's own colour:

| When                                       | Overlay                                                                                               |
| ------------------------------------------ | ----------------------------------------------------------------------------------------------------- |
| Moles announced, on its target plot        | Red dashed outline and a mole marker                                                                  |
| Crows running, on each plot they landed on | A `CROWS` marker; clicking the plot sends `scareCrows { plot }` through `act()` instead of harvesting |
| Frost running, on each plot not excluded   | A pale blue tint                                                                                      |
| Sunny spell running                        | A warm tint on every plot                                                                             |
| Worms running, on each plot not excluded   | A `WORMS` marker                                                                                      |
| Greenhouse plot (`shieldedPlots`)          | A small shield marker, always                                                                         |

### Fog

While `isFogged(state)` (a `fog` effect is working): growing plots show `?` instead of their percentage and their growth bar is hidden (`plotText(plot, now, fog)`), and order cards show `?:??` instead of the time left and hide their countdown bar. Crop names, amounts and values stay visible.

## Small orders (OrdersView)

An order Small order halved has `SMALL` after its number on the first line of its card (`Order #4  SMALL`), and so does a Sneak peek card for one (`Next order  SMALL`).

## Sneak peek (OrdersView)

With Sneak peek, a dimmed card under the open orders shows `nextOrderPreview(state, crops)` as `Next order`, one `crop xN` line per crop, and its value (`nextOrderText`). It takes no clicks. Hidden without the upgrade.

The overlay rules come from `plotOverlays(state)` in `format.ts`, which returns one list of overlay names per plot, so they can be unit tested without Phaser.

## End of run (GameOverView)

Shown over the board as soon as `status` is `'ended'`.

- Title (`gameOverTitle`): `Game over` in Survival (lives ran out), `Time's up` in Timed.
- Summary (`gameOverText`), one item per line:
    - Survival: `Score`, `Orders filled`, `Orders failed`, `Time survived`, `Level reached`.
    - Timed: `Score`, `Orders filled`, `Orders failed`, `Best combo` (the longest streak).
- Two buttons:
    - **Restart:** a new run of the same mode on a new random seed.
    - **Menu:** back to the mode select, with the mode just played selected.
- The R debug key still restarts the same mode on the same seed.

## Debug overlay

`debugText` also shows the mode: `tick 0  seed 7  survival`. After the debug menu changes the run it adds `  DEBUGGED`, since the run can no longer be replayed.

## Debug menu

A panel of plain HTML controls fixed to the right edge of the page, beside the canvas, for testing by hand. It only exists in the dev build (`import.meta.env.DEV`); a production build has no panel and no key for it.

- A small **Debug** tab on the right edge opens and closes it; so does the backtick key (`` ` ``). It starts closed. It closes when the Game scene ends or restarts.
- It never pauses the game. Pause (P) works as usual, and the menu works while paused.
- Every change goes through [debug.md](debug.md)'s functions. A refused change leaves the run alone and the status line says `Not allowed`.

Three sections, top to bottom:

| Section   | Controls                                                                                                                                                                                                      |
| --------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Events    | Event list (name and good/bad); a plot list, shown only for plot events, listing `eventTargets`; a **Skip warning** checkbox; a **Trigger** button                                                            |
| Upgrades  | Upgrade list (all upgrades, by name); a tier list (every tier, or only the upgrade's own); a target list, shown only for targeted upgrades, listing `validTargets` as `Plot N` or crop ids; an **Add** button |
| Power-ups | Power-up list; an **Add** button                                                                                                                                                                              |

- The plot and target lists follow the state, so they only offer choices the debug functions accept. A button is disabled when its section has nothing to offer (for example, Moles with every plot empty, or power-ups with every slot full).
- The status line at the bottom says what the last click did, for example `Added Frost cover (rare)` or `Triggered Moles → Plot 2`.
- Once any change is accepted, the run is marked debugged: `debugText` shows it, and the L key prints a warning that the log won't replay before printing it.

## Tests (`format.test.ts`)

- `PLAYABLE_MODES` is Survival then Timed.
- `modeName` and `modeButtonText` for each mode; the Timed description follows `MODES.timed.runTicks`.
- `statRows`: the exact rows for Timed, and for Survival; Timed has no Level, Lives or Coins rows, and Survival no Combo row.
- `comboText` shows the multiplier and the time left on the streak, and `x1` with none.
- `gameOverTitle` and `gameOverText` for each mode.
- `debugText` includes the mode, and `DEBUGGED` only when the run was changed by the debug menu.
- `upgradeCardText` shows name, tier, description with that tier's values (a tiered and a non-tiered example, and one with two effects) and the copy count after picking.
- `buyLifeText` shows the price with the `lifePricePct` modifier applied.
- `powerUpButtonText` gives the name, then the text with `{seconds}` filled from `durationFor`, with and without Long-lasting.
- `shownEffects` and `ordersFrozen` leave out an effect on its `endsAt` tick; `shownEffects` lists only power-up effects.
- `eventBannerText` for the warning of an untargeted and a plot event, for a running lasting event, rounding seconds up, and `null` with no event.
- `plotOverlays` for each row of the overlay table, including a shielded plot left out of Frost and Crows.
- `activeEffectText` shows the name and seconds left, rounding up: `1s` with one tick left, `10s` with 100.
- `isFogged` follows the fog effect's working ticks; `plotText` shows `?` for a growing crop in fog; `orderText` shows `?:??` in fog.
- `nextOrderText` lists the next order's crops and value.
- `orderText` and `nextOrderText` add `SMALL` to the title of a halved order.
- `heartsText(lives, max)` shows a full heart per life and an empty one up to the cap; `buyLifeText` says `Lives full` at the cap.
- `plotOverlays` marks every plot Worms are working on.
- The Level row and the game-over level follow `runLevel` (Steady pace).

## Open items

- [ ] Plot upgrades: pick the plot on the board itself (valid plots highlighted, the rest greyed out) instead of a row of `Plot N` buttons, once a plot upgrade can be offered. Greenhouse is the first (see [events.md](events.md)).

- [x] Combo multiplier in Timed, with a Combo row in the HUD and best combo on the summary.
- [ ] Rush waves in Timed (Day 5), with a warning banner.
- [ ] High score per mode on the mode select (Day 5 saves).
- [ ] Puzzle in the picker once puzzle levels exist.
