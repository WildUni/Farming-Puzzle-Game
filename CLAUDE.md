# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

A farming/order-fulfilment puzzle game built on Phaser 4 + TypeScript + Vite (started from the Phaser `template-vite-ts` template). Modes: Survival and Timed are playable; Puzzle exists in the types but has no end rule yet.

## Commands

- `npm run dev-nolog` — dev server on http://localhost:8080 (hot reload). Prefer this over `npm run dev`, which also runs `log.js` (the template's anonymous telemetry ping). `.claude/launch.json` has a `dev` config for it.
- `npm run build-nolog` — production build to `dist/`.
- `npm test` — Vitest in watch mode. CI runs `npx vitest run` (single pass) on Node 24.
- Single file: `npx vitest run src/sim/main.test.ts`; single test by name: `npx vitest run -t "buyLife"`.
- `npm run lint` — ESLint (flat config, `eslint.config.mjs`).
- `npm run format` / `npm run format:check` — Prettier (4-space indent, no semicolons, double quotes, no trailing commas, width 100).
- Type check (no script): `npx tsc --noEmit`.

## Architecture

The code is split into a pure simulation and a Phaser renderer:

- **`src/sim/`** — all game rules, plain TypeScript. **Must not import Phaser or browser APIs** (enforced by ESLint `no-restricted-imports`) so tests and a future server-side replay run in plain Node.
- **`src/render/`** — everything Phaser. `scenes/` are Phaser scenes; `views/` each draw one part of the screen from a `GameState` (`update(state)`), and report clicks via callbacks. `render/format.ts` is also kept Phaser-free (lint-enforced) so it can be unit tested.
- **`src/data/`** — JSON tuning. `crops.json` is loaded in `Boot` and stored in the Phaser registry as a `CropTable` (`buildCropTable`); `difficulty.json` is imported directly by `sim/difficulty.ts`.

### Sim contract (see `specs/README.md`)

- Pure functions: never mutate inputs, never read the clock or call `Math.random`. Randomness goes through the seeded `mulberry.ts` RNG, whose state lives in `GameState.rngState`.
- `GameState` is plain JSON-safe data (compare with `toEqual`).
- Time is measured in **ticks** (`TICKS_PER_SECOND`), never milliseconds.
- Functions that can reject a move return `null` rather than throwing.
- `sim/main.ts` is the coordinator: `createGame`, `applyAction` (the **only** way player input changes state), and `step` (the **only** way time advances). Within a tick, `step` runs first, then that tick's logged actions in order — `verification.ts`'s `replay` depends on this ordering.

### Game loop and replay

`render/scenes/Game.ts` owns a run: it calls `step` on a fixed tick (with a catch-up cap), and routes every player move through `act()`, which calls `applyAction` and appends `{ tick, action }` to an action log. A run is fully reproducible from `seed + config + log`; `replay` in `sim/verification.ts` rebuilds it for score checking. Debug keys in `Game`: P/Esc pause, R restart same seed, L print the action log.

## Specs-first workflow

`specs/` holds one spec per `src/sim/` module (plus `ui.md` for screens), describing exports, rules, required tests and open items. Specs are the source of truth for sim behaviour: read the relevant spec before changing a sim module, keep the spec and its tests in sync with the code, and tick off / add "Open items" there. Each `*.test.ts` mirrors the "Tests" section of its spec.

`notes/` holds the design doc, the 7-day build plan (`Build Plan.md`) and the author's `project_diary.md`; useful for intent and scope (e.g. what is deferred past the first release).
