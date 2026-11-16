# Farming Puzzle Game — Build Plan

Nov 16, 2026 · @uni

A playable web version ships in 7 days: Survival and Timed modes, published on itch.io. The plan assumes about 8 hours a day. The full design does not fit in one week, so leaderboards, Daily Challenge, Puzzle mode, mobile and monetization move to the list at the end. Each day ends with a gate: a check to pass before the next day starts.

## At a glance

&#91;embedded content: roadmap · 7 days, each ending in a gate\]

The days run in order. Day 7 is when real players first see the game.

## Day 1 — Setup and simulation core

Write the game rules in plain TypeScript with no graphics, and prove that the same seed and inputs always give the same result.

### Project setup (about 1.5 hours)

- [ ] Create the repo
  - [ ] Start a Vite project with the TypeScript template
  - [ ] Add Phaser, Vitest, ESLint and Prettier
  - [ ] Make the first commit and push to GitHub
- [ ] Make the folders
  - [ ] `src/sim/` for rules (no Phaser imports allowed)
  - [ ] `src/render/` for Phaser scenes
  - [ ] `src/app/` for menus and storage
  - [ ] `src/data/` for JSON config
- [ ] Add a GitHub Actions workflow that runs the tests on every push

### First numbers (about 1 hour)

- [ ] Write `crops.json` with 3 crops
  - [ ] One fast crop with a low yield
  - [ ] One medium crop
  - [ ] One slow crop with a high yield
  - [ ] Fields for each: id, grow ticks, yield, value
- [ ] Set the tick rate to 10 ticks a second, as one constant
- [ ] Start with 4 plots
- [ ] Write a first scoring rule: base points per filled order, plus a bonus for time left

### Simulation core (about 5.5 hours)

- [ ] Game state
  - [ ] `GameState` type: tick, RNG state, plots, inventory, orders, score
  - [ ] `createGame(seed, config)` returns a fresh state
- [ ] Seeded random numbers
  - [ ] A small generator (such as mulberry32) whose state lives inside `GameState`
  - [ ] Helpers: `nextInt` and `pick`
  - [ ] Test: the same seed gives the same first 100 numbers
- [ ] Actions
  - [ ] `Action` type: plant (plot, crop), harvest (plot), deliver (order)
  - [ ] `applyAction(state, action)` rejects bad moves: plot busy, crop not ready, not enough crops
- [ ] The tick
  - [ ] `step(state)` moves the game forward one tick
  - [ ] Grow every planted crop
  - [ ] Count down every open order
  - [ ] Fail orders that hit zero
  - [ ] Create the next order when one closes
- [ ] Plots
  - [ ] Three states: empty, growing, ready
  - [ ] Harvest adds the yield to inventory and empties the plot
- [ ] Orders
  - [ ] Pick the crop and amount with the seeded generator
  - [ ] Read the time limit from config
  - [ ] Deliver removes the crops and adds score
- [ ] Action log and replay
  - [ ] Record every action as tick number + action
  - [ ] `replay(seed, config, log)` returns the final state
  - [ ] Test: play 500 ticks with scripted actions, replay the log, and check the two states are equal

**Gate:** the replay test passes in CI.

## Day 2 — Playable gray box

Put the simulation on screen with plain colored squares, so one order can be played from planting to delivery.

### Phaser shell (about 1.5 hours)

- [ ] Scenes
  - [ ] Boot scene that loads config
  - [ ] Game scene that owns one `GameState`
  - [ ] Portrait canvas (720 × 1280) that scales to fit the window
- [ ] Fixed-tick loop
  - [ ] Add each frame's elapsed time to a counter
  - [ ] Call `step()` once for every 100 ms in the counter
  - [ ] Cap catch-up ticks so a background tab doesn't jump ahead

### Drawing (about 3 hours)

- [ ] Plot grid
  - [ ] One square per plot, colored by state
  - [ ] Growth progress bar
  - [ ] Highlight when ready
- [ ] Order card
  - [ ] Crop, amount needed and amount held
  - [ ] Countdown bar
  - [ ] Bar turns red in the last quarter
- [ ] Heads-up display
  - [ ] Inventory count per crop
  - [ ] Score

### Input (about 2 hours)

- [ ] Planting
  - [ ] Tap an empty plot to open a 3-button crop picker
  - [ ] Tap a crop to plant; tap outside to close
- [ ] Tap a ready plot to harvest
- [ ] Tap an order card to deliver when there are enough crops
- [ ] Send every input through `applyAction` so it lands in the log

### Pause and debug (about 1.5 hours)

- [ ] Pause button stops the tick counter; resume restarts it
- [ ] Debug overlay showing tick and seed
- [ ] Key to restart with the same seed
- [ ] Key to print the action log to the console

**Gate:** one order can be played from planting to delivery, and restarting with the same seed gives the same orders.

## Day 3 — Survival rules

Turn the loop into a run that gets harder and always ends.

### Lives and game over (about 1.5 hours)

- [ ] Lives in the state, starting at 3
- [ ] A failed order costs one life
- [ ] At zero lives the run is over and the simulation takes no more actions
- [ ] Hearts in the heads-up display
- [ ] Plain game-over panel with score and a restart button

### In-run coins (about 1.5 hours)

- [ ] Coins in the state, starting at 0
- [ ] A filled order pays coins, with the amount read from config
- [ ] Coin count in the heads-up display
- [ ] Test: a new run always starts with 0 coins

### Buying lives (about 1 hour)

- [ ] `buyLife` action
- [ ] Price rises with each life bought (base price × a growth factor)
- [ ] Buy button shows the price and is disabled when coins are short
- [ ] Test: the price sequence matches config

### Difficulty curve (about 2.5 hours)

- [ ] `difficulty.json` with one row per level
  - [ ] Order time multiplier
  - [ ] Most orders open at once
  - [ ] Order size range
- [ ] Level goes up every few filled orders
- [ ] Allow two or more open orders in the simulation
- [ ] Draw open orders as stacked cards
- [ ] Test: a player who does nothing loses all lives in a fixed number of ticks

### Tuning (about 1.5 hours)

- [ ] Play 5 full runs and write down how long each lasts
- [ ] Change numbers in the JSON files only, not the code
- [ ] Repeat until a typical run lasts 5–10 minutes

**Gate:** every run ends, and a typical run lasts 5–10 minutes.

## Day 4 — Upgrades, power-ups and events

Add the choices and hindrances that make each run different.

### Upgrades (about 3 hours)

- [ ] `upgrades.json` with 6 upgrades
  - [ ] One extra plot
  - [ ] Faster growth
  - [ ] Higher yield
  - [ ] Longer order timers
  - [ ] More coins per order
  - [ ] Cheaper lives
- [ ] A modifiers object in the state that the rules read from
- [ ] Offer flow
  - [ ] Every 5 filled orders, the simulation picks 3 different upgrades with the seeded generator
  - [ ] The clock stops while the player chooses
  - [ ] `chooseUpgrade` action applies the pick
- [ ] Pick screen: 3 cards, each with a name and one line of text
- [ ] Test: a run with upgrade picks replays exactly

### Power-ups (about 2 hours)

- [ ] Two power-ups
  - [ ] Instantly finish growing one plot
  - [ ] Freeze all order timers for 10 seconds
- [ ] Chance to drop on harvest, rolled with the seeded generator
- [ ] Two held slots, shown as buttons
- [ ] `usePowerUp` action

### Events (about 3 hours)

- [ ] Event framework
  - [ ] Each event has a warning time, a duration, a start effect and an end effect
  - [ ] A scheduler picks events with the seeded generator
  - [ ] The gap between events shrinks as difficulty rises
  - [ ] Warning banner with a countdown
- [ ] Weeds: one plot grows at half speed until the player taps it clear
- [ ] Crows: a ready crop is eaten unless it is harvested before the warning ends
- [ ] Blocked plot: one empty plot can't be used for a while
- [ ] One fixed-seed test per event

**Gate:** the pick-1-of-3 screen and all 3 events work in a run, and that run still replays exactly.

## Day 5 — Timed mode, scoring and saves

Add the second mode on the same simulation, then finish scoring and local saves.

### Mode config (about 1.5 hours)

- [ ] `modes.json`
  - [ ] Survival: starting lives, ends when lives run out
  - [ ] Timed: run length in ticks, no lives, ends when the timer runs out
- [ ] `createGame` takes a mode, and the end check reads it
- [ ] Mode select screen with two buttons

### Timed rules (about 3 hours)

- [ ] Start with 3 open orders
- [ ] Combo multiplier
  - [ ] Goes up with each order filled in a row, up to a cap
  - [ ] A failed order resets it
  - [ ] Shown in the heads-up display
- [ ] Rush waves
  - [ ] A burst of short orders at set times
  - [ ] Warning banner before each wave
- [ ] Large run timer on screen
- [ ] A failed order breaks the combo and costs no life

### Scoring and summary (about 2 hours)

- [ ] Final score formula for each mode, kept in one file
- [ ] Run summary screen
  - [ ] Score
  - [ ] Orders filled and failed
  - [ ] Time survived (Survival) or best combo (Timed)
  - [ ] Play again and menu buttons

### Saves (about 1.5 hours)

- [ ] Storage wrapper around `localStorage` with try/catch
- [ ] High score per mode
  - [ ] Shown on the mode select screen
  - [ ] "New best" message on the summary screen
- [ ] Sound on/off setting
- [ ] Test: a Timed run replays exactly

**Gate:** both modes can be played to the end, and high scores are still there after a page reload.

## Day 6 — Art, sound and menus

Replace the gray boxes so the game looks and sounds finished. Only `render/` and `app/` change today.

### Art (about 3.5 hours)

- [ ] Pick one free asset pack or one flat style, and one color palette
- [ ] Crop sprites: seed, growing and ready, for each of the 3 crops
- [ ] Interface pieces
  - [ ] Plot tile and background
  - [ ] Order card and buttons
  - [ ] Heart and coin icons
- [ ] Event icons: weeds, crow, blocked plot
- [ ] Swap the squares for sprites

### Juice (about 2 hours)

- [ ] Pop animation on harvest
- [ ] Floating score text on a filled order
- [ ] Order cards slide in and out
- [ ] Screen shake on a lost life
- [ ] Timer pulses when time is low

### Sound (about 1 hour)

- [ ] Six effects: plant, harvest, order filled, order failed, upgrade, game over
- [ ] Mute toggle wired to the saved setting
- [ ] One music loop, if time allows

### Menus (about 1.5 hours)

- [ ] Title screen: play, how to play, sound
- [ ] How to play: 3 short panels
- [ ] Pause menu: resume, restart, quit

**Gate:** a full session, from title to run to summary and back, shows no placeholder art.

## Day 7 — Playtest, fix and publish

Watch real people play, fix what trips them up, and make the page public.

### Playtest (about 2.5 hours)

- [ ] Upload a private draft to itch.io
  - [ ] Run the production build
  - [ ] Zip the output folder
  - [ ] Create an HTML5 project and set the viewport size
- [ ] Check it in Chrome, Safari and one phone browser
- [ ] Watch 3–5 people play for 10 minutes each, without helping
  - [ ] Note where each one gets stuck
  - [ ] Note what ends their first run
  - [ ] Note when they stop wanting to play
- [ ] List the problems and pick the top 3

### Fix (about 3.5 hours)

- [ ] Fix the top 3 problems
- [ ] Balance pass in the JSON files
- [ ] Bug sweep
  - [ ] Switching tabs mid-run
  - [ ] Resizing the window
  - [ ] Double taps
  - [ ] Pausing during an event or an upgrade pick

### Publish (about 2 hours)

- [ ] itch.io page
  - [ ] Title and short description
  - [ ] Cover image and 3 screenshots
  - [ ] Controls
- [ ] Feedback link on the game-over screen
- [ ] Set the page to public and share the link
- [ ] Tag the release in git

**Gate:** the public link works on a phone and a laptop, and a new player can finish a run without help.

## If you fall behind

Cut in this order, and keep the replay test and the Day 7 playtest no matter what.

1. Music loop, and the how-to-play panels (use one screen of text)
2. Power-ups (keep upgrades)
3. Combo multiplier and rush waves (Timed mode becomes a timer with several orders)
4. The blocked-plot event
5. Timed mode (ship Survival only)

## After this week

These parts of the design are not in the 7-day build. Hours are rough estimates.

| Feature | Why it waits | Rough size |
| --- | --- | --- |
| Server, verified leaderboards, Daily Challenge | Needs a backend, and scores worth protecting | 60 hours |
| Puzzle mode, level format and solver | Needs 15–20 handmade levels | 60 hours |
| Crop unlocks, collectibles, meta currency | Long-term hooks only matter once people replay | 30 hours |
| iOS and Android builds | Store review alone can take days | 30 hours |
| Paid coins and payments | Needs the server and the store builds first | 45 hours |
| Tradeoff events and the cash-out point | Still undecided in the design doc | 10 hours |
