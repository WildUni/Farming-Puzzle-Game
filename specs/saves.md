# saves.ts (`src/app/`)

Local saves: the high score for each mode and the sound setting, kept in the browser's `localStorage` so they survive a page reload. No Phaser imports, so it can be unit tested in Node (`saves.test.ts`). Unlike `src/sim/`, it may touch browser APIs, but only through `browserStore()`.

Storage can be missing, blocked (private browsing, sandboxed iframes) or full. Every read and write is wrapped in try/catch, and the game keeps running on in-memory values when storage fails.

## Stored data

One key, `farming-puzzle-game/save`, holding JSON:

```json
{ "version": 1, "highScores": { "survival": 465, "timed": 120 }, "soundOn": true }
```

| Field        | Meaning                                                                                     |
| ------------ | ------------------------------------------------------------------------------------------- |
| `version`    | `SAVE_VERSION` (1). A save with any other version is ignored                                |
| `highScores` | Best `finalScore` per mode (see [scoring.md](scoring.md)); a mode with no score is left out |
| `soundOn`    | The sound setting. Defaults to `true`                                                       |

## Exports

### `type KeyValueStore`

`{ getItem(key), setItem(key, value) }`: the part of the Web Storage API used. Tests pass an in-memory fake.

### `type SaveData`

`{ highScores: Partial<Record<GameMode, number>>, soundOn: boolean }` (the stored data without `version`).

### `defaultSave(): SaveData`

`{ highScores: {}, soundOn: true }`.

### `browserStore(): KeyValueStore | null`

`localStorage`, or `null` when it doesn't exist or reading it throws.

### `loadSave(store): SaveData`

- `null` store, no key, a read that throws, bad JSON, a non-object or a wrong `version`: the defaults.
- Otherwise each field is checked on its own: `soundOn` must be a boolean, and each mode's high score a whole number `>= 0`. A bad field falls back to its default; unknown keys are dropped.

### `writeSave(store, save): boolean`

Writes `{ version, ...save }`. Returns `false` for a `null` store or a write that throws (blocked or full), `true` otherwise.

### `recordScore(save, mode, score): { save, best, newBest }`

- A new best when `score > 0` and `score` beats the mode's saved best (none counts as 0). Returns the save with that mode's best replaced, `best = score`, `newBest = true`.
- Otherwise returns the same save, the old best (0 if none) and `newBest = false`. A tie is not a new best.
- Never changes its input.

### `setSoundOn(save, soundOn): SaveData`

A new save with the setting changed.

## How the screens use it (`src/render/saves.ts`)

- **Boot** loads the save once (`initSave`), keeps it in the Phaser registry under `save`, and sets `sound.mute` from `soundOn`.
- `putSave` replaces the registry copy, writes it to storage and applies `soundOn`. If the write fails, the registry copy still holds for the rest of the session.
- **Game** records the final score once, when the run's status becomes `ended`, and only writes when it is a new best. A run changed by the debug menu is never recorded.
- **MainMenu** shows each mode's best under its button and has the Sound toggle. See [ui.md](ui.md).

## Tests

- `loadSave` gives the defaults for a `null` store, no key, bad JSON and a store that throws.
- The defaults are no high scores and sound on.
- A save with another `version` is ignored.
- Bad fields are dropped and good ones kept (a negative score, a string score, an unknown mode, a non-boolean `soundOn`).
- `writeSave` then `loadSave` round-trips; `writeSave` returns `false` for a `null` store and one that throws.
- `recordScore`: a higher score is a new best and leaves other modes alone, without changing the input; a tie or a lower score is not; with no saved best, 0 is not a new best and 1 is.
- `setSoundOn` returns a new save with the setting changed.

## Open items

- [ ] Migrating older save versions, once there is a second version. For now a different version is dropped.
- [ ] Should a debugged run show what it would have scored against the best? It shows `Not saved (debugged run)` for now.
- [ ] The sound setting mutes Phaser's sound manager; Day 13 adds the sounds and music it applies to.
