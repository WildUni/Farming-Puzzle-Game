// Cheats for the debug menu: start any event, add any upgrade, give any power-up.
// Not actions: never logged, so a run that uses them can't be replayed. See specs/debug.md.
import type { CropTable, GameState, Tier, UpgradeTarget } from "./types"
import { EVENTS, buildEvent, eventTargets } from "./events"
import { UPGRADES, modifiersFor, validTargets } from "./upgrades"
import { POWER_UPS } from "./powerups"
import { withUpgrade } from "./main"
import { TIERS } from "./game_constants"

type DebugEventOptions = { plot: number | null; skipWarning: boolean }

function has(obj: object, key: string): boolean {
    return Object.prototype.hasOwnProperty.call(obj, key)
}

// Announces event `id` now, replacing any announced or running event. null when not allowed.
function debugEvent(state: GameState, id: string, options: DebugEventOptions): GameState | null {
    if (state.status === "ended" || !state.allowEvents || !has(EVENTS.events, id)) return null
    const def = EVENTS.events[id]
    if (!def.modes.includes(state.mode)) return null
    const { plot, skipWarning } = options
    if (def.target === "plot") {
        if (plot === null || !eventTargets(state, def).includes(plot)) return null
    } else if (plot !== null) {
        return null
    }
    const event = buildEvent(state, def, plot)
    if (!skipWarning) return { ...state, event }
    const shift = event.startsAt - (state.tick + 1)
    return {
        ...state,
        event: { ...event, startsAt: event.startsAt - shift, endsAt: event.endsAt - shift }
    }
}

// The tiers upgrade `id` exists at: all of them for a tiered upgrade, else its own.
function upgradeTiers(id: string): readonly Tier[] {
    const def = UPGRADES.upgrades[id]
    return def.tier === null ? TIERS : [def.tier]
}

// Adds one copy of upgrade `id` at `tier`, as if picked. Ignores pools, needs, requires and
// maxCopies; still checks the tier and the target.
function debugUpgrade(
    state: GameState,
    id: string,
    tier: Tier,
    target: UpgradeTarget,
    crops: CropTable
): GameState | null {
    if (state.status === "ended" || !has(UPGRADES.upgrades, id)) return null
    if (!upgradeTiers(id).includes(tier)) return null
    const def = UPGRADES.upgrades[id]
    if (def.target === null) {
        if (target !== null) return null
    } else if (
        target === null ||
        !validTargets(state.upgrades, id, state.plots.length, crops).includes(target)
    ) {
        return null
    }
    return withUpgrade(state, { id, tier, target })
}

// Gives power-up `id` in the next free slot. Ignores its modes.
function debugPowerUp(state: GameState, id: string): GameState | null {
    if (state.status === "ended" || !state.allowPowerUps || !has(POWER_UPS.powerUps, id)) {
        return null
    }
    if (state.powerUps.length >= modifiersFor(state.upgrades).powerUpSlots) return null
    return { ...state, powerUps: [...state.powerUps, id] }
}

export { debugEvent, debugUpgrade, debugPowerUp, upgradeTiers }
export type { DebugEventOptions }
