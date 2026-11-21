# powerups.ts

Power-ups: one-shot items the player holds and uses when they choose. They drop at random from harvests, sit in a few slots, and are used with the `usePowerUp` action. Each one fires one effect from [effects.md](effects.md), either instant (Ready one, Growth boost, Coin bag) or lasting (Order freeze).

What each power-up does lives in **`src/data/powerups.json`**. Which ones the player holds lives in **`GameState.powerUps`**, and lasting effects they started live in **`GameState.activeEffects`**.

This spec is the first slice: four power-ups, harvest drops and held slots. Buying them in the shop, Good omen (which needs events) and pre-run power-ups come later (see Open items).

## Concepts

- **Held power-up.** An id in `GameState.powerUps`. The list is the player's slots, in the order the power-ups dropped. Using one removes it; the ones after it move up.
- **Slots.** The most power-ups the player can hold at once: the `powerUpSlots` modifier (2 to start; Big pockets adds 1).
- **Drop.** Each harvest may drop one power-up, rolled from `rng.drops`. A drop with every slot full is lost.
- **Power-ups allowed.** A run's `GameConfig.allowPowerUps`, copied into `GameState.allowPowerUps` (the rules can't see the config). With it off nothing drops, `usePowerUp` is refused, and upgrades that only help power-ups are never offered. The Daily Challenge and the no-power-up leaderboard will turn it off.

## `src/data/powerups.json`

```json
{
    "powerUps": [
        {
            "id": "orderFreeze",
            "name": "Order freeze",
            "text": "Order timers stop for {seconds} s",
            "modes": ["survival", "timed"],
            "weight": 20,
            "seconds": 10,
            "effect": { "kind": "orderRate", "pct": 0 }
        }
    ]
}
```

| Field     | Required     | Meaning                                                                                               |
| --------- | ------------ | ----------------------------------------------------------------------------------------------------- |
| `id`      | yes          | Unique id, stored in `GameState.powerUps`                                                             |
| `name`    | yes          | Button title                                                                                          |
| `text`    | yes          | Second line on the slot button. `{seconds}` is replaced by the length after `powerUpDurationPct`      |
| `modes`   | yes          | Non-empty list of `survival`, `timed`, no repeats. It only drops in these modes                       |
| `weight`  | yes          | Relative chance of this power-up when a drop happens. Whole number `>= 1`                             |
| `seconds` | lasting only | How long its effect lasts, in seconds. Whole number `>= 1`. Turned into ticks with `TICKS_PER_SECOND` |
| `effect`  | yes          | One `Effect` from [effects.md](effects.md)                                                            |
| `target`  | no           | `"plot"` when the player chooses a plot on use. Required exactly when the effect is `finishGrowth`    |

### Shipped power-ups

All numbers are placeholders until playtesting.

| id            | name         | modes           | weight | effect                     | lasts | target |
| ------------- | ------------ | --------------- | ------ | -------------------------- | ----- | ------ |
| `readyOne`    | Ready one    | survival, timed | 30     | `finishGrowth`             | –     | plot   |
| `growthBoost` | Growth boost | survival, timed | 30     | `cutGrowth` 50 ticks (5 s) | –     | –      |
| `orderFreeze` | Order freeze | survival, timed | 20     | `orderRate` 0%             | 10 s  | –      |
| `coinBag`     | Coin bag     | survival        | 20     | `grantCoins` 10            | –     | –      |

Coin bag is Survival only because coins have no use in Timed until the shop exists.

## Types (in [types.md](types.md))

```ts
type PowerUpDef = {
    id: string
    name: string
    text: string
    modes: GameMode[]
    weight: number
    durationTicks: number | null // seconds × TICKS_PER_SECOND for lasting effects, null for instant
    effect: Effect
    target: "plot" | null
}
type PowerUpConfig = { powerUps: Record<string, PowerUpDef> } // id -> definition
```

`seconds` becomes `durationTicks`, and a missing `target` becomes `null`, so every `PowerUpDef` has the same shape.

## Exports

### `validatePowerUps(raw: unknown): PowerUpConfig`

Checks a parsed JSON value and returns it in the typed shape. Throws an `Error` naming the bad entry when:

- `raw` is not an object with a non-empty `powerUps` list.
- `id`, `name` or `text` is not a non-empty string, or an `id` is used twice.
- `modes` is empty, has a repeat, or has a value other than `survival` or `timed`.
- `weight` is not a whole number `>= 1`.
- `effect` is not an object with a known `kind`, or its numbers break the rules in [effects.md](effects.md#types-in-typesmd).
- `seconds` is missing for a lasting effect, present for an instant one, or not a whole number `>= 1`.
- `target` is not `"plot"` when present; it is missing on a `finishGrowth` power-up or present on any other.
- `{seconds}` appears in the text of an instant power-up.

A bad file is a setup mistake, so this throws instead of returning `null`.

### `POWER_UPS: PowerUpConfig`

`powerups.json` passed through `validatePowerUps` once, when the module loads. Every function below takes an optional last argument `config: PowerUpConfig = POWER_UPS`, so tests can use their own power-ups.

### `dropTable(mode: GameMode, config?): string[]`

Ids that can drop in `mode`, sorted, so the result doesn't depend on the order in the JSON.

### `rollDrop(state: GameState, config?): [string | null, RNGState]`

The drop roll for one harvest, from `state.rng.drops`. Returns the dropped id (or `null`) and the new state of the stream.

1. If `state.allowPowerUps` is `false`, `dropChance` (from `modifiersFor(upgrades)`) is 0, or `dropTable(mode)` is empty: `[null, rng.drops]`, no draw.
2. Otherwise, draw `roll = randomInt(rng.drops, 0, 99)`. If `roll >= dropChance`: `null`, one draw.
3. Otherwise, draw `r = randomInt(0, W − 1)`, where `W` is the sum of the weights in `dropTable(mode)`. Walking the sorted ids and subtracting each weight, the id where `r` drops below its weight is the drop. Two draws.

Rules:

- The roll does not look at free slots. A drop with every slot full still uses both draws and is then thrown away by `harvest`, so whether a slot is free never changes what later drops are.
- Draws only from `rng.drops`.

### `canUsePowerUp(state: GameState, slot: number, target: number | null, config?): boolean`

`true` when `usePowerUp { slot, target }` would succeed (see the action below). The power-up buttons use it, so the screen and the rules can't disagree.

### `powerUpTargets(state: GameState, slot: number, config?): number[]`

For a held power-up with `target: "plot"`: the plot indexes it can be used on, ascending. For `finishGrowth`, the plots that are `growing`. `[]` for an untargeted power-up or a bad slot.

### `durationFor(def: PowerUpDef, upgrades: readonly OwnedUpgrade[]): number | null`

`scalePct(def.durationTicks, powerUpDurationPct)` for a lasting power-up, `null` for an instant one. `usePowerUp` and the button text both use it.

## In `main.ts` (see [main.md](main.md))

### Drops on `harvest`

After the harvest's own yield and bumper roll, `harvest` calls `rollDrop(state)` and stores the new `rng.drops`. If it returns an id and `powerUps.length < powerUpSlots`, the id is appended to `powerUps`. Otherwise nothing is added.

The bumper roll draws from `rng.harvest` and the drop roll from `rng.drops`, so owning Bumper harvest never changes which power-ups drop, and the other way round.

### `usePowerUp { slot, target? }`

Returns `null` when:

- the general rules refuse it (run ended, or an upgrade offer is open);
- `allowPowerUps` is `false`;
- `slot` is not a whole number from `0` to `powerUps.length − 1`;
- the power-up has `target: "plot"` and `target` is not in `powerUpTargets(state, slot)`, or it has no target and `target` is given (other than `null`).

Otherwise it removes `powerUps[slot]` (a new array) and fires the effect:

| Effect         | What happens                                                                                          |
| -------------- | ----------------------------------------------------------------------------------------------------- |
| `finishGrowth` | `plots[target]` becomes ready (`finishGrowth`), so it can be harvested on the same tick               |
| `cutGrowth`    | `plots = cutGrowth(plots, ticks, tick)`. Allowed even when nothing is growing (the power-up is spent) |
| `grantCoins`   | `coins += amount`                                                                                     |
| lasting        | `activeEffects = startEffect(activeEffects, id, effect, tick, durationFor(def, upgrades))`            |

It never draws a random number and never changes `tick`. Using the same lasting power-up while it is active adds its length to the running effect instead of stacking a second one.

## Upgrades this unlocks (in [upgrades.md](upgrades.md))

| id            | name         | pools           | tier   | maxCopies | effects (common → legendary)                 |
| ------------- | ------------ | --------------- | ------ | --------- | -------------------------------------------- |
| `luckyDrops`  | Lucky drops  | survival, timed | tiered | 5         | `dropChance` +2, +3, +5, +8, +12             |
| `longLasting` | Long-lasting | survival, timed | tiered | 5         | `powerUpDurationPct` +10, +15, +25, +35, +50 |
| `bigPockets`  | Big pockets  | survival, timed | rare   | 1         | `powerUpSlots` +1                            |

New stats:

| Stat                 | base | min | max | Read by                            |
| -------------------- | ---- | --- | --- | ---------------------------------- |
| `dropChance`         | 8    | 0   | 40  | `rollDrop` (on `harvest`)          |
| `powerUpSlots`       | 2    | 1   | 3   | `harvest` (whether a drop is kept) |
| `powerUpDurationPct` | 100  | 100 | 200 | `durationFor` (on `usePowerUp`)    |

All three are marked `"needs": ["powerUps"]`, so they are never offered in a run with `allowPowerUps` off (see `needs` in [upgrades.md](upgrades.md)). Big pockets is not `sellable`: selling it with three held power-ups would leave one with no slot.

## Rules

- No Phaser or browser imports. Pure: never changes its inputs.
- Draws only from `rng.drops`, and only through `rollDrop`.
- No rule reads a power-up id except to look up its definition. What a power-up does is its `effect`.

## Tests (`powerups.test.ts`)

**`validatePowerUps`**

- Accepts the shipped `powerups.json`.
- Throws for each case in its list above, one test per case, using a small valid config with one field changed.
- Turns `seconds` into `durationTicks` (`seconds × TICKS_PER_SECOND`) and a missing `target` into `null`.

**`dropTable`**

- Lists ids for the mode, sorted; Coin bag is in Survival and not in Timed.

**`rollDrop`**

- No draw when power-ups are off, when `dropChance` is 0, or when nothing drops in the mode.
- One draw when the roll misses, two when it hits; the stream is advanced by exactly that many.
- With `dropChance` 100, every harvest drops; with a config of one power-up, it is always that one.
- Over many seeds, drop rate and the split between power-ups are close to `dropChance` and the weights (a loose bound).
- Never touches `rng.orders`, `rng.upgrades` or `rng.harvest`.

**`powerUpTargets` / `canUsePowerUp`**

- Ready one targets only growing plots, in order; untargeted power-ups and bad slots give `[]`.
- `canUsePowerUp` agrees with `applyAction` in every refusal case listed above.

**`durationFor`**

- Gives `durationTicks` with no upgrades, scales with `powerUpDurationPct`, and is `null` for instant power-ups.

**Drops and use (`main.test.ts`)**

- A harvest that drops appends the id to `powerUps`; with every slot full the drop is lost but `rng.drops` still moves by two draws.
- Big pockets raises the slots to 3.
- `usePowerUp` removes the used slot and keeps the others in order.
- Ready one makes its plot ready, and it can be harvested on the same tick.
- Growth boost brings every growing crop 50 ticks closer; a crop brought to `tick` is ready.
- Coin bag adds its coins.
- Order freeze: open orders' `timeLeft` stays the same for 10 s of steps, then counts down again; Long-lasting makes it last longer; using a second Order freeze while one is active adds 10 s to it.
- Refused: power-ups off, bad slot, missing or invalid target, target on an untargeted power-up, while an upgrade offer is open, after the run ended.
- While an upgrade offer is open, an active Order freeze doesn't use up any of its ticks.
- Two runs on the same seed where one player uses power-ups and the other doesn't get the same order sequence (`rng.orders` is untouched).

**Replay (`verification.test.ts`)**

- Scripted runs with power-ups on, where the player uses every power-up as soon as it can (Ready one on the first valid plot), replay equal in Survival and Timed, and their logs contain `usePowerUp` entries.

## Open items

- [ ] Tune drop chance, weights, slot count, lengths and amounts after playtesting.
- [ ] More power-ups: Ready all, Finish one, Gold rush, Clean slate, Combo freeze (Timed, with combos), Good omen (with events), Merchant call (with the shop), Giant order.
- [ ] Buying power-ups in the shop, and pre-run power-ups paid with meta currency.
- [ ] Should a drop with full slots replace the oldest held power-up, or offer a swap, instead of being lost?
- [ ] Should a used Growth boost with nothing growing be refused instead of spent?
