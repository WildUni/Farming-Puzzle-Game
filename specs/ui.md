# Screens (`src/render/`)

What the player sees for each mode. Phaser code lives in `src/render/scenes` and `src/render/views`. Every piece of text comes from `src/render/format.ts`, which has no Phaser imports so it can be unit tested (`format.test.ts`).

## Title screen and mode select (MainMenu)

The landing page is also the title screen. Top to bottom: the logo, the seed field, a **mode picker**, a **Play** button and a **How to play** button.

- The mode picker has one button per playable mode, in this order: **Survival**, **Timed**. Puzzle is not offered yet.
- Each button shows the mode's name and a one-line description (`modeButtonText`).
- Exactly one mode is selected at a time and is drawn highlighted. Clicking a mode selects it; it does not start the run.
- Survival is selected when the menu opens. Coming back from a run selects the mode that was just played.
- **Play** (or Enter in the seed field) starts the selected mode with the typed seed, or a random one if the field is blank. A bad seed shows the error and starts nothing, as before.
- The Game scene receives `{ seed, mode }` and passes `mode` to `createGame`.
- Under each mode button, the mode's saved high score (`modeBestText`): `Best 465`, or `No best yet`. See [saves.md](saves.md).
- A **Sound** toggle in the top-right corner (`soundButtonText`: `Sound: on` / `Sound: off`) flips the saved setting and mutes or unmutes the game at once.
- **How to play** opens the How to play screen. Coming back keeps the selected mode.

### `modeBestText(best): string`

`Best {best}`, or `No best yet` when the mode has no saved score.

### `soundButtonText(soundOn): string`

`Sound: on` or `Sound: off`.

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

## How to play (HowTo scene)

Four panels, one at a time, from `HOW_TO_PANELS` (`{ title, body }[]`, in `format.ts`): **Orders**, **Storage**, **Upgrades and the shop**, **Events**.

- Each panel shows its title, its body on a card, and the page count (`howToPageText(i)`: `1 / 4`).
- **Back** goes to the previous panel and is disabled on the first. **Next** goes to the next; on the last panel it reads **Done** and returns to the title screen.
- **Close** (top-right corner) returns to the title screen from any panel.
- Keys: Left and Right arrows page, Esc closes.
- It receives `{ mode }` from the title screen and hands it back, so the selected mode stays selected.

## Pause menu (PauseView)

- The **Pause** button (top right, under the stats) or P / Esc pauses. The board is shaded and swallows clicks, as before, and the clock stops.
- Under the `Paused` banner, three buttons, top to bottom:
    - **Resume:** unpauses (the same as the corner button, which reads `Resume` while paused).
    - **Restart:** a new run of the same mode on a new random seed, the same as the end-of-run Restart.
    - **Quit:** back to the title screen with this mode selected. The run is dropped and its score is not saved, since it never ended.
- The buttons only show, and only take clicks, while paused.

## Juice

Small animations that follow the state. They never change it: every one is worked out from the state before and after (`src/render/cues.ts`, Phaser-free so it can be unit tested) and only drawn by the views.

`cues(prev, next): Cue[]` compares two states and lists what happened:

| Cue                       | When                                                                                           | Drawn as                                                                           |
| ------------------------- | ---------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------- |
| `harvest` (plot)          | a plot that was `ready` is `empty` (the player, Auto harvest or Helpful neighbor harvested it) | the plot square punches up in size and a white ring bursts out of it               |
| `score` (points, orderId) | `score` went up; `orderId` is the filled order that left, or `null` when none or several did   | `+N` floats up from that order's card and fades, or from the Score row when `null` |
| `lifeLost`                | Survival and `lives` went down                                                                 | the camera shakes briefly                                                          |

Orders slide (`orderChanges(prev, next)`, in `cues.ts`, gives `added` ids and `removed` `{ id, failed }`; an order is failed when it left after its `expiresAt` tick):

- A new order's card slides in from the left edge.
- An order that left slides out to the left and fades: green-tinted when filled, red-tinted when failed.
- Cards that move up the stack because one above them left glide to their new place.

Timer pulse (`lowTimePulse(state)`): in Timed, during the last `LOW_TIME_SECONDS` (10) of the run, the `Time left` value turns red and swells at the start of each second, shrinking back over the second. It gives a number from 1 (just ticked) down to 0, or `null` when the time is not low (Survival, before the last 10 seconds, or the run is over). It follows the sim's ticks, so it holds still while paused.

- A cue is only worked out between two states of the same run; a restart starts with no cues.
- Nothing is shown for a `harvest` on a plot that no longer exists (the plot count changed).

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
| Coins  | yes                                                        | yes                                               |
| Filled | yes                                                        | yes                                               |
| Failed | yes                                                        | yes                                               |
| Crops  | one row per crop, sorted                                   | one row per crop, sorted                          |

- Timed has no lives or levels (see [main.md](main.md)), so those rows are left out instead of showing zeros. It shows coins, since orders and selling earn them and rerolls spend them.
- The **Buy life** button only shows in Survival. At the lives cap it reads `Lives full` and is disabled.

## Upgrade pick (UpgradePickView)

Shown over the board while `state.upgradeOffer` is not `null` (Survival only).

- A shade covers the board and swallows clicks, like the pause shade. Any plot choosing (fertilizer, Miracle grow, a power-up) stops when it opens.
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
- **Reroll** button under the cards (`rerollText`): `Reroll` and the next reroll's price (`rerollPriceFor`). Disabled when `canReroll` is false. Clicking it sends `rerollOffer` through `act()`; the cards are rebuilt for the new offer, and the price shown rises.
- The game loop does not step while an offer is open. Pause still works on top of it.

## Crop bar (CropBar)

> Day 8b: replaces the plant picker that opened when an empty plot was clicked.

A row of crop buttons on the play screen, always visible while the run is on, one per crop in id order (`cropButtonText`: the crop and its grow time).

- Clicking a crop selects it (white outline). One crop is selected at a time; the first crop is selected when the run starts. Clicking the selected crop again keeps it selected.
- Clicking an empty plot sends `plant { plot, cropId }` with the selected crop through `act()`. The crop stays selected, so several plots can be planted in a row.
- Clicking a ready plot harvests it and a plot with Crows scares them, whatever crop is selected, as before.
- Clicking a growing plot Birds seeded (`SEEDS`) sends `digUp { plot }`. Clicking any other growing plot sends `waterPlot { plot }`, which only works during a Drought; otherwise nothing happens.
- While a plot is being chosen for a power-up, fertilizer or Miracle grow, a plot click does that instead of planting.
- The selected crop is screen state kept by the Game scene, never part of `GameState`, so it is not logged.

## Drawer (BarnView becomes the drawer)

> Day 8b: the barn's selling and fertilizer-making move to the shop page's Storage section.

A panel along the bottom of the play screen that never pauses the clock. It starts open; a tab on its top edge folds it down to just the storage bar and opens it again.

- **Storage bar** across the screen: `Storage 12 / 25` (`storageText`), filled by `storageFill`. It turns red and the label adds `FULL` when `isStorageFull`. Shown folded or open.
- **Fertilize** (`fertilizeText`: how many are held) starts choosing a plot: the plots in `fertilizerTargets` are outlined and the rest dimmed, as for a plot power-up, and the button says `Cancel`. Clicking a highlighted plot sends `useFertilizer`; clicking anything else, Esc, or starting a power-up cancels. Disabled with no fertilizer or nothing to fertilize.
- A fertilized crop shows `FERT` along the top of its plot (`plotOverlays`).
- A plot Lucky clover marked shows `CLOVER` until its next harvest (`plotOverlays`).
- During a Drought, a growing crop it holds shows `DRY`, and one a tap is keeping watered shows `WET` (`plotOverlays`). A crop Birds planted shows `SEEDS` while it grows.
- The drawer is off while paused, while an upgrade offer or the shop page is open, and after the run ends.

## Miracle grow (MiracleGrowView)

A button in the right-hand column under the Shop button, shown only once Miracle grow is owned (both modes).

- Shows `miracleGrowText`: `Miracle grow` then `ready`, or the time left on the recharge (`formatClock(miracleReadyAt − tick)`).
- Enabled when `miracleTargets` is not empty. Clicking starts choosing a plot: the plots in `miracleTargets` are outlined and the rest dimmed, as for fertilizer, and the button says `Cancel`. Clicking a highlighted plot sends `useMiracleGrow { plot }`; clicking the button again, anything else, Esc, starting a power-up or fertilizer cancels.
- Choosing ends when no plot is a target any more, and when the game pauses, ends or opens an upgrade offer.

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

A line under the slot buttons lists each lasting effect **started by a power-up** with `endsAt > tick` and the seconds left (`activeEffectText`), e.g. `Order freeze 7s`. Seconds left are `ceil((endsAt − tick) / TICKS_PER_SECOND)`, so it never shows `0s` while the effect still has ticks to run. An effect on its `endsAt` tick has done its last tick and is not listed. While an Order freeze is active, order countdown bars are drawn in a frozen colour. Event effects are shown by the event banner instead, so they are not listed twice. The one exception is Scarecrow, whose guard outlasts its event: while `tick < scarecrowUntil` the line ends with `Scarecrow 45s` (`scarecrowText`). The line shows whenever it has something to list, even with power-ups off.

## Events (EventBanner)

A banner across the top of the board, above the plots, shown while `state.event` is not `null`. Hidden when `allowEvents` is off. It never blocks clicks.

- **News** (`tick < warnAt`, events with `news` only): the banner is the news ticker: a dark strip with `NEWS  Cold snap on the way` (`newsText`). `eventBannerText` is `null` then. The rush banner stacks above it as it does above an event banner.
- **Warning** (`warnAt <= tick < startsAt`): `eventBannerText` gives `Frost in 4s`, with the seconds until `startsAt` rounded up. A plot event adds its plot: `Moles → Plot 2 in 4s`.
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

### Raccoon (RaccoonView)

While `raccoonAt` finds a raccoon, a red button covers the drawer's storage bar (which is shown even when the drawer is folded) with `raccoonText`: `Raccoon in the barn!` and `Tap to shoo  4s` on a second line (whole seconds until it leaves, rounding up). Clicking it sends `shooRaccoon` through `act()`. It is hidden otherwise, and doesn't work while paused, while an upgrade offer or the shop is open, or after the run ends.

### Fog

While `isFogged(state)` (a `fog` effect is working): growing plots show `?` instead of their percentage and their growth bar is hidden (`plotText(plot, now, fog)`), and order cards show `?:??` instead of the time left and hide their countdown bar. Crop names, amounts and values stay visible.

## Small orders (OrdersView)

An order Small order halved has `SMALL` after its number on the first line of its card (`Order #4  SMALL`), and so does a Sneak peek card for one (`Next order  SMALL`).

An order Generous customer tipped has `TIP +10` (its `tip`) after any other tags (`Order #4  SMALL TIP +10`).

An order a Mix-up changed has `MIXED` after its other tags, before any tip (`Order #4  SMALL MIXED TIP +10`), so the player sees which order wants something new. It keeps the tag until it is filled or fails.

A Giant order has `GIANT x3` (how many orders it merged) before any other tags (`Order #6  GIANT x3 TIP +4`). Its card lists one line per crop, so it is taller than the usual 100 px: a card grows to fit its text above the countdown bar, and the cards under it in its column (and the Sneak peek card) move down. A Giant order is the only open order while it is open, so in practice it never pushes others.

## Rush waves (RushBanner, OrdersView)

Timed only.

- **Banner** (`rushBannerText`), orange, in the event banner's spot; while an event banner also shows, it moves up above it. It never takes clicks.
    - During a wave's warning (`upcomingRushWave`): `Rush wave in 3s`, seconds rounded up.
    - While any rush order is open: `Rush wave! 2 left`.
    - Hidden otherwise, in Survival and once the run has ended.
- **Cards:** a rush order's card has an orange fill and `RUSH` after its number (`Order #5  RUSH`, or `Order #5  RUSH SMALL`).
- **Layout:** up to 3 open orders stack in one column of full-width cards. With more, cards narrow to fit two columns left of the stats table, filled top to bottom with `max(3, ceil(n / 2))` rows, so the first three orders keep their rows and the extra ones start the second column. That fits 8 cards above the banner.

## Sneak peek (OrdersView)

With Sneak peek, a dimmed card under the open orders shows `nextOrderPreview(state, crops)` as `Next order`, one `crop xN` line per crop, and its value (`nextOrderText`). It takes no clicks. Hidden without the upgrade.

The overlay rules come from `plotOverlays(state)` in `format.ts`, which returns one list of overlay names per plot, so they can be unit tested without Phaser.

## Shop page (ShopScene)

> Day 8b: replaces the Day 8 `ShopView` that opened by itself on a schedule (see [shop.md](shop.md)).

A Phaser scene launched over the Game scene (`scene.launch`). The Game scene keeps the `GameState`, the tick loop and the action log; it hands the shop page a way to read the state and its `act()` function, so every move made in the shop is checked by the sim and logged.

- **Shop button** on the side of the play screen: `Shop`, with the free restocks banked when there are any (`shopButtonText`: `Shop\n2 free`). Clicking it sends `openShop`; the shop page opens and the clock stops. It is disabled while an upgrade offer is open (the pick comes first), while paused, and after the run ends.
- The page covers the whole screen. At the top: the title and the coins held (`shopTitleText`), then three section buttons, **Shop**, **Storage** and **Your upgrades**, the open one highlighted. It opens on **Shop**. A **Close** button at the bottom sends `closeShop`; the clock resumes. Swiping between sections may come later.
- **Shop section:**
    - **Stock cards**, one per slot (`shopItemText`): an upgrade as on a pick card (name, tier, line, copy count after buying), framed by tier; a power-up's button text; a life with the hearts after buying, or `Lives full`.
    - Under each card a **Buy** button with the price (`shopPriceText`: `Buy 18`), disabled when `canBuyAny` is false. A sold card shows `SOLD`; a Maxed card shows `Maxed` and no button.
    - A targeted upgrade, or Promotion, moves to a second step: `Choose a plot`, `Choose a crop` or `Choose an upgrade to promote`, one button per valid target, and **Back**. Plot targets use `targetText`; Promotion targets show the copy's name and its tier now and after (`promotionTargetText`).
    - **Restock** (`restockText`: `Restock\nfree (2 left)` or `Restock\n10 coins`), disabled when `canRestock` is false, and the progress to the next free restock (`freeRestockText`: `Next free restock in 3 orders`, or `Free restocks full`).
- **Storage section** (moved from the barn): the storage bar; one button per crop with how many are held (`barnCropText`), clicking one selects it; **−** and **+** buttons with the amount between them (`sellAmount` keeps it from 1 to the amount held); **Sell** (`sellButtonText`) and **Sell all**; **Make fertilizer** (`makeFertilizerText`). The barn's HTML amount box is replaced by the Phaser buttons.
- **Your upgrades section:** every owned copy (`ownedUpgradeText`: name, tier, and its plot or crop; a fake copy adds `FAKE`), each with **Sell** and its refund, or the reason it can't be sold (`sellRefundText`: `Sell +15`, `Can't sell`, `Needed by Bigger bumper`, `Barn too full`, or `Fake: 3 orders left` for a fake copy). Past what fits, the list scrolls.
- **Fake cards** (Fake merchant): with Keen eye, a fake card's text ends with a `FAKE` line (`shopItemText`). Without it, it looks like any other card.
- Every button sends its action through `act()`, so it is logged.
- Built as the `Shop` scene (`scenes/Shop.ts`). The Game scene pauses itself (`scene.pause`) while the page is up and resumes on Close, so its keys (P, R, L) wait. Esc closes the page, or goes Back from choosing a target.
- The Shop button sits in the right-hand column between Buy life and Miracle grow, a little narrower than the column so it clears the plot grid.

## End of run (GameOverView)

Shown over the board as soon as `status` is `'ended'`.

- Title (`gameOverTitle`): `Game over` in Survival (lives ran out), `Time's up` in Timed.
- Summary (`gameOverText`), one item per line:
    - The score, from `scoreBreakdown` (see [scoring.md](scoring.md)): `Order points 340`, then one line per end-of-run line whose points aren't 0 (`Best combo bonus +140`, `Failed orders -15`, `Coins left +6`), then `Final score 465`.
    - Survival: `Orders filled`, `Orders failed`, `Time survived`, `Level reached`.
    - Timed: `Orders filled`, `Orders failed`, `Best combo` (the longest streak).
    - Last, the high-score line (`bestScoreText(best, newBest, debugged)`): `New best!` when the final score beat the mode's saved best (and was saved), else `Best 465`. A run changed by the debug menu is never saved and shows `Not saved (debugged run)`. The score is recorded once, when the run ends (see [saves.md](saves.md)).
- The HUD's `Score` row shows `GameState.score` (the order points) during the run; the end-of-run lines only appear on the summary.
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
- `newsText` gives the headline from announcement to `warnAt` and `null` after, and for events without news; `eventBannerText` is `null` during the news. `scarecrowText` counts down to `scarecrowUntil`. `plotOverlays` marks `cloverPlots`.
- `eventBannerText` for the warning of an untargeted and a plot event, for a running lasting event, rounding seconds up, and `null` with no event.
- `plotOverlays` for each row of the overlay table, including a shielded plot left out of Frost and Crows.
- `activeEffectText` shows the name and seconds left, rounding up: `1s` with one tick left, `10s` with 100.
- `isFogged` follows the fog effect's working ticks; `plotText` shows `?` for a growing crop in fog; `orderText` shows `?:??` in fog.
- `nextOrderText` lists the next order's crops and value.
- `orderText` and `nextOrderText` add `SMALL` to the title of a halved order; `orderText` adds `TIP +N` after it for a tipped order, and nothing with no tip; `MIXED` comes before the tip on a mixed order.
- `heartsText(lives, max)` shows a full heart per life and an empty one up to the cap; `buyLifeText` says `Lives full` at the cap.
- `plotOverlays` marks every plot Worms are working on.
- The Level row and the game-over level follow `runLevel` (Steady pace).
- Storage, selling, fertilizer and reroll text: see the "Screen text" tests in [economy.md](economy.md). `sellButtonText` shows Premium produce's boosted price, and a Price crash's lower one while it works.
- `miracleGrowText` reads `ready` with no recharge left (and on `miracleReadyAt` itself), and the time left otherwise.
- Shop: `shopItemText` for an upgrade, Promotion, a power-up and a life slot (and `Lives full`); `shopPriceText` follows `itemPrice` (with Discount card) and shows `SOLD` and `Maxed`; `sellRefundText` follows `sellRefund` and gives each refusal's label; `restockText` shows `free` with the count left while a free restock is banked, else the price; `freeRestockText` counts the orders left, and says full when the bank is; `shopButtonText` shows the banked count; `promotionTargetText` shows the tier now and after. (`shopTimerText` went with the running shop.)
- `shopItemText` adds `FAKE` to a fake card only with Keen eye; `ownedUpgradeText` adds `FAKE` to a fake copy; `sellRefundText` shows the orders left on a fake copy.
- `raccoonText` gives the text and seconds left, rounding up, while a raccoon works, and `null` before it starts and on its `endsAt`.
- `modeBestText`, `bestScoreText` (new best, not, debugged) and `soundButtonText`.
- `HOW_TO_PANELS` has the four panels in order, each with a title and body; `howToPageText` counts from 1.

## Tests (`cues.test.ts`)

- `cues`: a harvested plot gives `harvest`; a plot that went from `ready` to `growing` (Moles) does not; a score rise gives `score` with the one filled order's id, or `null` when two orders were filled; a lost life in Survival gives `lifeLost`; two equal states give no cues.
- `orderChanges`: a new id is `added`; an order that left before its `expiresAt` is removed and not failed; one that left after it is failed.
- `lowTimePulse`: `null` in Survival and before the last 10 seconds of a Timed run; 1 on the tick a second starts in the last 10 seconds, falling towards 0 through the second; `null` once the run has ended.

## Open items

- [x] A Giant order that merged several crops overflowed its fixed 100 px card. Cards now grow to fit their text.
- [ ] Day 8b layout choices made as defaults, to confirm: the first crop starts selected in the crop bar; the drawer starts open and holds the storage bar and Fertilize only (power-ups, Miracle grow and Buy life stay where they are); Buy life stays on the play screen as well as in the shop.

- [ ] Plot upgrades: pick the plot on the board itself (valid plots highlighted, the rest greyed out) instead of a row of `Plot N` buttons, once a plot upgrade can be offered. Greenhouse is the first (see [events.md](events.md)).

- [x] Combo multiplier in Timed, with a Combo row in the HUD and best combo on the summary.
- [x] Rush waves in Timed (Day 5), with a warning banner.
- [x] High score per mode on the mode select (Day 5 saves).
- [ ] Puzzle in the picker once puzzle levels exist.
