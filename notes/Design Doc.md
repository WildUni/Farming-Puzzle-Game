# Farming Puzzle Game — Design Doc

Nov 15, 2026 · @uni

## Overview

Players fill timed crop orders by choosing what to plant and when, on a limited number of plots. Order countdowns and plant growth both run in real seconds. Each crop has its own growth time and yield, so every order is a small scheduling puzzle.

## Decided

The game has three modes built on the same loop, plus shared systems for events, crops and rewards.

### Modes

| Mode | Goal | How it ends | Mode-specific features |
| --- | --- | --- | --- |
| Survival | Last as long as possible | Lives run out | Limited lives; coins buy lives back or upgrades; pick-1-of-3 upgrades every few orders |
| Timed | Highest score in a set time | Timer runs out | Several orders can arrive at once; combo multiplier; rush waves |
| Puzzle | Solve handcrafted levels | Order filled or failed | Orders and time limits shown before the start; plan first, then play in real time |

### Systems

- **Upgrades:** offered as a choice (pick 1 of 3), not purely random.
- **Buying lives:** the price rises each time, or scales with elapsed time, depending on mode.
- **Power-ups:** dropped randomly from harvests or bought with coins. Possibly pre-loaded before a run using currency earned from finished runs (TBD).
- **Currencies:** in-run coins buy lives and upgrades during a run and reset when the run ends. Meta currency (earned from finished runs) and paid coins (bought with real money) carry over between runs.
- **Plots:** limited, so players must choose what to plant.
- **Events:** hindrances such as weeds, crows, picky customers and blocked plots. Every event gives a warning before it hits. Events with tradeoffs are planned (TBD).
- **Crops:** players earn points to unlock new crops with different tradeoffs. Before a run, players pick which crops to bring, and orders only ask for those crops.
- **Daily Challenge:** fixed modifiers (starting upgrades, boosts, selected crops), no power-ups, and a shared random seed so every player gets the same run. Has its own leaderboard.
- **Leaderboards:** high scores per mode, split into power-up and no-power-up boards.
- **Collectibles:** mystery boxes after a finished mode grant cosmetic skins or small boosts.
- **Scoring:** calculated on the player's device for now.

## Design notes

### Ending a Survival run

Difficulty keeps rising until the player runs out of lives: tighter timers, more orders at once, and more frequent events. Rising life prices make sure every run ends eventually.

Optional: a cash-out point every \~10 orders. The player can stop and keep a bonus, or keep going and risk it.

### Puzzle mode

- Star ratings (finished, finished fast, finished with crops to spare) give a reason to replay solved puzzles.
- Keep the plan visible during play, or allow a quick peek, so a forgotten detail doesn't ruin the run.

### Leaderboards

The power-up board will favor players who have saved more currency from past runs. The no-power-up board is the pure-skill board.

### Seed and action log

Save each run's random seed and a log of the player's actions. A server can then replay the log to check scores later. The same log helps with the daily challenge and with debugging.

## Tradeoff event ideas

These are candidates, not yet decided. Each one asks the player to give something up for a gain.

| Event | Gain | Cost |
| --- | --- | --- |
| Traveling merchant | A rare seed or a power-up | Spends harvested crops needed for current orders |
| Bee swarm | All plots grow 50% faster for 20 s | No harvesting while the bees are there |
| Market day | One crop type pays double for a while | Plots must be switched over in time |
| Golden seed | A very large reward | Very slow; takes up a plot for a long time |
| Rush order | A huge reward | A very short timer; take it or skip it |

## Monetization (later)

Paid coins, bought with real money, carry over between runs and are separate from both in-run coins and meta currency (name TBD). They spend on skins, power-ups and return packs. None of this ships at launch.

| Item | What the player gets | Paid with |
| --- | --- | --- |
| Currency pack | A set amount of paid currency | Real money |
| Skin | A cosmetic look, no gameplay effect | Paid currency |
| Power-up | A boost for one run | Paid currency |
| Return pack | Currency paid back as the player reaches gameplay goals | Paid coins or real money (TBD) |

### Payments

- **iOS and Android:** currency packs are consumable in-app purchases through Apple and Google Play. RevenueCat's Capacitor plugin handles both stores.
- **Web:** Stripe checkout.
- **US iOS links to web checkout:** allowed, but Apple's in-app purchase must still be offered. The rules are still changing in court; recheck before launch.

### Rules this sets

- **The server owns the balance.** A purchase is verified on the server (RevenueCat webhook to Supabase) before currency is granted. Spending also happens on the server; the device never writes the balance.
- **Leaderboards stay fair.** Power-ups bought with paid currency count only on the power-up board. The no-power-up board and the Daily Challenge stay free of them.
- **Mystery boxes are not sold.** They stay free rewards for finishing a mode, which avoids loot-box rules (published odds, bans in some countries).
- **Return packs pay out by goals, not chance.** A fixed payout per goal keeps them from counting as loot boxes.

## Open questions

- [ ] How is scoring calculated in each mode?
- [ ] How are power-ups earned and priced (harvest drops, coins, meta currency)?
- [ ] How is meta currency earned, and what does it buy?
- [ ] What is the starting crop list, and what are each crop's stats?
- [ ] How fast does difficulty rise in Survival?
- [ ] Which tradeoff events make the cut?
- [ ] Return packs (decide later): which gameplay goals pay out, how much each pays, and whether a pack costs paid coins or real money.
