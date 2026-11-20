// Survival upgrades: definitions from src/data/upgrades.json, adding picks up into
// Modifiers, and rolling offers. See specs/upgrades.md.
import type { Modifiers, ModifierStat, RNGState, UpgradeDef, UpgradeTable } from "./types"
import { MIN_MODIFIER_PCT, UPGRADE_CHOICES } from "./game_constants"
import { randomInt } from "./mulberry"
import rawUpgrades from "../data/upgrades.json"

const BASE_MODIFIERS: Readonly<Modifiers> = Object.freeze({
    extraPlots: 0,
    growthPct: 100,
    yieldBonus: 0,
    orderTimePct: 100,
    coinsPerOrder: 0,
    lifePricePct: 100
})

const STATS = Object.keys(BASE_MODIFIERS) as ModifierStat[]
const PCT_STATS: readonly ModifierStat[] = ["growthPct", "orderTimePct", "lifePricePct"]

function isObject(v: unknown): v is Record<string, unknown> {
    return typeof v === "object" && v !== null && !Array.isArray(v)
}

function fail(field: string, rule: string): never {
    throw new Error(`upgrades config: ${field} must be ${rule}`)
}

function nonEmptyString(obj: Record<string, unknown>, key: string, at: string): string {
    const v = obj[key]
    if (typeof v !== "string" || v.length === 0) fail(`${at}.${key}`, "a non-empty string")
    return v
}

// Checks a parsed JSON value and returns it as a table keyed by id. Throws naming the bad entry.
function validateUpgrades(raw: unknown): UpgradeTable {
    if (!Array.isArray(raw) || raw.length === 0) fail("upgrades", "a non-empty list")
    const table: UpgradeTable = {}
    raw.forEach((entry: unknown, i) => {
        const at = `upgrades[${i}]`
        if (!isObject(entry)) fail(at, "an object")
        const id = nonEmptyString(entry, "id", at)
        if (Object.prototype.hasOwnProperty.call(table, id)) fail(`${at}.id`, `unique ("${id}")`)
        const name = nonEmptyString(entry, "name", at)
        const text = nonEmptyString(entry, "text", at)
        const stat = entry.stat
        if (typeof stat !== "string" || !(STATS as string[]).includes(stat)) {
            fail(`${at}.stat`, `one of ${STATS.join(", ")}`)
        }
        const amount = entry.amount
        if (typeof amount !== "number" || !Number.isInteger(amount) || amount === 0) {
            fail(`${at}.amount`, "a whole number other than 0")
        }
        const maxStacks = entry.maxStacks
        if (typeof maxStacks !== "number" || !Number.isInteger(maxStacks) || maxStacks < 1) {
            fail(`${at}.maxStacks`, "a whole number >= 1")
        }
        const def: UpgradeDef = { id, name, text, stat: stat as ModifierStat, amount, maxStacks }
        table[id] = def
    })
    return table
}

const UPGRADES: UpgradeTable = validateUpgrades(rawUpgrades)

// Adds up the picks from BASE_MODIFIERS, then clamps. Throws for an unknown id.
function computeModifiers(upgrades: readonly string[], table: UpgradeTable): Modifiers {
    const m: Modifiers = { ...BASE_MODIFIERS }
    for (const id of upgrades) {
        if (!Object.prototype.hasOwnProperty.call(table, id)) {
            throw new Error(`modifiersFor: unknown upgrade "${id}"`)
        }
        const def = table[id]
        m[def.stat] += def.amount
    }
    for (const stat of STATS) {
        const floor = PCT_STATS.includes(stat) ? MIN_MODIFIER_PCT : 0
        m[stat] = Math.max(floor, m[stat])
    }
    return m
}

// Last-result cache: the sim never changes arrays in place and only chooseUpgrade builds a
// new upgrades array, so this recalculates once per pick and once per new run.
let lastUpgrades: readonly string[] | null = null
let lastTable: UpgradeTable | null = null
let lastModifiers: Readonly<Modifiers> = BASE_MODIFIERS

// What the picks add up to. The result is frozen and may be shared between calls.
function modifiersFor(
    upgrades: readonly string[],
    table: UpgradeTable = UPGRADES
): Readonly<Modifiers> {
    if (upgrades !== lastUpgrades || table !== lastTable) {
        lastModifiers = Object.freeze(computeModifiers(upgrades, table))
        lastUpgrades = upgrades
        lastTable = table
    }
    return lastModifiers
}

// Applies a percentage modifier. Every rule uses this so they all round the same way.
function scalePct(base: number, pct: number): number {
    return Math.max(1, Math.round((base * pct) / 100))
}

function stackCount(upgrades: readonly string[], id: string): number {
    return upgrades.filter((u) => u === id).length
}

// Ids that can still be offered, sorted so the list doesn't depend on the JSON's order.
function eligibleUpgrades(upgrades: readonly string[], table: UpgradeTable = UPGRADES): string[] {
    return Object.keys(table)
        .filter((id) => stackCount(upgrades, id) < table[id].maxStacks)
        .sort()
}

// Up to UPGRADE_CHOICES different eligible ids, by partial Fisher-Yates: one draw per id.
function rollOffer(
    upgrades: readonly string[],
    rng: RNGState,
    table: UpgradeTable = UPGRADES
): [string[], RNGState] {
    const pool = eligibleUpgrades(upgrades, table)
    const count = Math.min(UPGRADE_CHOICES, pool.length)
    for (let i = 0; i < count; i++) {
        const [j, next] = randomInt(rng, i, pool.length - 1)
        rng = next
        ;[pool[i], pool[j]] = [pool[j], pool[i]]
    }
    return [pool.slice(0, count), rng]
}

export {
    validateUpgrades,
    UPGRADES,
    BASE_MODIFIERS,
    modifiersFor,
    scalePct,
    stackCount,
    eligibleUpgrades,
    rollOffer
}
