// Upgrades: definitions from src/data/upgrades.json, adding owned copies up into Modifiers,
// valid targets, eligibility, and rolling offers. See specs/upgrades.md.
import type {
    CropTable,
    GameState,
    GameSystem,
    Modifiers,
    ModifierStat,
    OfferCard,
    OwnedUpgrade,
    Pool,
    RNGState,
    StatDef,
    Tier,
    TierDef,
    UpgradeConfig,
    UpgradeDef,
    UpgradeEffect,
    UpgradeTarget
} from "./types"
import { TICKS_PER_SECOND, TIERS, UPGRADE_CHOICES } from "./game_constants"
import { pick, randomInt } from "./mulberry"
import { ECONOMY, fertilizerLocked } from "./economy_config"
import type { EconomyConfig } from "./economy_config"
import rawUpgrades from "../data/upgrades.json"

// Every Modifiers field. upgrades.json's `stats` must list exactly these.
const MODIFIER_STATS: readonly ModifierStat[] = [
    "extraPlots",
    "growthPct",
    "yieldBonus",
    "bumperChance",
    "orderTimePct",
    "coinsPerOrder",
    "lifePricePct",
    "dropChance",
    "powerUpSlots",
    "powerUpDurationPct",
    "warnBonusSeconds",
    "goodEventPct",
    "eventGapPct",
    "rainCutPct",
    "sunnyDurationPct",
    "deliverBonusPct",
    "frostDurationPct",
    "crowDurationPct",
    "moleBlockChance",
    "shielded",
    "bumperExtra",
    "smallOrderChance",
    "sneakPeek",
    "crowBan",
    "earlyBirdCoins",
    "levelPacePct",
    "extraLives",
    "lastStandGrowthPct",
    "secondChance",
    "secondWindPct",
    "wormBonusPct",
    "neighborReplant",
    "birdPlotsPct",
    "rotPct",
    "fogDurationPct",
    "emergencyTimePct",
    "storageBonus",
    "fertilizerUnlocked",
    "comboMissesForgiven",
    "comboStepBonusPct",
    "comboStartPct",
    "rushValuePct",
    "finalePct",
    "doubleDeliveryPct",
    "sellPricePct",
    "miracleGrow",
    "miracleRechargeSeconds",
    "quickSoilSeconds",
    "autoHarvest",
    "interestPct",
    "shopPricePct",
    "freeRestocks",
    "tierLuck"
]

// Stats read per plot and crop (by plant and harvest), so targeted upgrades may use them.
const CONTEXT_STATS: readonly ModifierStat[] = [
    "growthPct",
    "yieldBonus",
    "bumperChance",
    "shielded",
    "quickSoilSeconds",
    "autoHarvest"
]

const POOLS: readonly Pool[] = ["survival", "timed", "shop"]

// Systems an upgrade's `needs` may name.
const GAME_SYSTEMS: readonly GameSystem[] = ["powerUps", "events"]

// ---------------------------------------------------------------------------------------------
// Validation

function isObject(v: unknown): v is Record<string, unknown> {
    return typeof v === "object" && v !== null && !Array.isArray(v)
}

function fail(field: string, rule: string): never {
    throw new Error(`upgrades config: ${field} must be ${rule}`)
}

function has(obj: Record<string, unknown>, key: string): boolean {
    return Object.prototype.hasOwnProperty.call(obj, key)
}

function nonEmptyString(obj: Record<string, unknown>, key: string, at: string): string {
    const v = obj[key]
    if (typeof v !== "string" || v.length === 0) fail(`${at}.${key}`, "a non-empty string")
    return v
}

function wholeNumber(v: unknown, field: string, rule = "a whole number"): number {
    if (typeof v !== "number" || !Number.isInteger(v)) fail(field, rule)
    return v
}

// Checks that `obj` has exactly the keys in `keys`.
function exactKeys(obj: Record<string, unknown>, keys: readonly string[], at: string): void {
    for (const k of keys) if (!has(obj, k)) fail(at, `an object with "${k}"`)
    for (const k of Object.keys(obj)) {
        if (!keys.includes(k)) fail(at, `an object with only ${keys.join(", ")} (found "${k}")`)
    }
}

function validateStats(raw: unknown): Record<ModifierStat, StatDef> {
    if (!isObject(raw)) fail("stats", "an object")
    exactKeys(raw, MODIFIER_STATS, "stats")
    const stats = {} as Record<ModifierStat, StatDef>
    for (const stat of MODIFIER_STATS) {
        const at = `stats.${stat}`
        const entry = raw[stat]
        if (!isObject(entry)) fail(at, "an object")
        const base = wholeNumber(entry.base, `${at}.base`)
        const min = wholeNumber(entry.min, `${at}.min`)
        const max = wholeNumber(entry.max, `${at}.max`)
        if (!(min <= base && base <= max)) fail(at, "min <= base <= max")
        stats[stat] = { base, min, max }
    }
    return stats
}

function validateTiers(raw: unknown): Record<Tier, TierDef> {
    if (!isObject(raw)) fail("tiers", "an object")
    exactKeys(raw, TIERS, "tiers")
    const tiers = {} as Record<Tier, TierDef>
    for (const tier of TIERS) {
        const at = `tiers.${tier}`
        const entry = raw[tier]
        if (!isObject(entry)) fail(at, "an object")
        exactKeys(entry, ["weight"], at)
        const weight = wholeNumber(entry.weight, `${at}.weight`, "a whole number >= 0")
        if (weight < 0) fail(`${at}.weight`, "a whole number >= 0")
        tiers[tier] = { weight }
    }
    if (TIERS.every((t) => tiers[t].weight === 0)) fail("tiers", "given at least one weight > 0")
    return tiers
}

function validateEffect(raw: unknown, tiered: boolean, at: string): UpgradeEffect {
    if (!isObject(raw)) fail(at, "an object")
    const stat = raw.stat
    if (typeof stat !== "string" || !(MODIFIER_STATS as string[]).includes(stat)) {
        fail(`${at}.stat`, `one of ${MODIFIER_STATS.join(", ")}`)
    }
    if (tiered) {
        if (has(raw, "amount")) fail(at, "perTier, not amount, on a tiered upgrade")
        const perTier = raw.perTier
        if (!Array.isArray(perTier) || perTier.length !== TIERS.length) {
            fail(`${at}.perTier`, `a list of ${TIERS.length} whole numbers`)
        }
        const amounts = perTier.map((v: unknown, i) =>
            wholeNumber(v, `${at}.perTier[${i}]`, "a whole number other than 0")
        )
        if (amounts.some((v) => v === 0)) fail(`${at}.perTier`, "free of zeros")
        if (!amounts.every((v) => Math.sign(v) === Math.sign(amounts[0]))) {
            fail(`${at}.perTier`, "all the same sign")
        }
        for (let i = 1; i < amounts.length; i++) {
            if (Math.abs(amounts[i]) < Math.abs(amounts[i - 1])) {
                fail(`${at}.perTier`, "no weaker at a higher tier")
            }
        }
        return { stat: stat as ModifierStat, amounts }
    }
    if (has(raw, "perTier")) fail(at, "amount, not perTier, on a non-tiered upgrade")
    const amount = wholeNumber(raw.amount, `${at}.amount`, "a whole number other than 0")
    if (amount === 0) fail(`${at}.amount`, "a whole number other than 0")
    return { stat: stat as ModifierStat, amounts: [amount] }
}

function validatePools(entry: Record<string, unknown>, at: string): Pool[] {
    const pools = entry.pools
    if (!Array.isArray(pools) || pools.length === 0) fail(`${at}.pools`, "a non-empty list")
    for (const p of pools) {
        if (!(POOLS as unknown[]).includes(p)) fail(`${at}.pools`, `made of ${POOLS.join(", ")}`)
    }
    if (new Set(pools).size !== pools.length) fail(`${at}.pools`, "free of repeats")
    return [...(pools as Pool[])]
}

// Instant upgrades (Promotion): an `instant` action and a fixed tier, and none of the fields a
// stored copy would need.
const INSTANT_ACTIONS: readonly string[] = ["promote"]
const NOT_ON_INSTANT = ["maxCopies", "sellable", "effects", "target", "targetRule", "requires"]

function validateInstant(
    entry: Record<string, unknown>,
    at: string,
    base: { id: string; name: string; text: string }
): UpgradeDef {
    if (typeof entry.instant !== "string" || !INSTANT_ACTIONS.includes(entry.instant)) {
        fail(`${at}.instant`, `one of ${INSTANT_ACTIONS.join(", ")} on an instant upgrade`)
    }
    if (!(TIERS as unknown[]).includes(entry.tier)) {
        fail(`${at}.tier`, `one of ${TIERS.join(", ")} on an instant upgrade`)
    }
    for (const k of NOT_ON_INSTANT) {
        if (has(entry, k)) fail(`${at}.${k}`, "left out on an instant upgrade")
    }
    let category: string | null = null
    if (has(entry, "category")) category = nonEmptyString(entry, "category", at)
    return {
        ...base,
        kind: "instant",
        instant: entry.instant as "promote",
        pools: validatePools(entry, at),
        tier: entry.tier as Tier,
        maxCopies: 0,
        sellable: false,
        effects: [],
        target: null,
        targetRule: null,
        requires: [],
        category,
        needs: []
    }
}

function validateUpgrade(entry: unknown, at: string): UpgradeDef {
    if (!isObject(entry)) fail(at, "an object")
    const id = nonEmptyString(entry, "id", at)
    const name = nonEmptyString(entry, "name", at)
    const text = nonEmptyString(entry, "text", at)

    if (has(entry, "kind") && entry.kind !== "lasting" && entry.kind !== "instant") {
        fail(`${at}.kind`, `"lasting" or "instant"`)
    }
    if (entry.kind === "instant") return validateInstant(entry, at, { id, name, text })
    if (has(entry, "instant")) fail(`${at}.instant`, "left out on a lasting upgrade")

    const pools = entry.pools
    if (!Array.isArray(pools) || pools.length === 0) fail(`${at}.pools`, "a non-empty list")
    for (const p of pools) {
        if (!(POOLS as unknown[]).includes(p)) fail(`${at}.pools`, `made of ${POOLS.join(", ")}`)
    }
    if (new Set(pools).size !== pools.length) fail(`${at}.pools`, "free of repeats")

    let tier: Tier | null = null
    if (has(entry, "tier")) {
        if (!(TIERS as unknown[]).includes(entry.tier))
            fail(`${at}.tier`, `one of ${TIERS.join(", ")}`)
        tier = entry.tier as Tier
    }

    const maxCopies = wholeNumber(entry.maxCopies, `${at}.maxCopies`, "a whole number >= 1")
    if (maxCopies < 1) fail(`${at}.maxCopies`, "a whole number >= 1")

    if (typeof entry.sellable !== "boolean") fail(`${at}.sellable`, "true or false")

    const rawEffects = entry.effects
    if (!Array.isArray(rawEffects) || rawEffects.length === 0) {
        fail(`${at}.effects`, "a non-empty list")
    }
    const effects = rawEffects.map((e: unknown, i) =>
        validateEffect(e, tier === null, `${at}.effects[${i}]`)
    )
    if (new Set(effects.map((e) => e.stat)).size !== effects.length) {
        fail(`${at}.effects`, "using each stat at most once")
    }

    let target: UpgradeDef["target"] = null
    let targetRule: UpgradeDef["targetRule"] = null
    if (has(entry, "target")) {
        if (entry.target !== "plot" && entry.target !== "crop")
            fail(`${at}.target`, `"plot" or "crop"`)
        target = entry.target
        if (entry.targetRule !== "oncePerTarget" && entry.targetRule !== "stackable") {
            fail(`${at}.targetRule`, `"oncePerTarget" or "stackable" when target is set`)
        }
        targetRule = entry.targetRule
        for (const e of effects) {
            if (!CONTEXT_STATS.includes(e.stat)) {
                fail(`${at}.effects`, `only ${CONTEXT_STATS.join(", ")} on a targeted upgrade`)
            }
        }
    } else if (has(entry, "targetRule")) {
        fail(`${at}.targetRule`, "left out when target is")
    }

    let requires: string[] = []
    if (has(entry, "requires")) {
        const r = entry.requires
        if (!Array.isArray(r) || !r.every((x) => typeof x === "string" && x.length > 0)) {
            fail(`${at}.requires`, "a list of upgrade ids")
        }
        if (r.includes(id)) fail(`${at}.requires`, "free of the upgrade's own id")
        requires = [...(r as string[])]
    }

    let category: string | null = null
    if (has(entry, "category")) category = nonEmptyString(entry, "category", at)

    let needs: GameSystem[] = []
    if (has(entry, "needs")) {
        const n = entry.needs
        if (!Array.isArray(n) || !n.every((x) => (GAME_SYSTEMS as unknown[]).includes(x))) {
            fail(`${at}.needs`, `a list of ${GAME_SYSTEMS.join(", ")}`)
        }
        if (new Set(n).size !== n.length) fail(`${at}.needs`, "free of repeats")
        needs = [...(n as GameSystem[])]
    }

    return {
        id,
        name,
        text,
        kind: "lasting",
        instant: null,
        pools: [...(pools as Pool[])],
        tier,
        maxCopies,
        sellable: entry.sellable,
        effects,
        target,
        targetRule,
        requires,
        category,
        needs
    }
}

// Checks a parsed JSON value and returns it in the typed shape. Throws naming the bad entry.
function validateUpgrades(raw: unknown): UpgradeConfig {
    if (!isObject(raw)) fail("the file", "an object with stats, tiers and upgrades")
    const stats = validateStats(raw.stats)
    const tiers = validateTiers(raw.tiers)
    const list = raw.upgrades
    if (!Array.isArray(list) || list.length === 0) fail("upgrades", "a non-empty list")
    const upgrades: Record<string, UpgradeDef> = {}
    list.forEach((entry: unknown, i) => {
        const def = validateUpgrade(entry, `upgrades[${i}]`)
        if (has(upgrades, def.id)) fail(`upgrades[${i}].id`, `unique ("${def.id}")`)
        upgrades[def.id] = def
    })
    for (const def of Object.values(upgrades)) {
        for (const r of def.requires) {
            if (!has(upgrades, r)) fail(`${def.id}.requires`, `known ids ("${r}" is not)`)
        }
    }
    return { stats, tiers, upgrades }
}

const UPGRADES: UpgradeConfig = validateUpgrades(rawUpgrades)

// ---------------------------------------------------------------------------------------------
// Adding up

// Each stat's base value. Frozen.
function baseModifiers(config: UpgradeConfig = UPGRADES): Readonly<Modifiers> {
    const m = {} as Modifiers
    for (const stat of MODIFIER_STATS) m[stat] = config.stats[stat].base
    return Object.freeze(m)
}

// What effect number `effect` of `def` adds at `tier`.
function effectAmount(def: UpgradeDef, effect: number, tier: Tier): number {
    const { amounts } = def.effects[effect]
    return def.tier === null ? amounts[TIERS.indexOf(tier)] : amounts[0]
}

function defFor(id: string, config: UpgradeConfig): UpgradeDef {
    if (!has(config.upgrades, id)) throw new Error(`modifiers: unknown upgrade "${id}"`)
    return config.upgrades[id]
}

// Sums the copies that `counts` accepts on top of the bases, then clamps once.
function sumCopies(
    upgrades: readonly OwnedUpgrade[],
    config: UpgradeConfig,
    counts: (copy: OwnedUpgrade, def: UpgradeDef) => boolean
): Modifiers {
    const m: Modifiers = { ...baseModifiers(config) }
    for (const copy of upgrades) {
        const def = defFor(copy.id, config)
        if (!counts(copy, def)) continue
        def.effects.forEach((e, i) => {
            m[e.stat] += effectAmount(def, i, copy.tier)
        })
    }
    for (const stat of MODIFIER_STATS) {
        const { min, max } = config.stats[stat]
        m[stat] = Math.min(max, Math.max(min, m[stat]))
    }
    return m
}

// Last-result cache: the sim never changes arrays in place and only chooseUpgrade builds a
// new upgrades array, so this recalculates once per pick and once per new run.
let lastUpgrades: readonly OwnedUpgrade[] | null = null
let lastConfig: UpgradeConfig | null = null
let lastModifiers: Readonly<Modifiers> = baseModifiers(UPGRADES)

// Run-wide totals: every untargeted copy. The result is frozen and may be shared.
function modifiersFor(
    upgrades: readonly OwnedUpgrade[],
    config: UpgradeConfig = UPGRADES
): Readonly<Modifiers> {
    if (upgrades !== lastUpgrades || config !== lastConfig) {
        lastModifiers = Object.freeze(sumCopies(upgrades, config, (c) => c.target === null))
        lastUpgrades = upgrades
        lastConfig = config
    }
    return lastModifiers
}

type Where = { plot: number | null; cropId: string | null }

// True when a copy counts at `where`: untargeted, or targeted at that plot or crop.
function countsAt(copy: OwnedUpgrade, def: UpgradeDef, where: Where): boolean {
    if (copy.target === null) return true
    if (def.target === "plot") return copy.target === where.plot
    return copy.target === where.cropId
}

// Totals at one plot and crop: run-wide copies plus copies targeted there. Not cached.
function modifiersAt(
    upgrades: readonly OwnedUpgrade[],
    where: Where,
    config: UpgradeConfig = UPGRADES
): Readonly<Modifiers> {
    return Object.freeze(sumCopies(upgrades, config, (c, d) => countsAt(c, d, where)))
}

// Applies a percentage modifier. Every rule uses this so they all round the same way.
function scalePct(base: number, pct: number): number {
    return Math.max(1, Math.round((base * pct) / 100))
}

// The growthPct a crop planted now on `plot` gets: growthPct there, and on a Survival run's
// last life also Last stand's lastStandGrowthPct (the two multiply, rounded to a whole %).
function plantGrowthPct(state: GameState, plot: number, cropId: string): number {
    const { growthPct } = modifiersAt(state.upgrades, { plot, cropId })
    if (state.mode !== "survival" || state.lives !== 1) return growthPct
    return scalePct(growthPct, modifiersFor(state.upgrades).lastStandGrowthPct)
}

// Ticks Quick soil takes off a crop planted now on `plot`. Used wherever plantGrowthPct is.
function plantCutTicks(state: GameState, plot: number, cropId: string): number {
    return modifiersAt(state.upgrades, { plot, cropId }).quickSoilSeconds * TICKS_PER_SECOND
}

// ---------------------------------------------------------------------------------------------
// Eligibility

function copyCount(upgrades: readonly OwnedUpgrade[], id: string): number {
    return upgrades.filter((u) => u.id === id).length
}

// True when at least one effect of `def` can still move its stat in `m`. The sign of an effect
// is the same at every tier, so the first amount is enough.
function canChange(def: UpgradeDef, m: Readonly<Modifiers>, config: UpgradeConfig): boolean {
    return def.effects.some((e) => {
        const { min, max } = config.stats[e.stat]
        return e.amounts[0] < 0 ? m[e.stat] > min : m[e.stat] < max
    })
}

// Where a new copy of `id` could go: [null] for untargeted, else plot indexes or crop ids.
function validTargets(
    upgrades: readonly OwnedUpgrade[],
    id: string,
    plotCount: number,
    crops: CropTable,
    config: UpgradeConfig = UPGRADES
): UpgradeTarget[] {
    const def = defFor(id, config)
    if (def.target === null) {
        return canChange(def, modifiersFor(upgrades, config), config) ? [null] : []
    }
    const taken = (t: UpgradeTarget) =>
        def.targetRule === "oncePerTarget" && upgrades.some((u) => u.id === id && u.target === t)
    if (def.target === "plot") {
        const plots = Array.from({ length: plotCount }, (_, i) => i)
        return plots.filter(
            (plot) =>
                !taken(plot) &&
                canChange(def, modifiersAt(upgrades, { plot, cropId: null }, config), config)
        )
    }
    return Object.keys(crops)
        .sort()
        .filter(
            (cropId) =>
                !taken(cropId) &&
                canChange(def, modifiersAt(upgrades, { plot: null, cropId }, config), config)
        )
}

// The totals where an owned copy applies: run-wide, or at its plot or crop.
function modifiersWhere(
    copy: OwnedUpgrade,
    def: UpgradeDef,
    upgrades: readonly OwnedUpgrade[],
    config: UpgradeConfig
): Readonly<Modifiers> {
    if (copy.target === null) return modifiersFor(upgrades, config)
    if (def.target === "plot") {
        return modifiersAt(upgrades, { plot: copy.target as number, cropId: null }, config)
    }
    return modifiersAt(upgrades, { plot: null, cropId: copy.target as string }, config)
}

// Indexes of the owned copies Promotion could raise one tier, ascending: tiered, below
// legendary, with an effect that grows at the next tier and can still change its stat there.
function promotionTargets(
    upgrades: readonly OwnedUpgrade[],
    config: UpgradeConfig = UPGRADES
): number[] {
    return upgrades.flatMap((copy, index) => {
        const def = defFor(copy.id, config)
        const i = TIERS.indexOf(copy.tier)
        if (def.kind !== "lasting" || def.tier !== null || i >= TIERS.length - 1) return []
        const m = modifiersWhere(copy, def, upgrades, config)
        const grows = def.effects.some((e) => {
            if (Math.abs(e.amounts[i + 1]) <= Math.abs(e.amounts[i])) return false
            const { min, max } = config.stats[e.stat]
            return e.amounts[0] < 0 ? m[e.stat] > min : m[e.stat] < max
        })
        return grows ? [index] : []
    })
}

// True when every system `def` needs is on in this run.
function systemsOn(def: UpgradeDef, state: GameState): boolean {
    return def.needs.every((n) => (n === "powerUps" ? state.allowPowerUps : state.allowEvents))
}

// True for an upgrade that only unlocks fertilizer (Compost) while economy.json makes fertilizer
// a basic action, so it would do nothing.
function unlocksNothing(def: UpgradeDef, economy: EconomyConfig = ECONOMY): boolean {
    return !fertilizerLocked(economy) && def.effects.every((e) => e.stat === "fertilizerUnlocked")
}

// True when an instant upgrade would do something now.
function instantUsable(def: UpgradeDef, state: GameState, config: UpgradeConfig): boolean {
    return def.instant === "promote" && promotionTargets(state.upgrades, config).length > 0
}

// True when a lasting upgrade can take one more copy now.
function lastingEligible(
    def: UpgradeDef,
    state: GameState,
    crops: CropTable,
    config: UpgradeConfig
): boolean {
    const { upgrades } = state
    return (
        copyCount(upgrades, def.id) < def.maxCopies &&
        def.requires.every((r) => copyCount(upgrades, r) > 0) &&
        systemsOn(def, state) &&
        !unlocksNothing(def) &&
        validTargets(upgrades, def.id, state.plots.length, crops, config).length > 0
    )
}

// Ids that can be offered from `pool` (or from any of several pools, as the shop draws), sorted
// so the list doesn't depend on the JSON's order.
function eligibleUpgrades(
    state: GameState,
    pool: Pool | readonly Pool[],
    crops: CropTable,
    config: UpgradeConfig = UPGRADES
): string[] {
    const pools: readonly Pool[] = typeof pool === "string" ? [pool] : pool
    return Object.values(config.upgrades)
        .filter(
            (def) =>
                def.pools.some((p) => pools.includes(p)) &&
                (def.kind === "instant"
                    ? instantUsable(def, state, config)
                    : lastingEligible(def, state, crops, config))
        )
        .map((def) => def.id)
        .sort()
}

// ---------------------------------------------------------------------------------------------
// Offers

// Lucky stars: each tier's weight with tierLuck applied. Common is unchanged and each tier above
// it gains tierLuck% more per step: floor(weight × (100 + tierLuck × index) / 100).
function luckyWeights(tierLuck: number, config: UpgradeConfig = UPGRADES): Record<Tier, number> {
    const w = {} as Record<Tier, number>
    TIERS.forEach((t, i) => {
        w[t] = Math.floor((config.tiers[t].weight * (100 + tierLuck * i)) / 100)
    })
    return w
}

// The plain tier weights from the config.
function plainWeights(config: UpgradeConfig = UPGRADES): Record<Tier, number> {
    return luckyWeights(0, config)
}

// Up to `count` cards from `eligible`, drawn from `rng`: for each, roll a tier among the tiers
// that still have candidates, then pick an upgrade at that tier. Two draws per card. Offers and
// the shop's stock both draw this way.
function rollCards(
    eligible: readonly string[],
    rng: RNGState,
    count: number,
    weights: Record<Tier, number>,
    config: UpgradeConfig = UPGRADES
): [OfferCard[], RNGState] {
    const cards: OfferCard[] = []
    for (let n = 0; n < count; n++) {
        const offered = new Set(cards.map((c) => c.id))
        const candidates = (tier: Tier) =>
            eligible.filter((id) => {
                const t = config.upgrades[id].tier
                return !offered.has(id) && (t === null || t === tier)
            })
        const usable = TIERS.filter((t) => weights[t] > 0 && candidates(t).length > 0)
        if (usable.length === 0) break

        const total = usable.reduce((sum, t) => sum + weights[t], 0)
        const [roll, afterTier] = randomInt(rng, 0, total - 1)
        let r = roll
        let tier = usable[usable.length - 1]
        for (const t of usable) {
            const w = weights[t]
            if (r < w) {
                tier = t
                break
            }
            r -= w
        }

        const [id, afterPick] = pick(afterTier, candidates(tier))
        rng = afterPick
        cards.push({ id, tier })
    }
    return [cards, rng]
}

// Up to UPGRADE_CHOICES cards from state.rng.upgrades, with Lucky stars' weights.
function rollOffer(
    state: GameState,
    pool: Pool,
    crops: CropTable,
    config: UpgradeConfig = UPGRADES
): [OfferCard[], RNGState] {
    const eligible = eligibleUpgrades(state, pool, crops, config)
    const weights = luckyWeights(modifiersFor(state.upgrades, config).tierLuck, config)
    return rollCards(eligible, state.rng.upgrades, UPGRADE_CHOICES, weights, config)
}

export {
    validateUpgrades,
    UPGRADES,
    MODIFIER_STATS,
    baseModifiers,
    effectAmount,
    modifiersFor,
    modifiersAt,
    scalePct,
    plantGrowthPct,
    plantCutTicks,
    copyCount,
    promotionTargets,
    validTargets,
    eligibleUpgrades,
    unlocksNothing,
    luckyWeights,
    plainWeights,
    rollCards,
    rollOffer
}
