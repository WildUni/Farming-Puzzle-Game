# Farming Puzzle Game — Design Doc

Nov 15, 2026 · @uni

## Overview

Players fill timed crop orders by choosing what to plant and when, on a limited number of plots. Order countdowns and plant growth both run in real seconds. Each crop has its own growth time and yield, so every order is a small scheduling puzzle.

## Decided

The game has three modes built on the same loop, plus shared systems for events, crops and rewards.

### Modes

| Mode | Goal | How it ends | Mode-specific features |
| --- | --- | --- | --- |
| Survival | Last as long as possible | Lives run out | Limited lives; coins buy lives back |
| Timed | Highest score in a set time | Timer runs out (it is never extended) | Several orders can arrive at once; combo multiplier; rush waves |
| Puzzle | Solve handcrafted levels | Order filled or failed | Orders and time limits shown before the start; plan first, then play in real time |
|  |  |  |  |

### Systems

- **Upgrades:** available in both Survival and Timed. Every few orders the player picks 1 of 3 for free. Paying in-run coins rerolls the 3 choices, as many times as the player can afford. Each reroll of the same pick costs more than the last, and the price goes back to its base on the next pick.
- **Shop:** a second upgrade system where players spend in-run coins on the specific upgrades they want, so they can build toward a plan instead of relying on the free picks. It shows 3–4 items at a time and also sells power-ups and, in Survival, lives. Players can also sell an owned upgrade back for coins. The shop can be opened at any time, and opening it pauses the clock in both modes. The stock only changes when the player restocks, so an item they are saving up for never disappears. Filling orders earns free restocks: one for every 7 filled orders (the number is per mode in config), banked up to 2; while the bank is full, filled orders don't count toward the next one. Free restocks are always used first; with none banked, a restock costs a fixed price in coins (it doesn't rise, and paid restocks aren't capped). The first stock is drawn the first time the shop is opened. The shop can't be opened while a free upgrade pick is waiting: the pick comes first. How prices rise is an open question. See Screen layout below.
- **Buying lives:** the price rises each time, or scales with elapsed time, depending on mode.
- **Power-ups:** available in both Survival and Timed. Dropped randomly from harvests or bought with coins. Possibly pre-loaded before a run using currency earned from finished runs (TBD).
- **Currencies:** in-run coins have three uses during a run: the shop, rerolling the free upgrade pick, and lives (Survival only). They reset when the run ends. Meta currency (earned from finished runs) and paid coins (bought with real money) carry over between runs.
- **Plots:** limited, so players must choose what to plant.
- **Storage:** a limit on how many harvested crops the player can hold. Storage upgrades raise it. When storage is full, the player can't harvest until they free up space: sell crops for coins, turn some crops into fertilizer, or raise their storage. Selling crops and making fertilizer happen in the shop page's storage section; using fertilizer on a plot happens from the drawer on the play screen. Fertilizer speeds up growth for one crop on one plot. Each crop has its own fertilizer rate: how many of that crop make one fertilizer, so a pumpkin is worth more fertilizer than a garlic. Making and using fertilizer needs the Compost upgrade (epic, not tiered); a config switch can make it a basic action instead. Each mode has its own storage limit.
- **Events:** bad events (hindrances such as weeds, crows, picky customers and blocked plots) and good events. Every event gives a warning before it hits; some are announced by a news broadcast or newspaper. See Events (draft) below. Events with tradeoffs are planned (TBD).
- **Crops:** players earn points to unlock new crops with different tradeoffs. Before a run, players pick which crops to bring, and orders only ask for those crops.
- **Daily Challenge:** fixed modifiers (starting upgrades, boosts, selected crops), no power-ups, and a shared random seed so every player gets the same run. Has its own leaderboard.
- **Leaderboards:** high scores per mode, split into power-up and no-power-up boards.
- **Collectibles:** mystery boxes after a finished mode grant cosmetic skins or small boosts.
- **Scoring:** calculated on the player's device for now.

### Screen layout

The game has two screens during a run: the play screen and the shop page.

- **Play screen:** orders, plots and stats, with the crop bar always visible. The player selects a crop in the crop bar, then clicks plots to plant it; the crop stays selected, so several plots can be planted in a row without picking the crop again. Clicking a ready plot harvests it as before.
- **Drawer:** a panel along the bottom of the play screen that does not pause the clock. It holds actions that need the board, such as using fertilizer on a plot.
- **Shop page:** opened at any time with a button on the side of the screen; opening it pauses the clock in both modes, and closing it resumes play. It has three sections:
  - **Shop:** upgrades and power-ups (and lives in Survival) to buy, a Restock button (free while a free restock is banked, otherwise its coin price), the free restocks banked, and how many more filled orders earn the next one. An item that can no longer be bought (its stat is capped, or it reached its copy limit) stays on show, marked "Maxed".
  - **Storage:** the crops held, with selling and making fertilizer.
  - **Your upgrades:** the upgrades the player owns, with selling them back.
- **Moving between sections:** clickable section buttons for now. Swiping between sections may come later.
- **Free upgrade pick:** stays a pop-up over the play screen, since it is a choice the player must make, not a page to browse.

## Upgrades (draft)

Most upgrades come in five tiers: common, uncommon, rare, epic and legendary. A few are not tiered: they exist at one tier only, which tier TBD. A higher tier is a stronger version of the same effect. For example, Fast growth might give +2% growth speed at common and +20% at legendary. Higher tiers show up less often and cost more in the shop. All values are TBD.

Survival and Timed each have their own pool, and some upgrades are in both. The free pick draws from the current mode's pool. The shop draws from the same pool, plus shop-only upgrades.

Upgrades stack, but each stat has a cap on its total change. An upgrade that would pass the cap only adds what is left. For example, if growth time can drop by at most 80% and the player is at 75%, a 10% upgrade adds only 5%. Caps per stat are TBD.

Once a stat reaches its cap, upgrades for it stop being offered, in both the free pick and the shop. Non-tiered upgrades have a maximum number of copies per run instead (for example, max 1 Sneak peek); once the player holds that many, the upgrade stops being offered too.

| Upgrade | Effect | What improves with tier | Pool |
| --- | --- | --- | --- |
| Fast growth | All crops grow faster | Growth speed bonus | Both modes |
| Bumper harvest | A harvest sometimes yields an extra crop | Chance of an extra crop | Both modes |
| Patient customers | Order timers last longer | Extra time per order | Both modes |
| Big tips | Filled orders pay more coins | Coin bonus per order | Both modes |
| Lucky drops | Harvests drop power-ups more often | Drop chance | Both modes |
| Early warning | Events warn earlier before they hit | Not tiered (one tier, TBD) | Both modes |
| Favorite crop | One chosen crop grows faster and yields more | Size of the bonus | Both modes |
| Bigger bumper | Bumper harvest gives more extra crops when it triggers | Extra crops per trigger | Both modes |
| Small order | A new order sometimes asks for fewer crops | Chance to shrink an order | Both modes |
| Good fortune | Good events happen more often | Good event chance | Both modes |
| Calm skies | Bad events happen less often | Bad event chance cut | Both modes |
| Premium produce | Crops sell for more | Sell price bonus | Both modes |
| Sneak peek | See the next order before it arrives | Not tiered (one tier, TBD) | Both modes |
| Compost | Lets the player turn crops into fertilizer and use it to speed up a growing crop | Not tiered (epic) | Both modes |
| Pest control | Certain bad events never happen again this run (candidates: Drought, Birds, Crows) | Not tiered (one tier, TBD) | Both modes |
| Miracle grow | A button that instantly finishes one plot, then recharges | Shorter recharge | Both modes |
| Early bird | Filling an order with lots of time left pays a bonus | Bonus size | Both modes |
| Greenhouse | One chosen plot is safe from bad events | Not tiered (one tier, TBD) | Both modes |
| Long-lasting | Power-ups last longer | Extra duration | Both modes |
| Big pockets | Carry one extra power-up | Not tiered (one tier, TBD) | Both modes |
| Bigger barn | Storage holds more crops | Extra capacity | Both modes |
| Rainmaker | Rain shower cuts more growth time | Seconds cut | Both modes |
| Long summer | Sunny spell lasts longer | Extra duration | Both modes |
| Worm farm | Worms give even more extra crops | Extra crops | Both modes |
| Four-leaf | Lucky clover hits more than one plot | Plots affected | Both modes |
| Good neighbors | Helpful neighbor also replants the plots they harvest | Not tiered (one tier, TBD) | Both modes |
| Big spender | Generous customer pays even more | Coin bonus | Both modes |
| Irrigation | Drought needs fewer taps to keep crops growing | Taps saved | Both modes |
| Frost cover | Frost stops growth for less time | Seconds saved | Both modes |
| Bird net | Birds drop seeds on fewer plots | Plots protected | Both modes |
| Crow decoy | Crows block harvesting for less time | Seconds saved | Both modes |
| Mole traps | A chance to stop Moles before they steal | Block chance | Both modes |
| Guard dog | The Raccoon moves more slowly, so it is easier to tap away | Slowdown | Both modes |
| Root cellar | Rot removes a smaller share of storage | Share saved | Both modes |
| Lantern | Fog lasts less time | Seconds saved | Both modes |
| Clear orders | A Mix-up keeps some of the original crops | Crops kept | Both modes |
| Price floor | A Price crash drops prices less | Price protected | Both modes |
| Calm nerves | Emergency orders give a bit more time | Extra seconds | Both modes |
| Keen eye | Reveals the Fake merchant | Not tiered (one tier, TBD) | Both modes |
| Festival spirit | Festival orders need fewer extra crops | Crop cut | Both modes |
| Weed killer | Fewer weeds during Overgrowth | Weed cut | Both modes |
| Haggler | Bulk buyer pays a better price | Price bonus | Both modes |
| Loaded coin | Better odds on Coin flip | Odds boost | Both modes |
| Second chance | A failed order sometimes costs no life | Chance to keep the life | Survival |
| Life discount | Lives cost less to buy back | Price cut | Survival |
| Steady pace | Difficulty rises more slowly | How much slower | Survival |
| Extra heart | +1 to maximum lives | Not tiered (one tier, TBD) | Survival |
| Last stand | Crops grow faster while the player is on their last life | Speed bonus | Survival |
| Second wind | After losing a life, the next order has a longer timer | Extra order time | Survival |
| Combo keeper | The combo multiplier survives a missed order | Misses forgiven, or grace time | Timed |
| Combo builder | The combo multiplier climbs faster | Climb rate | Timed |
| Rush pay | Rush waves pay more points | Points bonus | Timed |
| Head start | Combos start above 1x | Starting multiplier | Timed |
| Grand finale | Points are boosted in the last 30 seconds | Points bonus | Timed |
| Double delivery | Filling two orders back to back pays extra | Bonus size | Timed |
| Extra plot | One more plot to plant on | Not tiered (one tier, TBD) | Shop only |
| Interest | Unspent coins grow every 30 s of play, by at most 15 coins each time (numbers to tune); the clock it counts stops while the shop is open | Interest rate | Shop only |
| Discount card | Shop prices drop | Price cut | Shop only |
| Lucky stars | Free picks roll higher tiers more often | Tier odds boost | Shop only |
| Rich soil | One chosen plot yields extra crops | Not tiered (one tier, TBD) | Shop only |
| Quick soil | One chosen plot grows crops a fixed number of seconds faster | Not tiered (one tier, TBD) | Shop only |
| Auto-harvester | One chosen plot harvests itself when crops are ready | Not tiered (one tier, TBD) | Shop only |
| Promotion | Raise one owned upgrade by one tier | Not tiered (one tier, TBD) | Shop only |
| Free restock | Each free restock earned from orders comes as two instead of one (still up to the bank cap) | Not tiered (one tier, TBD) | Shop only |
| Fast restock | Fewer filled orders are needed to earn a free restock | Orders saved | Shop only |
| Rain check | More free restocks can be banked | Extra bank slots | Shop only |

## Power-ups (draft)

Power-ups are either lasting (they work for a while) or instant (they happen right away). Every power-up is available in both Survival and Timed (coin power-ups included, since Timed orders pay coins), but not in the Daily Challenge. Durations and amounts are TBD.

| Power-up | Type | Effect | Notes |
| --- | --- | --- | --- |
| Order freeze | Lasting | Order timers stop for a while | The run timer keeps running |
| Combo freeze | Lasting | The combo timer stops for a while | Timed only |
| Auto harvest | Lasting | Ripe crops harvest themselves for a while | Can fill storage fast |
| Good omen | Lasting | Calls a random good event |  |
| Growth boost | Instant | Cuts the remaining growth time of all crops, by a percent or by seconds | Close to Ready one; may keep only one of the two |
| Ready all | Instant | All crops on the field are ready to harvest |  |
| Ready one | Instant | One chosen crop is ready to harvest |  |
| Finish one | Instant | Completes one current order |  |
| Finish all | Instant | Completes all current orders | Skips the puzzle: make it very rare, or give no combo or points bonus (TBD) |
| Gold rush | Lasting | Every order pays extra coins for a while |  |
| Coin bag | Instant | Grants coins |  |
| Merchant call | Instant | Calls the merchant: grants one free restock | The shop is always open, so it grants a restock instead of opening the shop; up to the bank cap |
| Giant order | Instant | Removes all current orders and creates one giant order that pays more coins. No new orders arrive until it is done | Failing it counts as a failed order, plus a mode penalty: in Survival, even more orders arrive; in Timed, no orders arrive for a short time |
| Clean slate | Instant | Removes all crops from the field so the player can replant | Clears seeds dropped by Birds |

## Events (draft)

Events are good or bad, and every one gives a warning before it hits. Every event happens in both Survival and Timed. Some are announced by a news broadcast or newspaper: a small ticker or banner that does not stop play. The Early warning upgrade makes the news arrive sooner. Durations and amounts are TBD.

| Event | Kind | Effect | Notes |
| --- | --- | --- | --- |
| Rain shower | Good | Cuts the remaining growth time of crops by a few seconds |  |
| Worms | Good | Enriched soil gives extra yield |  |
| Scarecrow | Good | Blocks some bad events for a while |  |
| Sunny spell | Good | All crops grow faster for a while | Lasting, unlike Rain shower's one-time cut |
| Generous customer | Good | A random order pays extra coins |  |
| Lucky clover | Good | One random plot gives double crops on its next harvest |  |
| Helpful neighbor | Good | Harvests all ripe crops for the player | Storage limits still apply |
| Slow day | Good | Order timers tick more slowly for a while | The run timer is not affected |
| Drought | Bad | Crops only keep growing while the player taps them | Keep it short so it doesn't become a chore |
| Birds | Bad | Drop random seeds on empty plots | Players need a way to dig them up (Clean slate helps) |
| Crows | Bad | Prevent harvesting |  |
| Emergency order | Bad | A forced order with a shorter timer than usual | Unlike Rush order, which the player can skip |
| Fake merchant | Bad | Sells fake upgrades with negative effects | Hinted by the news, or revealed by an upgrade (TBD); fake effects wear off after a few orders (TBD) |
| Frost | Bad | Crops stop growing for a few seconds | Tapping doesn't help, unlike Drought |
| Moles | Bad | Steal the crop from one plot, which has to start over |  |
| Raccoon | Bad | Takes crops from storage unless the player taps it away in time |  |
| Rot | Bad | A percentage of the crops in storage is removed | Pushes players to use or sell stored crops |
| Fog | Bad | Growth timers or order details are hidden for a while |  |
| Mix-up | Bad | One order changes which crops it wants partway through |  |
| Price crash | Bad | Crops sell for less for a while | Works against Premium produce |

## Design notes

### Ending a Survival run

Difficulty keeps rising until the player runs out of lives: tighter timers, more orders at once, and more frequent events. Rising life prices make sure every run ends eventually.

There is no early cash-out. A Survival run only ends when the player runs out of lives.

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
| Festival | Orders pay triple | Orders ask for twice as many crops |
| Overgrowth | Crops grow faster | Weeds show up more often |
| Bulk buyer | Buys everything in storage, freeing all the space at once | Pays a low price per crop |
| Coin flip | A chance to double the coins bet | A chance to lose them |

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
- [ ] The shop pauses the clock in both modes for now. In Timed this lets the player stop the clock whenever they like and still act (buy, sell, make fertilizer). Keep it, give each run a limited amount of shop time, or keep the clock running while the shop is open in Timed?
- [ ] Restock numbers: free ones every 7 filled orders, a bank of 2, and the fixed paid price. Tune after playtesting.
- [ ] How do shop prices rise: with run progress (measured in filled orders, so it never moves while the shop is open), with each copy of the same upgrade, or both?
- [ ] Upgrade tiers: what each tier costs in the shop, and the effect values per tier. Starting tier odds are common 40%, uncommon 30%, rare 15%, epic 10%, legendary 5%, to be tuned.
- [ ] Should a paid reroll roll better tiers than a free pick?
- [ ] Should order timers have a floor at their normal length? For now no upgrade can shorten them, which also rules out fake upgrades (Fake merchant) that do.
- [ ] How do luck upgrades (Lucky stars) change the tier odds?
- [ ] Per-category limits on copies (for example, at most 5 growth upgrades of any kind), on top of the per-upgrade limit.
- [ ] Plot-targeted upgrades: for now only one of each per plot, and they can't be sold. If they become sellable, what is the tradeoff? For example, a limit on upgrades per plot, with same-type upgrades allowed to stack on one plot.
- [ ] Stat caps and copy limits: the cap for each stat, and the max copies for each non-tiered upgrade.
- [ ] Fake merchant: how long do fake upgrades last? (Keen eye can reveal it.)
- [ ] Finish all: for now it gives no score, still counts the orders as filled and pays their coins, and is the rarest power-up. Is that the right way to stop it skipping the puzzle?
- [ ] Gold rush: for now every order pays +5 coins for 15 s. Should it double coins for 15 s instead?
- [ ] Storage overflow: for now a harvest that doesn't fit adds what fits and the rest is lost. Should it be refused instead? (Helpful neighbor does nothing when its harvest would overflow.)
- [ ] Sell price: for now every crop sells for 25% of its order value. Should each crop have its own sell price?
- [ ] Fertilizer: for now it cuts a share of the crop's remaining growth time, works once per plot per planting, has no holding limit and doesn't count toward storage. Which of these should change?
- [ ] Compost: for now it can't be sold, so fertilizer the player holds never becomes useless. Should it be sellable once the shop buys upgrades back?
- [x] Life price that scales with elapsed time instead of (or as well as) per life bought. Dropped: the price rises per life bought only.
- [ ] Should Timed orders pay coins, and how many? For now they pay the same as Survival (base pay, Big tips, Early bird). Revisit once the shop exists: Timed may want its own, lower rate.
- [ ] Should Scarecrow be an upgrade, an event or a power-up? For now it is a good event that keeps Crows and Birds away for 60 s.
- [ ] Tune how long Combo freeze and Auto harvest last. Both are 10 s for now.
- [ ] Tune how hard orders are: amounts, time limits and how they change with difficulty.
- [ ] Calm skies: for now it lengthens the gap between every event, good ones too, while Good fortune raises the share of good events. Should Calm skies cut only bad events instead?
- [ ] Pest control: for now one upgrade bans Drought, Birds and Crows together. Should it be three upgrades, one per event?
