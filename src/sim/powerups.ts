// Power-ups: definitions from src/data/powerups.json, harvest drops, and what can be used where.
// See specs/powerups.md.
import type {
    Effect,
    GameMode,
    GameSystem,
    GameState,
    OwnedUpgrade,
    PowerUpConfig,
    PowerUpDef,
    RNGState
} from "./types"
import { TICKS_PER_SECOND } from "./game_constants"
import { randomInt } from "./mulberry"
import { modifiersFor, scalePct } from "./upgrades"
import rawPowerUps from "../data/powerups.json"

const DROP_MODES: readonly GameMode[] = ["survival", "timed"]
const LASTING_KINDS: readonly string[] = ["growthRate", "orderRate", "deliverBonus"]
const GAME_SYSTEMS: readonly GameSystem[] = ["powerUps", "events"]

// ---------------------------------------------------------------------------------------------
// Validation

function isObject(v: unknown): v is Record<string, unknown> {
    return typeof v === "object" && v !== null && !Array.isArray(v)
}

function fail(field: string, rule: string): never {
    throw new Error(`power-ups config: ${field} must be ${rule}`)
}

function has(obj: Record<string, unknown>, key: string): boolean {
    return Object.prototype.hasOwnProperty.call(obj, key)
}

function nonEmptyString(obj: Record<string, unknown>, key: string, at: string): string {
    const v = obj[key]
    if (typeof v !== "string" || v.length === 0) fail(`${at}.${key}`, "a non-empty string")
    return v
}

// A whole number >= min.
function wholeAtLeast(v: unknown, min: number, field: string): number {
    if (typeof v !== "number" || !Number.isInteger(v) || v < min) {
        fail(field, `a whole number >= ${min}`)
    }
    return v
}

function validateEffect(raw: unknown, at: string): Effect {
    if (!isObject(raw)) fail(at, "an object")
    switch (raw.kind) {
        case "growthRate":
        case "orderRate": {
            const pct = wholeAtLeast(raw.pct, 0, `${at}.pct`)
            if (pct === 100) fail(`${at}.pct`, "other than 100")
            return { kind: raw.kind, pct }
        }
        case "cutGrowth":
            return { kind: "cutGrowth", ticks: wholeAtLeast(raw.ticks, 1, `${at}.ticks`) }
        case "finishGrowth":
            return { kind: "finishGrowth" }
        case "grantCoins":
            return { kind: "grantCoins", amount: wholeAtLeast(raw.amount, 1, `${at}.amount`) }
        case "deliverBonus":
            return { kind: "deliverBonus", coins: wholeAtLeast(raw.coins, 1, `${at}.coins`) }
        case "finishAll":
        case "clearField":
        case "fillOrder":
        case "fillAllOrders":
        case "goodEvent":
            return { kind: raw.kind }
        default:
            return fail(`${at}.kind`, "a known effect kind")
    }
}

function validatePowerUp(entry: unknown, at: string): PowerUpDef {
    if (!isObject(entry)) fail(at, "an object")
    const id = nonEmptyString(entry, "id", at)
    const name = nonEmptyString(entry, "name", at)
    const text = nonEmptyString(entry, "text", at)

    const modes = entry.modes
    if (!Array.isArray(modes) || modes.length === 0) fail(`${at}.modes`, "a non-empty list")
    for (const m of modes) {
        if (!(DROP_MODES as unknown[]).includes(m)) {
            fail(`${at}.modes`, `made of ${DROP_MODES.join(", ")}`)
        }
    }
    if (new Set(modes).size !== modes.length) fail(`${at}.modes`, "free of repeats")

    const weight = wholeAtLeast(entry.weight, 1, `${at}.weight`)
    const effect = validateEffect(entry.effect, `${at}.effect`)
    const lasting = LASTING_KINDS.includes(effect.kind)

    let durationTicks: number | null = null
    if (lasting) {
        if (!has(entry, "seconds")) fail(`${at}.seconds`, "given for a lasting effect")
        durationTicks = wholeAtLeast(entry.seconds, 1, `${at}.seconds`) * TICKS_PER_SECOND
    } else {
        if (has(entry, "seconds")) fail(`${at}.seconds`, "left out for an instant effect")
        if (text.includes("{seconds}")) fail(`${at}.text`, "free of {seconds} when instant")
    }

    let target: "plot" | "order" | null = null
    if (has(entry, "target")) {
        if (entry.target !== "plot" && entry.target !== "order") {
            fail(`${at}.target`, `"plot" or "order"`)
        }
        target = entry.target
    }
    if ((effect.kind === "finishGrowth") !== (target === "plot")) {
        fail(`${at}.target`, `"plot" exactly when the effect is finishGrowth`)
    }
    if ((effect.kind === "fillOrder") !== (target === "order")) {
        fail(`${at}.target`, `"order" exactly when the effect is fillOrder`)
    }

    let needs: GameSystem[] = []
    if (has(entry, "needs")) {
        const n = entry.needs
        if (!Array.isArray(n) || !n.every((x) => (GAME_SYSTEMS as unknown[]).includes(x))) {
            fail(`${at}.needs`, `a list of ${GAME_SYSTEMS.join(", ")}`)
        }
        if (new Set(n).size !== n.length) fail(`${at}.needs`, "free of repeats")
        needs = [...(n as GameSystem[])]
    }
    if (effect.kind === "goodEvent" && !needs.includes("events")) {
        fail(`${at}.needs`, `a list with "events" for a goodEvent power-up`)
    }

    return {
        id,
        name,
        text,
        modes: [...(modes as GameMode[])],
        weight,
        durationTicks,
        effect,
        target,
        needs
    }
}

// Checks a parsed JSON value and returns it in the typed shape. Throws naming the bad entry.
function validatePowerUps(raw: unknown): PowerUpConfig {
    if (!isObject(raw)) fail("the file", "an object with powerUps")
    const list = raw.powerUps
    if (!Array.isArray(list) || list.length === 0) fail("powerUps", "a non-empty list")
    const powerUps: Record<string, PowerUpDef> = {}
    list.forEach((entry: unknown, i) => {
        const def = validatePowerUp(entry, `powerUps[${i}]`)
        if (has(powerUps, def.id)) fail(`powerUps[${i}].id`, `unique ("${def.id}")`)
        powerUps[def.id] = def
    })
    return { powerUps }
}

const POWER_UPS: PowerUpConfig = validatePowerUps(rawPowerUps)

// ---------------------------------------------------------------------------------------------
// Drops

// True when every system the power-up needs is on in this run.
function systemsOn(def: PowerUpDef, state: GameState): boolean {
    return def.needs.every((n) => (n === "powerUps" ? state.allowPowerUps : state.allowEvents))
}

// Ids that can drop in this run: in its mode and with every system they need on. Sorted so the
// result doesn't depend on the JSON's order.
function dropTable(state: GameState, config: PowerUpConfig = POWER_UPS): string[] {
    return Object.values(config.powerUps)
        .filter((def) => def.modes.includes(state.mode) && systemsOn(def, state))
        .map((def) => def.id)
        .sort()
}

// The drop roll for one harvest, from rng.drops: one draw for the chance, and one more to pick
// which power-up when it hits. Never looks at free slots.
function rollDrop(state: GameState, config: PowerUpConfig = POWER_UPS): [string | null, RNGState] {
    const rng = state.rng.drops
    const { dropChance } = modifiersFor(state.upgrades)
    const table = dropTable(state, config)
    if (!state.allowPowerUps || dropChance <= 0 || table.length === 0) return [null, rng]

    const [roll, afterRoll] = randomInt(rng, 0, 99)
    if (roll >= dropChance) return [null, afterRoll]

    const total = table.reduce((sum, id) => sum + config.powerUps[id].weight, 0)
    const [pickRoll, afterPick] = randomInt(afterRoll, 0, total - 1)
    let r = pickRoll
    for (const id of table) {
        const w = config.powerUps[id].weight
        if (r < w) return [id, afterPick]
        r -= w
    }
    return [table[table.length - 1], afterPick] // unreachable: r < total
}

// ---------------------------------------------------------------------------------------------
// Using

// The held power-up's definition, or null for a bad slot.
function heldDef(state: GameState, slot: number, config: PowerUpConfig): PowerUpDef | null {
    if (!Number.isInteger(slot) || slot < 0 || slot >= state.powerUps.length) return null
    const id = state.powerUps[slot]
    return Object.prototype.hasOwnProperty.call(config.powerUps, id) ? config.powerUps[id] : null
}

// Where a held targeted power-up can be used, ascending: growing plots' indexes for a plot
// power-up, open orders' ids for an order one. [] for untargeted ones and bad slots.
function powerUpTargets(
    state: GameState,
    slot: number,
    config: PowerUpConfig = POWER_UPS
): number[] {
    const def = heldDef(state, slot, config)
    if (def === null || def.target === null) return []
    if (def.target === "order") return state.orders.map((o) => o.id).sort((a, b) => a - b)
    return state.plots.flatMap((p, i) => (p.state === "growing" ? [i] : []))
}

// True when usePowerUp { slot, target } would succeed.
function canUsePowerUp(
    state: GameState,
    slot: number,
    target: number | null,
    config: PowerUpConfig = POWER_UPS
): boolean {
    if (state.status === "ended" || state.upgradeOffer !== null || !state.allowPowerUps) {
        return false
    }
    const def = heldDef(state, slot, config)
    if (def === null || !systemsOn(def, state)) return false
    // Good omen calls an event now, so it waits while another event is announced or running.
    if (def.effect.kind === "goodEvent" && state.event !== null) return false
    if (def.target === null) return target === null
    return target !== null && powerUpTargets(state, slot, config).includes(target)
}

// Length of a lasting power-up with powerUpDurationPct applied; null for an instant one.
function durationFor(def: PowerUpDef, upgrades: readonly OwnedUpgrade[]): number | null {
    if (def.durationTicks === null) return null
    return scalePct(def.durationTicks, modifiersFor(upgrades).powerUpDurationPct)
}

export {
    validatePowerUps,
    POWER_UPS,
    dropTable,
    rollDrop,
    powerUpTargets,
    canUsePowerUp,
    durationFor
}
