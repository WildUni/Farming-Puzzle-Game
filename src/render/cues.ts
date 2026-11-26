// Juice cues: what happened between two states of a run, so the views can animate it.
// Phaser-free (lint-enforced) so it can be unit tested. Nothing here changes the state.
// See specs/ui.md, "Juice".
import type { GameState, Order } from "../sim/types"
import { TICKS_PER_SECOND } from "../sim/game_constants"
import { MODES } from "../sim/modes"

const LOW_TIME_SECONDS = 10

type Cue =
    | { kind: "harvest"; plot: number }
    | { kind: "score"; points: number; orderId: number | null }
    | { kind: "lifeLost" }

type OrderChanges = {
    added: number[]
    removed: { id: number; failed: boolean }[]
}

// Orders that appeared and left between `prev` and `next`. An order that left after its
// expiresAt tick failed; any other that left was filled (or cleared).
function orderChanges(prev: Order[], next: Order[], nextTick: number): OrderChanges {
    const before = new Set(prev.map((o) => o.id))
    const after = new Set(next.map((o) => o.id))
    return {
        added: next.filter((o) => !before.has(o.id)).map((o) => o.id),
        removed: prev
            .filter((o) => !after.has(o.id))
            .map((o) => ({ id: o.id, failed: nextTick > o.expiresAt }))
    }
}

function cues(prev: GameState, next: GameState): Cue[] {
    const out: Cue[] = []
    prev.plots.forEach((plot, i) => {
        if (plot.state === "ready" && next.plots[i]?.state === "empty") {
            out.push({ kind: "harvest", plot: i })
        }
    })
    const points = next.score - prev.score
    if (points > 0) {
        const filled = orderChanges(prev.orders, next.orders, next.tick).removed.filter(
            (r) => !r.failed
        )
        out.push({ kind: "score", points, orderId: filled.length === 1 ? filled[0].id : null })
    }
    if (next.mode === "survival" && next.lives < prev.lives) out.push({ kind: "lifeLost" })
    return out
}

// Timed only, in the last LOW_TIME_SECONDS of a running run: 1 on the tick a second starts,
// falling towards 0 through that second. Otherwise null.
function lowTimePulse(state: GameState): number | null {
    if (state.mode !== "timed" || state.status !== "running") return null
    const left = MODES.timed.runTicks - state.tick
    if (left <= 0 || left > LOW_TIME_SECONDS * TICKS_PER_SECOND) return null
    const intoSecond = (TICKS_PER_SECOND - (left % TICKS_PER_SECOND)) % TICKS_PER_SECOND
    return 1 - intoSecond / TICKS_PER_SECOND
}

export { LOW_TIME_SECONDS, cues, orderChanges, lowTimePulse }
export type { Cue, OrderChanges }
