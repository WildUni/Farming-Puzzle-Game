import { describe, it, expect } from "vitest"
import {
    validateUpgrades,
    UPGRADES,
    MODIFIER_STATS,
    baseModifiers,
    effectAmount,
    modifiersFor,
    modifiersAt,
    scalePct,
    copyCount,
    validTargets,
    eligibleUpgrades,
    unlocksNothing,
    rollOffer
} from "./upgrades"
import { ECONOMY } from "./economy_config"
import { TIERS, UPGRADE_CHOICES } from "./game_constants"
import { createGame } from "./main"
import { buildCropTable } from "./plot"
import { nextValue, seedStream } from "./mulberry"
import rawUpgrades from "../data/upgrades.json"
import type { GameState, OwnedUpgrade, Tier, UpgradeConfig } from "./types"

const crops = buildCropTable([
    { id: "garlic", growTicks: 80, yield: 2, value: 2, fertilizerCost: 4 },
    { id: "carrot", growTicks: 150, yield: 2, value: 8, fertilizerCost: 2 }
])

// A small config of our own, so these tests don't depend on the shipped numbers.
function rawConfig(): Record<string, unknown> {
    return {
        stats: {
            extraPlots: { base: 0, min: 0, max: 2 },
            growthPct: { base: 100, min: 40, max: 100 },
            yieldBonus: { base: 0, min: 0, max: 3 },
            bumperChance: { base: 0, min: 0, max: 50 },
            orderTimePct: { base: 100, min: 100, max: 200 },
            coinsPerOrder: { base: 0, min: 0, max: 6 },
            lifePricePct: { base: 100, min: 25, max: 100 },
            dropChance: { base: 0, min: 0, max: 40 },
            powerUpSlots: { base: 2, min: 1, max: 3 },
            powerUpDurationPct: { base: 100, min: 100, max: 200 },
            warnBonusSeconds: { base: 0, min: 0, max: 5 },
            goodEventPct: { base: 40, min: 0, max: 70 },
            eventGapPct: { base: 100, min: 100, max: 200 },
            rainCutPct: { base: 100, min: 100, max: 300 },
            sunnyDurationPct: { base: 100, min: 100, max: 250 },
            deliverBonusPct: { base: 100, min: 100, max: 250 },
            frostDurationPct: { base: 100, min: 25, max: 100 },
            crowDurationPct: { base: 100, min: 25, max: 100 },
            moleBlockChance: { base: 0, min: 0, max: 75 },
            shielded: { base: 0, min: 0, max: 1 },
            bumperExtra: { base: 1, min: 1, max: 4 },
            smallOrderChance: { base: 0, min: 0, max: 50 },
            sneakPeek: { base: 0, min: 0, max: 1 },
            pestBan: { base: 0, min: 0, max: 1 },
            earlyBirdCoins: { base: 0, min: 0, max: 15 },
            levelPacePct: { base: 100, min: 100, max: 200 },
            extraLives: { base: 0, min: 0, max: 2 },
            lastStandGrowthPct: { base: 100, min: 50, max: 100 },
            secondChance: { base: 0, min: 0, max: 50 },
            secondWindPct: { base: 100, min: 100, max: 200 },
            wormBonusPct: { base: 100, min: 100, max: 300 },
            neighborReplant: { base: 0, min: 0, max: 1 },
            cloverExtraPlots: { base: 0, min: 0, max: 2 },
            waterBonusSeconds: { base: 0, min: 0, max: 6 },
            birdPlotsPct: { base: 100, min: 34, max: 100 },
            rotPct: { base: 100, min: 25, max: 100 },
            fogDurationPct: { base: 100, min: 25, max: 100 },
            emergencyTimePct: { base: 100, min: 100, max: 200 },
            crashPricePct: { base: 100, min: 100, max: 190 },
            storageBonus: { base: 0, min: 0, max: 30 },
            fertilizerUnlocked: { base: 0, min: 0, max: 1 },
            comboMissesForgiven: { base: 0, min: 0, max: 3 },
            comboStepBonusPct: { base: 0, min: 0, max: 25 },
            comboStartPct: { base: 0, min: 0, max: 50 },
            rushValuePct: { base: 0, min: 0, max: 100 },
            finalePct: { base: 0, min: 0, max: 100 },
            doubleDeliveryPct: { base: 0, min: 0, max: 100 },
            sellPricePct: { base: 100, min: 100, max: 200 },
            miracleGrow: { base: 0, min: 0, max: 1 },
            miracleRechargeSeconds: { base: 60, min: 20, max: 60 },
            quickSoilSeconds: { base: 0, min: 0, max: 10 },
            autoHarvest: { base: 0, min: 0, max: 1 },
            interestPct: { base: 0, min: 0, max: 25 },
            shopPricePct: { base: 100, min: 50, max: 100 },
            freeRestockBonus: { base: 0, min: 0, max: 1 },
            restockOrdersCut: { base: 0, min: 0, max: 4 },
            restockBankBonus: { base: 0, min: 0, max: 2 },
            tierLuck: { base: 0, min: 0, max: 60 }
        },
        tiers: {
            common: { weight: 40 },
            uncommon: { weight: 30 },
            rare: { weight: 15 },
            epic: { weight: 10 },
            legendary: { weight: 5 }
        },
        upgrades: [
            {
                id: "grow",
                name: "Grow",
                text: "Grow {0}% faster",
                pools: ["survival"],
                maxCopies: 5,
                sellable: true,
                effects: [{ stat: "growthPct", perTier: [-10, -20, -30, -40, -50] }]
            },
            {
                id: "coins",
                name: "Coins",
                text: "+{0} coins",
                pools: ["survival", "timed"],
                maxCopies: 2,
                sellable: true,
                effects: [{ stat: "coinsPerOrder", perTier: [1, 2, 3, 4, 5] }]
            },
            {
                id: "plot",
                name: "Plot",
                text: "One more plot",
                pools: ["shop"],
                tier: "rare",
                maxCopies: 2,
                sellable: false,
                effects: [{ stat: "extraPlots", amount: 1 }]
            },
            {
                id: "fav",
                name: "Fav",
                text: "{0}% faster, +{1}",
                pools: ["survival"],
                maxCopies: 3,
                sellable: true,
                target: "crop",
                targetRule: "stackable",
                effects: [
                    { stat: "growthPct", perTier: [-20, -20, -30, -30, -60] },
                    { stat: "yieldBonus", perTier: [1, 1, 1, 2, 3] }
                ]
            },
            {
                id: "guard",
                name: "Guard",
                text: "+{0} on one plot",
                pools: ["survival"],
                maxCopies: 4,
                sellable: false,
                target: "plot",
                targetRule: "oncePerTarget",
                effects: [{ stat: "yieldBonus", perTier: [1, 1, 1, 1, 1] }]
            },
            {
                id: "peek",
                name: "Peek",
                text: "Lives {0}% cheaper",
                pools: ["survival"],
                tier: "epic",
                maxCopies: 1,
                sellable: true,
                requires: ["coins"],
                category: "economy",
                effects: [{ stat: "lifePricePct", amount: -10 }]
            }
        ]
    }
}

const config: UpgradeConfig = validateUpgrades(rawConfig())

function own(id: string, tier: Tier = "common", target: number | string | null = null) {
    return { id, tier, target } satisfies OwnedUpgrade
}

function survival(overrides: Partial<GameState> = {}): GameState {
    return {
        ...createGame(1, { mode: "survival", allowPowerUps: false, allowEvents: false }),
        ...overrides
    }
}

// Advances an RNG state n times.
function advance(rng: number, n: number): number {
    for (let i = 0; i < n; i++) rng = nextValue(rng)[1]
    return rng
}

describe("validateUpgrades", () => {
    it("accepts the shipped upgrades.json", () => {
        expect(Object.keys(UPGRADES.upgrades)).toEqual(rawUpgrades.upgrades.map((u) => u.id))
        expect(Object.keys(UPGRADES.stats).sort()).toEqual([...MODIFIER_STATS].sort())
        expect(UPGRADES.tiers).toEqual(rawUpgrades.tiers)
    })

    it("turns perTier and amount into amounts, and fills optional fields", () => {
        expect(config.upgrades.grow.effects[0].amounts).toEqual([-10, -20, -30, -40, -50])
        expect(config.upgrades.plot.effects[0].amounts).toEqual([1])
        expect(config.upgrades.grow).toMatchObject({
            tier: null,
            target: null,
            targetRule: null,
            requires: [],
            category: null,
            needs: []
        })
        expect(config.upgrades.peek).toMatchObject({
            tier: "epic",
            requires: ["coins"],
            category: "economy"
        })
        expect(config.upgrades.fav).toMatchObject({ target: "crop", targetRule: "stackable" })
    })

    type Raw = Record<string, any> // eslint-disable-line @typescript-eslint/no-explicit-any
    // Each case changes one thing in a valid config.
    it("throws for a value that is not an object", () => {
        expect(() => validateUpgrades([])).toThrow(/upgrades config/)
    })

    const bad: [string, (raw: Raw) => unknown][] = [
        ["no upgrades", (r) => (r.upgrades = [])],
        ["a missing stat", (r) => delete r.stats.growthPct],
        ["an extra stat", (r) => (r.stats.speed = { base: 0, min: 0, max: 1 })],
        ["a fractional stat bound", (r) => (r.stats.growthPct.min = 1.5)],
        ["min above base", (r) => (r.stats.growthPct.min = 101)],
        ["a missing tier", (r) => delete r.tiers.epic],
        ["an extra tier", (r) => (r.tiers.mythic = { weight: 1 })],
        ["a negative weight", (r) => (r.tiers.common.weight = -1)],
        ["a field other than weight on a tier", (r) => (r.tiers.common.sellPrice = 1)],
        [
            "every weight 0",
            (r) => {
                for (const t of TIERS) r.tiers[t].weight = 0
            }
        ],
        ["an empty id", (r) => (r.upgrades[0].id = "")],
        ["a missing name", (r) => delete r.upgrades[0].name],
        ["a missing text", (r) => delete r.upgrades[0].text],
        ["a duplicate id", (r) => (r.upgrades[1].id = "grow")],
        ["empty pools", (r) => (r.upgrades[0].pools = [])],
        ["a repeated pool", (r) => (r.upgrades[0].pools = ["survival", "survival"])],
        ["an unknown pool", (r) => (r.upgrades[0].pools = ["puzzle"])],
        ["an unknown tier", (r) => (r.upgrades[2].tier = "mythic")],
        ["maxCopies 0", (r) => (r.upgrades[0].maxCopies = 0)],
        ["a missing sellable", (r) => delete r.upgrades[0].sellable],
        ["no effects", (r) => (r.upgrades[0].effects = [])],
        ["an unknown stat", (r) => (r.upgrades[0].effects[0].stat = "speed")],
        [
            "two effects on one stat",
            (r) => r.upgrades[0].effects.push({ stat: "growthPct", perTier: [-1, -1, -1, -1, -1] })
        ],
        [
            "amount on a tiered upgrade",
            (r) => (r.upgrades[0].effects[0] = { stat: "growthPct", amount: -5 })
        ],
        ["four perTier values", (r) => (r.upgrades[0].effects[0].perTier = [-1, -2, -3, -4])],
        ["a perTier value of 0", (r) => (r.upgrades[0].effects[0].perTier = [0, -2, -3, -4, -5])],
        ["mixed signs", (r) => (r.upgrades[0].effects[0].perTier = [-1, 2, -3, -4, -5])],
        ["a weaker higher tier", (r) => (r.upgrades[0].effects[0].perTier = [-5, -4, -6, -7, -8])],
        [
            "a fractional perTier",
            (r) => (r.upgrades[0].effects[0].perTier = [-1.5, -2, -3, -4, -5])
        ],
        [
            "perTier on a non-tiered upgrade",
            (r) => (r.upgrades[2].effects[0] = { stat: "extraPlots", perTier: [1, 1, 1, 1, 1] })
        ],
        ["an amount of 0", (r) => (r.upgrades[2].effects[0].amount = 0)],
        ["a fractional amount", (r) => (r.upgrades[2].effects[0].amount = 0.5)],
        ["an unknown target", (r) => (r.upgrades[3].target = "order")],
        ["a target with no rule", (r) => delete r.upgrades[3].targetRule],
        ["an unknown target rule", (r) => (r.upgrades[3].targetRule = "twice")],
        ["a rule with no target", (r) => (r.upgrades[0].targetRule = "stackable")],
        [
            "a targeted effect on a run-wide stat",
            (r) => (r.upgrades[4].effects[0] = { stat: "coinsPerOrder", perTier: [1, 1, 1, 1, 1] })
        ],
        ["requires an unknown id", (r) => (r.upgrades[5].requires = ["nope"])],
        ["requires itself", (r) => (r.upgrades[5].requires = ["peek"])],
        ["an empty category", (r) => (r.upgrades[5].category = "")],
        ["an unknown system in needs", (r) => (r.upgrades[0].needs = ["weather"])],
        ["a repeat in needs", (r) => (r.upgrades[0].needs = ["powerUps", "powerUps"])],
        ["needs that is not a list", (r) => (r.upgrades[0].needs = "powerUps")]
    ]
    it.each(bad)("throws for %s", (_, change) => {
        const raw = rawConfig()
        change(raw)
        expect(() => validateUpgrades(raw)).toThrow(/upgrades config/)
    })

    // An instant upgrade (Promotion) added to the small config.
    function withInstant(fields: Raw = {}): Raw {
        const raw = rawConfig() as Raw
        raw.upgrades.push({
            id: "promo",
            name: "Promo",
            text: "Raise one",
            kind: "instant",
            instant: "promote",
            pools: ["shop"],
            tier: "epic",
            ...fields
        })
        return raw
    }

    it("reads an instant upgrade as never stored, and every other upgrade as lasting", () => {
        const config = validateUpgrades(withInstant())
        expect(config.upgrades.promo).toMatchObject({
            kind: "instant",
            instant: "promote",
            tier: "epic",
            maxCopies: 0,
            sellable: false,
            effects: [],
            target: null
        })
        expect(config.upgrades.grow).toMatchObject({ kind: "lasting", instant: null })
    })

    const badInstant: [string, Raw][] = [
        ["an unknown kind", { kind: "magic" }],
        ["an unknown instant action", { instant: "double" }],
        ["no tier", { tier: undefined }],
        ["maxCopies", { maxCopies: 1 }],
        ["effects", { effects: [{ stat: "growthPct", amount: -1 }] }],
        ["a target", { target: "plot", targetRule: "oncePerTarget" }]
    ]
    it.each(badInstant)("throws for an instant upgrade with %s", (_, fields) => {
        const raw = withInstant(fields)
        const last = raw.upgrades[raw.upgrades.length - 1]
        for (const k of Object.keys(last)) if (last[k] === undefined) delete last[k]
        expect(() => validateUpgrades(raw)).toThrow(/upgrades config/)
    })

    it("throws for `instant` on a lasting upgrade, and allows the new per-plot stats on targets", () => {
        const raw = rawConfig() as Raw
        raw.upgrades[0].instant = "promote"
        expect(() => validateUpgrades(raw)).toThrow(/upgrades config/)
        const plot = rawConfig() as Raw
        plot.upgrades.push({
            id: "auto",
            name: "Auto",
            text: "Auto",
            pools: ["shop"],
            tier: "epic",
            maxCopies: 1,
            sellable: false,
            target: "plot",
            targetRule: "oncePerTarget",
            effects: [
                { stat: "autoHarvest", amount: 1 },
                { stat: "quickSoilSeconds", amount: 5 }
            ]
        })
        expect(() => validateUpgrades(plot)).not.toThrow()
    })
})

describe("effectAmount", () => {
    it("gives each tier's value for a tiered upgrade", () => {
        TIERS.forEach((tier, i) => {
            expect(effectAmount(config.upgrades.grow, 0, tier)).toBe(-10 * (i + 1))
        })
        expect(effectAmount(config.upgrades.fav, 1, "epic")).toBe(2)
    })

    it("gives the one amount at any tier for a non-tiered upgrade", () => {
        for (const tier of TIERS) expect(effectAmount(config.upgrades.plot, 0, tier)).toBe(1)
    })
})

describe("modifiersFor", () => {
    const base = baseModifiers(config)

    it("gives each stat's base with no upgrades", () => {
        expect(modifiersFor([], config)).toEqual(base)
        expect(base).toEqual({
            extraPlots: 0,
            growthPct: 100,
            yieldBonus: 0,
            bumperChance: 0,
            orderTimePct: 100,
            coinsPerOrder: 0,
            lifePricePct: 100,
            dropChance: 0,
            powerUpSlots: 2,
            powerUpDurationPct: 100,
            warnBonusSeconds: 0,
            goodEventPct: 40,
            eventGapPct: 100,
            rainCutPct: 100,
            sunnyDurationPct: 100,
            deliverBonusPct: 100,
            frostDurationPct: 100,
            crowDurationPct: 100,
            moleBlockChance: 0,
            shielded: 0,
            bumperExtra: 1,
            smallOrderChance: 0,
            sneakPeek: 0,
            pestBan: 0,
            earlyBirdCoins: 0,
            levelPacePct: 100,
            extraLives: 0,
            lastStandGrowthPct: 100,
            secondChance: 0,
            secondWindPct: 100,
            wormBonusPct: 100,
            neighborReplant: 0,
            cloverExtraPlots: 0,
            waterBonusSeconds: 0,
            birdPlotsPct: 100,
            rotPct: 100,
            fogDurationPct: 100,
            emergencyTimePct: 100,
            crashPricePct: 100,
            storageBonus: 0,
            fertilizerUnlocked: 0,
            comboMissesForgiven: 0,
            comboStepBonusPct: 0,
            comboStartPct: 0,
            rushValuePct: 0,
            finalePct: 0,
            doubleDeliveryPct: 0,
            sellPricePct: 100,
            miracleGrow: 0,
            miracleRechargeSeconds: 60,
            quickSoilSeconds: 0,
            autoHarvest: 0,
            interestPct: 0,
            shopPricePct: 100,
            freeRestockBonus: 0,
            restockOrdersCut: 0,
            restockBankBonus: 0,
            tierLuck: 0
        })
    })

    it("changes only the copy's stats, by its tier's amount", () => {
        expect(modifiersFor([own("coins", "rare")], config)).toEqual({ ...base, coinsPerOrder: 3 })
    })

    it("adds copies at different tiers", () => {
        const m = modifiersFor([own("grow", "common"), own("grow", "epic")], config)
        expect(m.growthPct).toBe(50)
    })

    it("clamps totals to min and max, whatever the order of the copies", () => {
        const a = [own("grow", "legendary"), own("grow", "epic"), own("coins", "legendary")]
        const b = [own("coins", "legendary"), own("grow", "epic"), own("grow", "legendary")]
        expect(modifiersFor(a, config)).toEqual({ ...base, growthPct: 40, coinsPerOrder: 5 })
        expect(modifiersFor(b, config)).toEqual(modifiersFor(a, config))
        const coins = [own("coins", "legendary"), own("coins", "legendary")]
        expect(modifiersFor(coins, config).coinsPerOrder).toBe(6)
    })

    it("ignores targeted copies", () => {
        const m = modifiersFor([own("fav", "common", "carrot"), own("guard", "common", 0)], config)
        expect(m).toEqual(base)
    })

    it("throws for an unknown id", () => {
        expect(() => modifiersFor([own("nope")], config)).toThrow(/unknown upgrade/)
    })

    it("returns the same object for the same array, and recalculates for a new one", () => {
        const picks = [own("coins")]
        const first = modifiersFor(picks, config)
        expect(modifiersFor(picks, config)).toBe(first)
        expect(modifiersFor([own("coins")], config)).toEqual(first)
        expect(modifiersFor([...picks, own("coins")], config).coinsPerOrder).toBe(2)
    })

    it("recalculates when the config changes", () => {
        // "grow" only exists in the test config, so a cached result would hide the throw.
        const picks = [own("grow")]
        expect(modifiersFor(picks, config).growthPct).toBe(90)
        expect(() => modifiersFor(picks, UPGRADES)).toThrow(/unknown upgrade/)
    })

    it("returns a frozen object", () => {
        expect(Object.isFrozen(modifiersFor([own("coins")], config))).toBe(true)
    })
})

describe("modifiersAt", () => {
    const copies = [own("grow"), own("fav", "common", "carrot"), own("guard", "common", 1)]

    it("adds a crop copy only for its crop", () => {
        expect(modifiersAt(copies, { plot: 0, cropId: "carrot" }, config)).toMatchObject({
            growthPct: 70,
            yieldBonus: 1
        })
        expect(modifiersAt(copies, { plot: 0, cropId: "garlic" }, config)).toMatchObject({
            growthPct: 90,
            yieldBonus: 0
        })
    })

    it("adds a plot copy only for its plot, together with crop copies", () => {
        expect(modifiersAt(copies, { plot: 1, cropId: "garlic" }, config).yieldBonus).toBe(1)
        expect(modifiersAt(copies, { plot: 1, cropId: "carrot" }, config).yieldBonus).toBe(2)
    })

    it("clamps the combined total", () => {
        const many = [own("grow", "legendary"), own("fav", "legendary", "carrot")]
        expect(modifiersAt(many, { plot: 0, cropId: "carrot" }, config).growthPct).toBe(40)
    })

    it("equals modifiersFor with no plot and no crop", () => {
        expect(modifiersAt(copies, { plot: null, cropId: null }, config)).toEqual(
            modifiersFor(copies, config)
        )
    })
})

describe("scalePct", () => {
    it("returns the base at 100%", () => {
        expect(scalePct(80, 100)).toBe(80)
    })

    it("rounds to the nearest whole number", () => {
        expect(scalePct(80, 85)).toBe(68)
        expect(scalePct(10, 85)).toBe(9) // 8.5 rounds up
        expect(scalePct(10, 84)).toBe(8)
    })

    it("never goes below 1", () => {
        expect(scalePct(1, 25)).toBe(1)
        expect(scalePct(0, 100)).toBe(1)
    })
})

describe("copyCount", () => {
    it("counts copies at any tier and on any target", () => {
        const picks = [own("grow", "rare"), own("fav", "common", "carrot"), own("grow", "epic")]
        expect(copyCount(picks, "grow")).toBe(2)
        expect(copyCount(picks, "fav")).toBe(1)
        expect(copyCount([], "grow")).toBe(0)
    })
})

describe("validTargets", () => {
    it("gives [null] for an untargeted upgrade, and [] once its stat is capped", () => {
        expect(validTargets([], "grow", 4, crops, config)).toEqual([null])
        const capped = [own("grow", "legendary"), own("grow", "common")]
        expect(validTargets(capped, "grow", 4, crops, config)).toEqual([])
    })

    it("lists every plot without a copy for a oncePerTarget plot upgrade", () => {
        expect(validTargets([], "guard", 3, crops, config)).toEqual([0, 1, 2])
        const placed = [own("guard", "common", 1)]
        expect(validTargets(placed, "guard", 3, crops, config)).toEqual([0, 2])
    })

    it("lists a new plot once one is added", () => {
        const placed = [own("guard", "common", 0)]
        expect(validTargets(placed, "guard", 1, crops, config)).toEqual([])
        expect(validTargets(placed, "guard", 2, crops, config)).toEqual([1])
    })

    it("lists every crop, sorted, for a stackable crop upgrade, even with copies on it", () => {
        expect(validTargets([], "fav", 4, crops, config)).toEqual(["carrot", "garlic"])
        const placed = [own("fav", "common", "carrot")]
        expect(validTargets(placed, "fav", 4, crops, config)).toEqual(["carrot", "garlic"])
    })

    it("drops a crop once all its stats are capped there", () => {
        // Growth hits 40 and yield hits 3 on carrot.
        const placed = [own("fav", "legendary", "carrot")]
        expect(validTargets(placed, "fav", 4, crops, config)).toEqual(["garlic"])
    })

    it("keeps a crop while one of its stats can still change", () => {
        // Growth is capped on carrot, but yield (1) is not.
        const placed = [own("grow", "legendary"), own("fav", "common", "carrot")]
        expect(validTargets(placed, "fav", 4, crops, config)).toEqual(["carrot", "garlic"])
    })
})

describe("eligibleUpgrades", () => {
    it("lists only ids in the given pool, sorted", () => {
        expect(eligibleUpgrades(survival(), "survival", crops, config)).toEqual([
            "coins",
            "fav",
            "grow",
            "guard"
        ])
        expect(eligibleUpgrades(survival(), "timed", crops, config)).toEqual(["coins"])
        expect(eligibleUpgrades(survival(), "shop", crops, config)).toEqual(["plot"])
    })

    it("offers Compost only while fertilizer is locked behind it", () => {
        const compost = UPGRADES.upgrades.compost
        expect(compost.tier).toBe("epic")
        expect(compost.pools).toEqual(["survival", "timed"])
        const locked = {
            ...ECONOMY,
            fertilizer: { ...ECONOMY.fertilizer, unlock: "upgrade" as const }
        }
        const basic = {
            ...ECONOMY,
            fertilizer: { ...ECONOMY.fertilizer, unlock: "basic" as const }
        }
        expect(unlocksNothing(compost, locked)).toBe(false)
        expect(unlocksNothing(compost, basic)).toBe(true)
        expect(unlocksNothing(UPGRADES.upgrades.sneakPeek, basic)).toBe(false)
        // The shipped economy.json locks it, so it is offered until owned.
        expect(eligibleUpgrades(survival(), "survival", crops)).toContain("compost")
        const owned = survival({ upgrades: [own("compost", "epic")] })
        expect(eligibleUpgrades(owned, "survival", crops)).not.toContain("compost")
    })

    it("drops an id at maxCopies, counting copies of every tier", () => {
        const two = survival({ upgrades: [own("coins", "common"), own("coins", "legendary")] })
        expect(eligibleUpgrades(two, "timed", crops, config)).toEqual([])
    })

    it("lists an event upgrade only when events are on", () => {
        const off = eligibleUpgrades(survival(), "survival", crops)
        const on = eligibleUpgrades(survival({ allowEvents: true }), "survival", crops)
        const ids = Object.values(UPGRADES.upgrades)
            .filter((d) => d.needs.includes("events"))
            .map((d) => d.id)
        expect(ids).toHaveLength(20)
        for (const id of ids) {
            expect(off).not.toContain(id)
            expect(on).toContain(id)
        }
    })

    it("offers Greenhouse once per plot", () => {
        const s = survival({ allowEvents: true })
        expect(validTargets([], "greenhouse", s.plots.length, crops)).toEqual([0, 1, 2, 3])
        const owned = [own("greenhouse", "epic", 1)]
        expect(validTargets(owned, "greenhouse", s.plots.length, crops)).toEqual([0, 2, 3])
    })

    it("lists a power-up upgrade only when power-ups are on", () => {
        const off = eligibleUpgrades(survival(), "survival", crops)
        const on = eligibleUpgrades(
            survival({ allowPowerUps: true, allowEvents: false }),
            "survival",
            crops
        )
        for (const id of ["luckyDrops", "longLasting", "bigPockets"]) {
            expect(UPGRADES.upgrades[id].needs).toEqual(["powerUps"])
            expect(off).not.toContain(id)
            expect(on).toContain(id)
        }
    })

    it("lists an id only once its requires are owned", () => {
        expect(eligibleUpgrades(survival(), "survival", crops, config)).not.toContain("peek")
        const owned = survival({ upgrades: [own("coins")] })
        expect(eligibleUpgrades(owned, "survival", crops, config)).toContain("peek")
    })

    it("drops an id with no valid targets, and an untargeted id whose stats are capped", () => {
        const plots = survival().plots.length
        const allPlots = Array.from({ length: plots }, (_, i) => own("guard", "common", i))
        const capped = [own("grow", "legendary"), own("grow", "common")]
        const state = survival({ upgrades: [...allPlots, ...capped] })
        const ids = eligibleUpgrades(state, "survival", crops, config)
        expect(ids).not.toContain("guard")
        expect(ids).not.toContain("grow")
    })
})

describe("rollOffer", () => {
    const state = survival()

    it("gives UPGRADE_CHOICES cards with different ids, two draws each, from rng.upgrades", () => {
        const [offer, after] = rollOffer(state, "survival", crops, config)
        expect(offer).toHaveLength(UPGRADE_CHOICES)
        expect(new Set(offer.map((c) => c.id)).size).toBe(UPGRADE_CHOICES)
        const eligible = eligibleUpgrades(state, "survival", crops, config)
        for (const card of offer) expect(eligible).toContain(card.id)
        expect(after).toBe(advance(state.rng.upgrades, 2 * UPGRADE_CHOICES))
    })

    it("gives the same offer from the same state", () => {
        expect(rollOffer(state, "survival", crops, config)).toEqual(
            rollOffer(state, "survival", crops, config)
        )
    })

    it("varies with the stream", () => {
        const offers = new Set(
            [1, 2, 3, 4, 5, 6, 7, 8].map((s) => {
                const s2 = { ...state, rng: { ...state.rng, upgrades: seedStream(s, 1) } }
                return JSON.stringify(rollOffer(s2, "survival", crops, config)[0])
            })
        )
        expect(offers.size).toBeGreaterThan(1)
    })

    it("gives a non-tiered upgrade only at its own tier", () => {
        for (let s = 0; s < 100; s++) {
            const s2 = { ...state, rng: { ...state.rng, upgrades: seedStream(s, 1) } }
            for (const card of rollOffer(s2, "shop", crops, config)[0]) {
                expect(card).toEqual({ id: "plot", tier: "rare" })
            }
        }
    })

    it("only rolls tiers with a weight above 0", () => {
        const raw = rawConfig() as { tiers: Record<Tier, { weight: number }> }
        for (const t of TIERS) raw.tiers[t].weight = t === "common" ? 1 : 0
        const commonOnly = validateUpgrades(raw)
        for (let s = 0; s < 30; s++) {
            const s2 = { ...state, rng: { ...state.rng, upgrades: seedStream(s, 1) } }
            for (const card of rollOffer(s2, "survival", crops, commonOnly)[0]) {
                expect(card.tier).toBe("common")
            }
        }
    })

    it("skips a tier with no candidates and still fills the offer", () => {
        // Only "plot" (rare) is in the shop pool, so every shop card must be rare.
        const [offer] = rollOffer(state, "shop", crops, config)
        expect(offer).toEqual([{ id: "plot", tier: "rare" }])
    })

    it("rolls tiers close to their weights over many seeds", () => {
        const counts: Record<Tier, number> = {
            common: 0,
            uncommon: 0,
            rare: 0,
            epic: 0,
            legendary: 0
        }
        const runs = 4000
        for (let s = 0; s < runs; s++) {
            const s2 = { ...state, rng: { ...state.rng, upgrades: seedStream(s, 1) } }
            counts[rollOffer(s2, "timed", crops, config)[0][0].tier] += 1
        }
        const total = TIERS.reduce((sum, t) => sum + config.tiers[t].weight, 0)
        for (const t of TIERS) {
            expect(Math.abs(counts[t] / runs - config.tiers[t].weight / total)).toBeLessThan(0.04)
        }
    })

    it("offers fewer cards when fewer ids are eligible", () => {
        const [offer, after] = rollOffer(state, "timed", crops, config)
        expect(offer.map((c) => c.id)).toEqual(["coins"])
        expect(after).toBe(advance(state.rng.upgrades, 2))
    })

    it("offers nothing and leaves the stream alone when nothing is eligible", () => {
        const full = survival({ upgrades: [own("coins"), own("coins")] })
        expect(rollOffer(full, "timed", crops, config)).toEqual([[], full.rng.upgrades])
    })
})
