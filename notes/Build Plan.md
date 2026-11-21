# Farming Puzzle Game — Build Plan

Nov 16, 2026 · @uni

A playable web version ships in 14 days: Survival and Timed modes with storage, the shop, tiered upgrades, power-ups and events, published on itch.io. The plan assumes about 8 hours a day. The full design does not fit in two weeks, so leaderboards, Daily Challenge, Puzzle mode, tradeoff events, mobile and monetization move to the list at the end. Each day ends with a gate: a check to pass before the next day starts.

## At a glance

&#91;embedded content: roadmap · 14 days, each ending in a gate\]

The days run in order. Day 14 is when real players first see the game.

## Day 1 — Setup and simulation core

Write the game rules in plain TypeScript with no graphics, and prove that the same seed and inputs always give the same result.

### Project setup (about 1.5 hours)

- [x] Create the repo
  - [x] Start a Vite project with the TypeScript template
  - [x] Add Phaser, Vitest, ESLint and Prettier
  - [x] Make the first commit and push to GitHub
- [x] Make the folders
  - [x] `src/sim/` for rules (no Phaser imports allowed)
  - [x] `src/render/` for Phaser scenes
  - [x] `src/app/` for menus and storage
  - [x] `src/data/` for JSON config
- [x] Add a GitHub Actions workflow that runs the tests on every push

### First numbers (about 1 hour)

- [x] Write `crops.json` with 3 crops
  - [x] One fast crop with a low yield
  - [x] One medium crop
  - [x] One slow crop with a high yield
  - [x] Fields for each: id, grow ticks, yield, value
- [x] Set the tick rate to 10 ticks a second, as one constant
- [x] Start with 4 plots
- [x] Write a first scoring rule: base points per filled order, plus a bonus for time left

### Simulation core (about 5.5 hours)

- [x] Game state
  - [x] `GameState` type: tick, RNG state, plots, inventory, orders, score
  - [x] `createGame(seed, config)` returns a fresh state
- [x] Seeded random numbers
  - [x] A small generator (such as mulberry32) whose state lives inside `GameState`
  - [x] Helpers: `nextInt` and `pick`
  - [x] Test: the same seed gives the same first 100 numbers
- [x] Actions
  - [x] `Action` type: plant (plot, crop), harvest (plot), deliver (order)
  - [x] `applyAction(state, action)` rejects bad moves: plot busy, crop not ready, not enough crops
- [x] The tick
  - [x] `step(state)` moves the game forward one tick
  - [x] Grow every planted crop
  - [x] Count down every open order
  - [x] Fail orders that hit zero
  - [x] Create the next order when one closes
- [x] Plots
  - [x] Three states: empty, growing, ready
  - [x] Harvest adds the yield to inventory and empties the plot
- [x] Orders
  - [x] Pick the crop and amount with the seeded generator
  - [x] Read the time limit from config
  - [x] Deliver removes the crops and adds score
- [x] Action log and replay
  - [x] Record every action as tick number + action
  - [x] `replay(seed, config, log)` returns the final state
  - [x] Test: play 500 ticks with scripted actions, replay the log, and check the two states are equal

**Gate:** the replay test passes in CI.

## Day 2 — Playable gray box

Put the simulation on screen with plain colored squares, so one order can be played from planting to delivery.

### Phaser shell (about 1.5 hours)

- [x] Scenes
  - [x] Boot scene that loads config
  - [x] Game scene that owns one `GameState`
  - [x] Portrait canvas (720 × 1280) that scales to fit the window
- [x] Fixed-tick loop
  - [x] Add each frame's elapsed time to a counter
  - [x] Call `step()` once for every 100 ms in the counter
  - [x] Cap catch-up ticks so a background tab doesn't jump ahead

### Drawing (about 3 hours)

- [x] Plot grid
  - [x] One square per plot, colored by state
  - [x] Growth progress bar
  - [x] Highlight when ready
- [x] Order card
  - [x] Crop, amount needed and amount held
  - [x] Countdown bar
  - [x] Bar turns red in the last quarter
- [x] Heads-up display
  - [x] Inventory count per crop
  - [x] Score

### Input (about 2 hours)

- [x] Planting
  - [x] Tap an empty plot to open a 3-button crop picker
  - [x] Tap a crop to plant; tap outside to close
- [x] Tap a ready plot to harvest
- [x] Tap an order card to deliver when there are enough crops
- [x] Send every input through `applyAction` so it lands in the log

### Pause and debug (about 1.5 hours)

- [x] Pause button stops the tick counter; resume restarts it
- [x] Debug overlay showing tick and seed
- [x] Key to restart with the same seed
- [x] Key to print the action log to the console

**Gate:** one order can be played from planting to delivery, and restarting with the same seed gives the same orders.

## Day 3 — Survival rules

Turn the loop into a run that gets harder and always ends.

### Lives and game over (about 1.5 hours)

- [x] Lives in the state, starting at 3
- [x] A failed order costs one life
- [x] At zero lives the run is over and the simulation takes no more actions
- [x] Hearts in the heads-up display
- [x] Plain game-over panel with score and a restart button

### In-run coins (about 1.5 hours)

- [x] Coins in the state, starting at 0
- [x] A filled order pays coins, with the amount read from config
- [x] Coin count in the heads-up display
- [x] Test: a new run always starts with 0 coins

### Buying lives (about 1 hour)

- [x] `buyLife` action
- [x] Price rises with each life bought (base price × a growth factor)
- [x] Buy button shows the price and is disabled when coins are short
- [x] Test: the price sequence matches config

### Difficulty curve (about 2.5 hours)

- [x] `difficulty.json` with one row per level
  - [x] Order time multiplier
  - [x] Most orders open at once
  - [x] Order size range
- [x] Level goes up every few filled orders
- [x] Allow two or more open orders in the simulation
- [x] Draw open orders as stacked cards
- [x] Test: a player who does nothing loses all lives in a fixed number of ticks

### Tuning (about 1.5 hours)

- [x] Play 5 full runs and write down how long each lasts
- [x] Change numbers in the JSON files only, not the code
- [x] Repeat until a typical run lasts 5–10 minutes

**Gate:** every run ends, and a typical run lasts 5–10 minutes.

## Day 4 — Upgrades, power-ups and events

Add the choices and hindrances that make each run different.

### Upgrades (about 3 hours)

- [x] `upgrades.json` with 6 upgrades
  - [x] One extra plot
  - [x] Faster growth
  - [x] Higher yield
  - [x] Longer order timers
  - [x] More coins per order
  - [x] Cheaper lives
- [x] A modifiers object in the state that the rules read from
- [x] Offer flow
  - [x] Every 5 filled orders, the simulation picks 3 different upgrades with the seeded generator
  - [x] The clock stops while the player chooses
  - [x] `chooseUpgrade` action applies the pick
- [x] Pick screen: 3 cards, each with a name and one line of text
- [x] Test: a run with upgrade picks replays exactly

### Power-ups (about 2 hours)

- [x] Two power-ups
  - [x] Instantly finish growing one plot
  - [x] Freeze all order timers for 10 seconds
- [x] Chance to drop on harvest, rolled with the seeded generator
- [x] Two held slots, shown as buttons
- [x] `usePowerUp` action

### Events (about 3 hours)

- [x] Event framework
  - [x] Each event has a warning time, a duration, a start effect and an end effect
  - [x] A scheduler picks events with the seeded generator
  - [x] The gap between events shrinks as difficulty rises
  - [x] Warning banner with a countdown
- [x] Weeds: one plot grows at half speed until the player taps it clear
- [x] Crows: a ready crop is eaten unless it is harvested before the warning ends
- [x] Blocked plot: one empty plot can't be used for a while
- [x] One fixed-seed test per event

**Gate:** the pick-1-of-3 screen and all 3 events work in a run, and that run still replays exactly.

## Day 5 — Timed mode, scoring and saves

Add the second mode on the same simulation, then finish scoring and local saves.

### Mode config (about 1.5 hours)

- [x] `modes.json`
  - [x] Survival: starting lives, ends when lives run out
  - [x] Timed: run length in ticks, no lives, ends when the timer runs out
- [x] `createGame` takes a mode, and the end check reads it
- [x] Mode select screen with two buttons

### Timed rules (about 3 hours)

- [x] Start with 3 open orders
- [x] Combo multiplier
  - [x] Goes up with each order filled in a row, up to a cap
  - [x] A failed order resets it
  - [x] Shown in the heads-up display
  - [x] Combo timer: the multiplier drops back if no order is filled before it runs out (the Combo freeze power-up pauses it)
- [ ] Rush waves
  - [ ] A burst of short orders at set times
  - [ ] Warning banner before each wave
- [ ] Large run timer on screen
- [x] A failed order breaks the combo and costs no life

### Scoring and summary (about 2 hours)

- [ ] Final score formula for each mode, kept in one file
- [ ] Run summary screen
  - [x] Score
  - [x] Orders filled and failed
  - [x] Time survived (Survival) or best combo (Timed)
  - [x] Play again and menu buttons

### Saves (about 1.5 hours)

- [ ] Storage wrapper around `localStorage` with try/catch
- [ ] High score per mode
  - [ ] Shown on the mode select screen
  - [ ] "New best" message on the summary screen
- [ ] Sound on/off setting
- [x] Test: a Timed run replays exactly

**Gate:** both modes can be played to the end, and high scores are still there after a page reload.

## Day 6 — Storage and the in-run economy

Cap how many crops the player can hold, and give in-run coins all three of their uses (rerolls and lives today, the shop on Day 8).

### Storage (about 3 hours)

- [ ] Storage cap in config, read from `crops.json` total can never pass it
- [ ] Harvest is rejected when storage is full, and the plot stays ready
- [ ] `sellCrop` action: sell stored crops for coins at each crop's sell price
- [ ] Storage bar in the heads-up display that turns red when full
- [ ] Test: full storage blocks harvesting until a crop is sold

### Fertilizer (about 2 hours)

- [ ] `makeFertilizer` action turns crops into fertilizer, at a rate set in config
- [ ] `useFertilizer` on one growing plot speeds up that crop
- [ ] A config flag makes fertilizer a basic action or locks it behind an upgrade, since the design hasn't decided
- [ ] Test: fertilizer frees storage and shortens growth by the configured amount

### Rerolls and lives (about 1.5 hours)

- [ ] `reroll` action: pay coins to redraw the 3 free upgrade choices; each reroll in a run costs more than the last
- [ ] Life price rule per mode in `modes.json`: rises per life bought, or scales with elapsed time
- [ ] Test: coins and the reroll price reset when a new run starts

### Tuning (about 1.5 hours)

- [ ] Play 3 Survival runs and set the storage cap so it bites mid-run, not from the first order
- [ ] Set crop sell prices so selling helps but filling orders pays more

**Gate:** storage fills and empties during a normal run, and a run with sells, fertilizer and rerolls replays exactly.

## Day 7 — Upgrade tiers and the full upgrade list

Replace Day 4's 6 flat upgrades with the design's tiered system, then add every upgrade that doesn't need the shop, power-ups or new events.

### Tier system (about 3 hours)

- [ ] Rewrite `upgrades.json`: id, stat, pool (Survival, Timed, both, or shop only), and either 5 tier values or one fixed tier
- [ ] Move Day 4's upgrades onto the new format: Fast growth, Bumper harvest, Patient customers, Big tips, Life discount; Extra plot becomes shop only
- [ ] Tier roll odds in config, with placeholder values until the design sets them
- [ ] Stat caps: an upgrade that would pass the cap adds only what is left
- [ ] Offer filter: skip upgrades whose stat is capped or that reached their max copies
- [ ] The free pick draws from the current mode's pool
- [ ] Tier name and color on each pick card
- [ ] Test: once a stat hits its cap, its upgrades are never offered again

### Upgrades for both modes (about 3 hours)

- [ ] Growth and yield: Fast growth, Bumper harvest, Bigger bumper, Favorite crop
- [ ] Orders: Patient customers, Small order, Sneak peek, Early bird
- [ ] Coins and storage: Big tips, Premium produce, Bigger barn
- [ ] Miracle grow: a button that finishes one plot, then recharges
- [ ] Greenhouse: one chosen plot is safe from bad events (works on Day 4's three events now)

### Mode upgrades (about 2 hours)

- [ ] Survival: Second chance, Life discount, Steady pace, Extra heart, Last stand, Second wind
- [ ] Timed: Combo keeper, Combo builder, Rush pay, Head start, Grand finale, Double delivery
- [ ] Test: a fixed-seed run in each mode with 10 picks replays exactly

**Gate:** every upgrade listed today can be offered and picked, caps and copy limits hold, and a run with 10 picks replays exactly.

## Day 8 — The shop

Add the second upgrade system, where players spend coins on the exact upgrades, power-ups and lives they want.

### Shop rules (about 3 hours)

- [ ] When it opens, as a config switch, because the design hasn't decided
  - [ ] Survival: every few filled orders, with the clock paused
  - [ ] Timed: a short break between rush waves, or open while the clock keeps running
- [ ] Stock of 3–4 items from the mode's pool plus shop-only upgrades, power-ups and (Survival only) lives
- [ ] Prices: the tier sets the base price; the rise rule (run progress, per copy, or both) is config
- [ ] `buyItem`, `sellUpgrade` (refund share in config) and `restock` (each restock costs more)
- [ ] Test: shop stock and prices replay exactly

### Shop screen (about 2 hours)

- [ ] Item cards with tier, price, and a buy button that is disabled when coins are short
- [ ] Owned upgrades with sell buttons and their refund
- [ ] Restock button with its price, and a close button

### Shop-only upgrades (about 3 hours)

- [ ] Plot upgrades with a plot picker: Extra plot, Rich soil, Quick soil, Auto-harvester
- [ ] Coin upgrades: Interest, Discount card, Free restock
- [ ] Tier upgrades: Lucky stars, Promotion
- [ ] Test: Promotion raises an owned upgrade one tier and respects the stat cap

**Gate:** the shop opens on schedule in both modes, buying and selling change coins and upgrades correctly, and the run replays exactly.

## Day 9 — Power-ups

Grow Day 4's two power-ups into the design's full set of 14, split into lasting and instant.

### Framework (about 2 hours)

- [ ] `powerups.json`: id, lasting or instant, duration or amount, drop weight, shop price
- [ ] Lasting power-ups keep a timer, shown as an icon with time left in the heads-up display
- [ ] Weighted drop roll on harvest, plus buying in the shop (Day 8)
- [ ] Number of held slots in config, starting at 2
- [ ] A per-mode flag to turn power-ups off, ready for the Daily Challenge later

### Lasting power-ups (about 1.5 hours)

- [ ] Order freeze (replaces Day 4's freeze; the run timer keeps running)
- [ ] Combo freeze (Timed only; pauses the combo timer from Day 5)
- [ ] Auto harvest (storage limits still apply)
- [ ] Good omen, behind a flag until good events land on Day 10

### Instant power-ups (about 3.5 hours)

- [ ] Crop timing: Growth boost, Ready one (replaces Day 4's finish-one-plot), Ready all
- [ ] Orders: Finish one, and Finish all (rare, or with no combo or points bonus; set in config while the design decides)
- [ ] Coins: Gold rush, Coin bag
- [ ] Merchant call: opens the shop
- [ ] Giant order: clears current orders into one large order; failing it adds the mode penalty (more orders in Survival, a gap with no orders in Timed)
- [ ] Clean slate: clears the field so the player can replant

### Related upgrades (about 1 hour)

- [ ] Lucky drops, Long-lasting, Big pockets
- [ ] Test: one fixed-seed test per power-up

**Gate:** every power-up can drop, be bought and be used in both modes, and a run that uses them replays exactly.

## Day 10 — News and good events

Add the news ticker and the 8 good events, so runs have welcome surprises as well as trouble.

### Event data and news (about 2 hours)

- [ ] `events.json`: kind (good or bad), weight, warning time, duration, effect; move Day 4's three events into it
- [ ] The scheduler balances good and bad events by weight
- [ ] News ticker: a small banner that announces some events and never stops play
- [ ] Early warning upgrade makes warnings and news arrive sooner

### Good events (about 4 hours)

- [ ] Growth: Rain shower (a one-time cut), Sunny spell (faster growth for a while)
- [ ] Yield: Worms, Lucky clover
- [ ] Protection: Scarecrow blocks some bad events for a while
- [ ] Helping hands: Helpful neighbor harvests ripe crops, within storage limits
- [ ] Orders: Generous customer, Slow day (the run timer is not affected)
- [ ] Turn on the Good omen power-up from Day 9

### Related upgrades (about 2 hours)

- [ ] Good fortune, Rainmaker, Long summer, Worm farm, Four-leaf, Good neighbors, Big spender
- [ ] Test: one fixed-seed test per event

**Gate:** all 8 good events and the ticker show up in a run, Early warning visibly moves warnings sooner, and the run replays exactly.

## Day 11 — Bad events on the field

Add the bad events that hit plots and growth, each with the upgrade that counters it.

### Field events (about 5 hours)

- [ ] Rework Crows to match the design: they block harvesting for a while (Day 4's version ate a ready crop)
- [ ] Drought: crops grow only while the player taps them; keep it short so it isn't a chore
- [ ] Frost: crops stop growing for a few seconds, and tapping doesn't help
- [ ] Birds: drop random seeds on empty plots, plus a tap to dig a seed up
- [ ] Moles: steal the crop from one plot, which starts over
- [ ] Fog: hides growth timers or order details for a while

### Counter upgrades (about 2.5 hours)

- [ ] Calm skies (fewer bad events overall)
- [ ] Pest control: Drought, Birds or Crows never happen again this run
- [ ] Irrigation, Frost cover, Bird net, Crow decoy, Mole traps, Lantern

### Tests (about 30 minutes)

- [ ] One fixed-seed test per event, and one with its counter upgrade

**Gate:** every field event can hit in a run, Greenhouse and each counter upgrade change it as listed, and the run replays exactly.

## Day 12 — Bad events on storage, orders and prices, then balance

Add the last bad events, then tune the whole game with everything turned on.

### Storage, order and market events (about 3.5 hours)

- [ ] Storage: Raccoon (takes stored crops unless tapped away in time), Rot (removes a share of storage)
- [ ] Orders: Emergency order (forced, with a shorter timer), Mix-up (an order changes what it wants)
- [ ] Prices: Price crash (crops sell for less for a while)
- [ ] Fake merchant: the shop sells fake upgrades with negative effects that wear off after a few orders (count in config, since the design hasn't set it)

### Counter upgrades (about 1.5 hours)

- [ ] Guard dog, Root cellar, Calm nerves, Clear orders, Price floor, Keen eye
- [ ] Test: one fixed-seed test per event

### Balance pass (about 3 hours)

- [ ] Play 3 runs per mode with all systems on, and note run length and score
- [ ] Tune event frequency, storage cap, shop prices and tier odds in the JSON files only
- [ ] Keep a typical Survival run at 5–10 minutes, as on Day 3
- [ ] Check that no single upgrade or power-up wins every run

**Gate:** every event, upgrade and all power-ups appear across a few runs, a typical Survival run still lasts 5–10 minutes, and every run replays exactly.

## Day 13 — Art, sound and menus

Replace the gray boxes so the game looks and sounds finished. Only `render/` and `app/` change today.

### Art (about 4.5 hours)

- [ ] Pick one free asset pack or one flat style, and one color palette
- [ ] Crop sprites: seed, growing and ready, for each of the 3 crops
- [ ] Interface pieces
  - [ ] Plot tile and background
  - [ ] Order card and buttons
  - [ ] Heart and coin icons
- [ ] Icons for every event, power-up and upgrade, from one icon pack
- [ ] Swap the squares for sprites
- [ ] Tier frames for upgrade cards, one color per tier
- [ ] Shop screen, storage bar and news ticker

### Juice (about 1 hour)

- [ ] Pop animation on harvest
- [ ] Floating score text on a filled order
- [ ] Order cards slide in and out
- [ ] Screen shake on a lost life
- [ ] Timer pulses when time is low

### Sound (about 1 hour)

- [ ] Eight effects: plant, harvest, order filled, order failed, upgrade, shop buy, event warning, game over
- [ ] Mute toggle wired to the saved setting
- [ ] One music loop, if time allows

### Menus (about 1.5 hours)

- [ ] Title screen: play, how to play, sound
- [ ] How to play: 4 short panels (orders, storage, upgrades and the shop, events)
- [ ] Pause menu: resume, restart, quit

**Gate:** a full session, from title to run to summary and back, shows no placeholder art.

## Day 14 — Playtest, fix and publish

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
  - [ ] Note whether they understand storage and the shop
- [ ] List the problems and pick the top 3

### Fix (about 3.5 hours)

- [ ] Fix the top 3 problems
- [ ] Balance pass in the JSON files
- [ ] Bug sweep
  - [ ] Switching tabs mid-run
  - [ ] Resizing the window
  - [ ] Double taps
  - [ ] Pausing during an event or an upgrade pick
  - [ ] Pausing or switching tabs with the shop open
  - [ ] Storage filling up during Auto harvest or Helpful neighbor

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

Cut in this order, and keep the replay test and the Day 14 playtest no matter what.

1. Music loop, and the how-to-play panels (use one screen of text)
2. Fake merchant and Keen eye
3. Fertilizer (keep selling crops)
4. Selling upgrades back and restocking the shop (keep buying)
5. Event counter upgrades, except Pest control and Calm skies
6. Power-ups down to 4: Ready one, Order freeze, Coin bag, Clean slate
7. Bad events down to Day 4's three plus Drought, Frost and Rot (Days 11 and 12 become one day)
8. Combo multiplier and rush waves (Timed mode becomes a timer with several orders)
9. Timed mode (ship Survival only)

## After launch

These parts of the design are not in the 14-day build. Hours are rough estimates.

| Feature | Why it waits | Rough size |
| --- | --- | --- |
| Server, verified leaderboards, Daily Challenge | Needs a backend, and scores worth protecting | 60 hours |
| Puzzle mode, level format and solver | Needs 15–20 handmade levels | 60 hours |
| Crop unlocks and pre-run crop picks, collectibles, meta currency and pre-loaded power-ups | Long-term hooks only matter once people replay | 30 hours |
| iOS and Android builds | Store review alone can take days | 30 hours |
| Paid coins and payments | Needs the server and the store builds first | 45 hours |
| Tradeoff events and their upgrades (Festival spirit, Weed killer, Haggler, Loaded coin) | Still candidates in the design doc | 15 hours |
