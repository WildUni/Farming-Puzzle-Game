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

- **Upgrades:** available in both Survival and Timed. Every few orders the player picks 1 of 3 for free. Paying in-run coins rerolls the 3 choices once, and each reroll costs more than the last.
- **Shop:** a second upgrade system where players spend in-run coins on the specific upgrades they want, so they can build toward a plan instead of relying on the free picks. It shows 3–4 items at a time and also sells power-ups and, in Survival, lives. Players can also sell an owned upgrade back for coins. When it opens and how prices rise are open questions.
- **Buying lives:** the price rises each time, or scales with elapsed time, depending on mode.
- **Power-ups:** available in both Survival and Timed. Dropped randomly from harvests or bought with coins. Possibly pre-loaded before a run using currency earned from finished runs (TBD).
- **Currencies:** in-run coins have three uses during a run: the shop, rerolling the free upgrade pick, and lives (Survival only). They reset when the run ends. Meta currency (earned from finished runs) and paid coins (bought with real money) carry over between runs.
- **Plots:** limited, so players must choose what to plant.
- **Storage:** a limit on how many harvested crops the player can hold. Storage upgrades raise it. When storage is full, the player can't harvest until they free up space: sell crops for coins, turn some crops into fertilizer, or raise their storage. Fertilizer speeds up growth for one crop on one plot. Making fertilizer may be an upgrade rather than a basic action (TBD).
- **Events:** bad events (hindrances such as weeds, crows, picky customers and blocked plots) and good events. Every event gives a warning before it hits; some are announced by a news broadcast or newspaper. See Events (draft) below. Events with tradeoffs are planned (TBD).
- **Crops:** players earn points to unlock new crops with different tradeoffs. Before a run, players pick which crops to bring, and orders only ask for those crops.
- **Daily Challenge:** fixed modifiers (starting upgrades, boosts, selected crops), no power-ups, and a shared random seed so every player gets the same run. Has its own leaderboard.
- **Leaderboards:** high scores per mode, split into power-up and no-power-up boards.
- **Collectibles:** mystery boxes after a finished mode grant cosmetic skins or small boosts.
- **Scoring:** calculated on the player's device for now.

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
| Interest | Unspent coins grow between shop visits | Interest rate | Shop only |
| Discount card | Shop prices drop | Price cut | Shop only |
| Lucky stars | Free picks roll higher tiers more often | Tier odds boost | Shop only |
| Rich soil | One chosen plot yields extra crops | Not tiered (one tier, TBD) | Shop only |
| Quick soil | One chosen plot grows crops a fixed number of seconds faster | Not tiered (one tier, TBD) | Shop only |
| Auto-harvester | One chosen plot harvests itself when crops are ready | Not tiered (one tier, TBD) | Shop only |
| Promotion | Raise one owned upgrade by one tier | Not tiered (one tier, TBD) | Shop only |
| Free restock | One free shop reroll per visit | Not tiered (one tier, TBD) | Shop only |

## Power-ups (draft)

Power-ups are either lasting (they work for a while) or instant (they happen right away). They are available in Survival and Timed, but not in the Daily Challenge. Durations and amounts are TBD.

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
| Gold rush | Instant | The current order pays extra coins |  |
| Coin bag | Instant | Grants coins |  |
| Merchant call | Instant | Calls the merchant and opens the shop | Could be how the shop opens in Timed |
| Giant order | Instant | Removes all current orders and creates one giant order that pays more coins. No new orders arrive until it is done | Failing it counts as a failed order, plus a mode penalty: in Survival, even more orders arrive; in Timed, no orders arrive for a short time |
| Clean slate | Instant | Removes all crops from the field so the player can replant | Clears seeds dropped by Birds |

## Events (draft)

Events are good or bad, and every one gives a warning before it hits. Some are announced by a news broadcast or newspaper: a small ticker or banner that does not stop play. The Early warning upgrade makes the news arrive sooner. Durations and amounts are TBD.

| Event | Kind | Effect | Notes |
| --- | --- | --- | --- |
| Rain shower | Good | Cuts the remaining growth time of crops by a few seconds |  |
| Worms | Good | Enriched soil gives extra yield |  |
| Scarecrow | Good | Blocks some bad events for a while |  |
| Sunny spell | Good | All crops grow faster for a while | Lasting, unlike Rain shower's one-time cut |
| Generous customer | Good | The next order pays extra coins |  |
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
- [ ] When does the shop open? Survival could open it every few orders with the clock paused. Timed needs a choice: a short break between rush waves, or a shop that stays open while the clock keeps running.
- [ ] How do shop prices rise: with run progress, with each copy of the same upgrade, or both? How much does a restock cost?
- [ ] Upgrade tiers: what each tier costs in the shop, and the effect values per tier. Starting tier odds are common 40%, uncommon 30%, rare 15%, epic 10%, legendary 5%, to be tuned.
- [ ] Should a paid reroll roll better tiers than a free pick?
- [ ] Should order timers have a floor at their normal length? For now no upgrade can shorten them, which also rules out fake upgrades (Fake merchant) that do.
- [ ] How do luck upgrades (Lucky stars) change the tier odds?
- [ ] Per-category limits on copies (for example, at most 5 growth upgrades of any kind), on top of the per-upgrade limit.
- [ ] Plot-targeted upgrades: for now only one of each per plot, and they can't be sold. If they become sellable, what is the tradeoff? For example, a limit on upgrades per plot, with same-type upgrades allowed to stack on one plot.
- [ ] Stat caps and copy limits: the cap for each stat, and the max copies for each non-tiered upgrade.
- [ ] Fake merchant: how long do fake upgrades last? (Keen eye can reveal it.)
- [ ] Finish all: for now it gives no score, still counts the orders as filled and pays their coins, and is the rarest power-up. Is that the right way to stop it skipping the puzzle?
- [ ] Gold rush: for now every order pays +5 coins for 15 s (the same effect as Generous customer). Should it double coins for 15 s instead?
