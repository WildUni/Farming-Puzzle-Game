import type { RNGSeed, GameConfig, GameState, LogEntry, CropTable } from "./types"
import { createGame, applyAction, step } from "./main"
import { isShopOpen } from "./shop"

type ReplayError =
    | "bad-tick" // an entry's tick is not a whole number from 0 to finalTick
    | "out-of-order" // an entry's tick is lower than the one before it
    | "after-end" // an entry is on a tick after the run ended
    | "refused" // applyAction rejected an entry
    | "bad-final-tick" // finalTick is invalid, or the run ended before it
    | "offer-pending" // time had to pass while an upgrade offer was unanswered
    | "shop-pending" // time had to pass while the shop was open

type ReplayResult =
    { ok: true; state: GameState } | { ok: false; error: ReplayError; entry: number | null } // entry: index in log

// Steps until state.tick reaches target. Returns "ended" if the run ends first, and
// "offer-pending" or "shop-pending" if an upgrade offer or the open shop stops the clock before
// then.
function stepUntil(
    state: GameState,
    target: number,
    crops: CropTable
): GameState | "ended" | "offer-pending" | "shop-pending" {
    while (state.tick < target) {
        if (state.status === "ended") return "ended"
        if (state.upgradeOffer !== null) return "offer-pending"
        if (isShopOpen(state)) return "shop-pending"
        state = step(state, crops)
    }
    return state
}

// Rebuilds a run from its seed, config and action log, stopping on finalTick.
// Every logged action must be accepted. See specs/verification.md.
function replay(
    seed: RNGSeed,
    config: GameConfig,
    log: LogEntry[],
    finalTick: number,
    crops: CropTable
): ReplayResult {
    if (!Number.isInteger(finalTick) || finalTick < 0) {
        return { ok: false, error: "bad-final-tick", entry: null }
    }

    let state = createGame(seed, config)

    for (let i = 0; i < log.length; i++) {
        const { tick, action } = log[i]
        if (!Number.isInteger(tick) || tick < 0 || tick > finalTick) {
            return { ok: false, error: "bad-tick", entry: i }
        }
        if (tick < state.tick) return { ok: false, error: "out-of-order", entry: i }

        const reached = stepUntil(state, tick, crops)
        if (reached === "offer-pending" || reached === "shop-pending") {
            return { ok: false, error: reached, entry: i }
        }
        // Actions are refused once the run has ended, including on the ending tick.
        if (reached === "ended" || reached.status === "ended") {
            return { ok: false, error: "after-end", entry: i }
        }

        const next = applyAction(reached, action, crops)
        // `!next` also catches undefined, which an unknown action type gives.
        if (!next) return { ok: false, error: "refused", entry: i }
        state = next
    }

    const final = stepUntil(state, finalTick, crops)
    if (final === "offer-pending" || final === "shop-pending") {
        return { ok: false, error: final, entry: null }
    }
    if (final === "ended") return { ok: false, error: "bad-final-tick", entry: null }
    return { ok: true, state: final }
}

export { replay }
export type { ReplayError, ReplayResult }
