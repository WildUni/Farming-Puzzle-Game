# orders.ts

Rules for a single order: creating one at random, checking whether the inventory can fill it, filling it, and checking whether it has run out of time. Like `plot.ts`, every function returns new values instead of changing its inputs.

`orders.ts` never touches `GameState` directly. `main.ts` decides when orders are created, passes in the id and RNG state, stores the results, and updates the counters (`nextOrderId`, `score`, `ordersCompleted`, `ordersFailed`).

## Order lifecycle

```
createOrder --> open --fulfill (on or before expiresAt)--> completed (removed by main.ts)
                     \--isExpired (tick passes expiresAt)--> failed (removed by main.ts)
```

## Constants (in `game_constants.ts`)

| Constant           | Value | Meaning                                                |
| ------------------ | ----- | ------------------------------------------------------ |
| `ORDER_TICKS`      | `600` | Time limit for a new order (60 s × `TICKS_PER_SECOND`) |
| `ORDER_MIN_AMOUNT` | `2`   | Smallest amount an order asks for                      |
| `ORDER_MAX_AMOUNT` | `6`   | Largest amount an order asks for                       |

These are starting values for tuning. With them, every order can be filled with one round of planting on a single plot or less, even for pumpkins (250 ticks).

## Exports

### `createOrder(id, now, rng, crops): [Order, RNGState]`

| Argument | Type        | Meaning                                                  |
| -------- | ----------- | -------------------------------------------------------- |
| `id`     | `number`    | The order's id. `main.ts` passes `GameState.nextOrderId` |
| `now`    | `number`    | Current tick                                             |
| `rng`    | `RNGState`  | Current generator state                                  |
| `crops`  | `CropTable` | Crops that orders can ask for                            |

Returns the new order and the new RNG state, which the caller must store back into `GameState.rngState`.

Rules:

1. An order asks for **one crop type**. Orders with several crops come later.
2. **Crop:** chosen from the crop table's ids **sorted alphabetically**, using the first random draw: `pick(rng, ids)`. Sorting means the result doesn't depend on the order of crops in `crops.json`.
3. **Amount:** a whole number from `ORDER_MIN_AMOUNT` to `ORDER_MAX_AMOUNT` inclusive, using the second random draw: `randomInt(state, ORDER_MIN_AMOUNT, ORDER_MAX_AMOUNT)`.
4. **Exactly two draws.** The returned state is the input state advanced twice with `nextValue`.
5. **Value:** `amount × crop.value`.
6. **Expiry:** `expiresAt = now + ORDER_TICKS`.
7. **Deterministic:** the same arguments always give an equal result.
8. **Empty crop table:** throws an `Error`. This is a setup mistake, not a player move, so it doesn't return `null`.

### `canFulfill(order, inventory): boolean`

- `true` if, for every crop in `order.required`, the inventory holds at least that amount.
- Crops missing from the inventory count as 0.
- Extra crops in the inventory don't matter.

### `fulfill(order, inventory): Record<string, number> | null`

- Returns a **new** inventory with each required amount subtracted.
- Crops whose amount drops to 0 are **removed** from the inventory, so it matches the "missing means 0" rule and two equal inventories always compare equal.
- Crops the order doesn't ask for are left as they are.
- Returns `null` if `canFulfill` is `false`. The inventory passed in is never changed.
- Does not add score. `main.ts` adds `order.value` (and later the time bonus from `scoring.ts`).

### `isExpired(order, now): boolean`

- `true` when `now > order.expiresAt`. `expiresAt` is the **last** tick the order can be filled: it is still open on tick `expiresAt` and has failed on tick `expiresAt + 1`.

### `timeLeft(order, now): number`

- Ticks left after the current one: `order.expiresAt − now`, never below 0.
- It is 0 on tick `expiresAt`, the last tick the order can still be filled. Use `isExpired`, not `timeLeft === 0`, to check whether an order has failed.
- Used by the order card's countdown bar and by the time bonus in scoring.

## Tests (`orders.test.ts`)

**`createOrder`**

- Uses the given id, and `expiresAt` is `now + ORDER_TICKS`.
- Asks for exactly one crop, which exists in the crop table.
- Amount is always in range, and value is always `amount × crop.value` (checked over many seeds).
- Every crop and every amount in range shows up across many seeds.
- The same arguments give equal results.
- The returned RNG state equals the input state advanced twice.
- Gives the same order whatever order the crop list is in.
- Throws for an empty crop table.

**`canFulfill`**

- `true` with exactly enough and with more than enough.
- `false` when short, and when the crop is missing from the inventory.
- Checks every crop in an order that asks for several.

**`fulfill`**

- Subtracts the required amounts and keeps other crops.
- Removes crops that drop to 0.
- Returns `null` when short.
- Never changes the inventory passed in.

**`isExpired` / `timeLeft`**

- Open on `expiresAt − 1` and on `expiresAt`, expired on `expiresAt + 1` and after.
- `timeLeft` counts down to 0 and stays at 0.

## Open items

- [ ] Orders with several crop types, possibly once the player has more crops unlocked.
- [ ] Ask only for crops the player brought into the run (from the design doc). That only needs `main.ts` to pass a smaller crop table.
- [ ] Scale the time limit with difficulty, the crop's growth time or the amount asked for.
- [ ] Rush orders and picky customers (events from the design doc).
- [x] Use `pick` and `randomInt` from `mulberry.ts` instead of a local helper (see [mulberry.md](mulberry.md)).
