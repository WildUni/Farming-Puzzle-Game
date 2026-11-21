import { describe, it, expect } from "vitest"
import {
    validatePowerUps,
    POWER_UPS,
    dropTable,
    rollDrop,
    powerUpTargets,
    canUsePowerUp,
    durationFor
} from "./powerups"
import { createGame, applyAction } from "./main"
import { buildCropTable } from "./plot"
import { nextValue } from "./mulberry"
import { TICKS_PER_SECOND } from "./game_constants"
import { UPGRADES, scalePct } from "./upgrades"
import rawPowerUps from "../data/powerups.json"
import type { GameState, OwnedUpgrade, Plot, PowerUpConfig } from "./types"

const crops = buildCropTable([{ id: "garlic", growTicks: 80, yield: 2, value: 2 }])

// A small config of our own, so these tests don't depend on the shipped numbers.
function rawConfig(): Record<string, unknown> {
    return {
        powerUps: [
            {
                id: "ready",
                name: "Ready",
                text: "Ready now",
                modes: ["survival", "timed"],
                weight: 1,
                target: "plot",
                effect: { kind: "finishGrowth" }
            },
            {
                id: "freeze",
                name: "Freeze",
                text: "Stop for {seconds} s",
                modes: ["survival", "timed"],
                weight: 3,
                seconds: 4,
                effect: { kind: "orderRate", pct: 0 }
            },
            {
                id: "coins",
                name: "Coins",
                text: "+5 coins",
                modes: ["survival"],
                weight: 2,
                effect: { kind: "grantCoins", amount: 5 }
            }
        ]
    }
}

const config: PowerUpConfig = validatePowerUps(rawConfig())

function state(overrides: Partial<GameState> = {}): GameState {
    return {
        ...createGame(1, { mode: "survival", allowPowerUps: true, allowEvents: false }),
        ...overrides
    }
}

// Upgrades that set dropChance to exactly `pct` on top of the shipped base.
function withDropChance(pct: number): OwnedUpgrade[] {
    const base = UPGRADES.stats.dropChance.base
    if (pct === base) return []
    // luckyDrops legendary is +12; stack copies until we pass pct, then rely on the stat cap.
    const copies = Math.ceil((pct - base) / 12)
    return Array.from({ length: copies }, () => ({
        id: "luckyDrops",
        tier: "legendary" as const,
        target: null
    }))
}

function advance(rng: number, draws: number): number {
    let r = rng
    for (let i = 0; i < draws; i++) r = nextValue(r)[1]
    return r
}

describe("validatePowerUps", () => {
    it("accepts the shipped powerups.json", () => {
        expect(() => validatePowerUps(rawPowerUps)).not.toThrow()
        expect(Object.keys(POWER_UPS.powerUps).sort()).toEqual([
            "coinBag",
            "growthBoost",
            "orderFreeze",
            "readyOne"
        ])
    })

    it("turns seconds into durationTicks and a missing target into null", () => {
        expect(config.powerUps.freeze.durationTicks).toBe(4 * TICKS_PER_SECOND)
        expect(config.powerUps.freeze.target).toBeNull()
        expect(config.powerUps.coins.durationTicks).toBeNull()
        expect(config.powerUps.ready.target).toBe("plot")
    })

    type Raw = { powerUps: Record<string, unknown>[] }
    const bad: [string, (r: Raw) => void][] = [
        ["no powerUps list", (r) => ((r as unknown as Record<string, unknown>).powerUps = [])],
        ["an empty id", (r) => (r.powerUps[0].id = "")],
        ["a repeated id", (r) => (r.powerUps[1].id = "ready")],
        ["a missing name", (r) => delete r.powerUps[0].name],
        ["a missing text", (r) => delete r.powerUps[0].text],
        ["empty modes", (r) => (r.powerUps[0].modes = [])],
        ["a repeated mode", (r) => (r.powerUps[0].modes = ["timed", "timed"])],
        ["an unknown mode", (r) => (r.powerUps[0].modes = ["puzzle"])],
        ["a weight of 0", (r) => (r.powerUps[0].weight = 0)],
        ["a fractional weight", (r) => (r.powerUps[0].weight = 1.5)],
        ["an unknown effect kind", (r) => (r.powerUps[2].effect = { kind: "explode" })],
        ["an event-only effect kind", (r) => (r.powerUps[2].effect = { kind: "blockHarvest" })],
        ["a rate of 100", (r) => (r.powerUps[1].effect = { kind: "orderRate", pct: 100 })],
        ["a negative rate", (r) => (r.powerUps[1].effect = { kind: "orderRate", pct: -1 })],
        ["a cut of 0 ticks", (r) => (r.powerUps[2].effect = { kind: "cutGrowth", ticks: 0 })],
        ["0 coins", (r) => (r.powerUps[2].effect = { kind: "grantCoins", amount: 0 })],
        ["a lasting effect without seconds", (r) => delete r.powerUps[1].seconds],
        ["seconds on an instant effect", (r) => (r.powerUps[2].seconds = 3)],
        ["seconds of 0", (r) => (r.powerUps[1].seconds = 0)],
        ["an unknown target", (r) => (r.powerUps[0].target = "crop")],
        ["finishGrowth without a target", (r) => delete r.powerUps[0].target],
        ["a target on another effect", (r) => (r.powerUps[2].target = "plot")],
        ["{seconds} on an instant power-up", (r) => (r.powerUps[2].text = "{seconds}")]
    ]
    for (const [name, change] of bad) {
        it(`throws for ${name}`, () => {
            const raw = rawConfig() as Raw
            change(raw)
            expect(() => validatePowerUps(raw)).toThrow()
        })
    }
})

describe("dropTable", () => {
    it("lists the mode's ids, sorted; Coin bag is Survival only", () => {
        expect(dropTable("survival")).toEqual(["coinBag", "growthBoost", "orderFreeze", "readyOne"])
        expect(dropTable("timed")).toEqual(["growthBoost", "orderFreeze", "readyOne"])
        expect(dropTable("survival", config)).toEqual(["coins", "freeze", "ready"])
    })
})

describe("rollDrop", () => {
    it("draws nothing with power-ups off, at 0% chance, or with nothing to drop", () => {
        const off = state({ allowPowerUps: false, allowEvents: false })
        expect(rollDrop(off)).toEqual([null, off.rng.drops])
        const one: PowerUpConfig = { powerUps: { coins: config.powerUps.coins } }
        const timed = {
            ...createGame(1, { mode: "timed", allowPowerUps: true, allowEvents: false })
        }
        expect(rollDrop(timed, one)).toEqual([null, timed.rng.drops])
    })

    it("uses one draw on a miss and two on a hit", () => {
        let misses = 0
        let hits = 0
        for (let seed = 0; seed < 200; seed++) {
            const s = {
                ...createGame(seed, { mode: "survival", allowPowerUps: true, allowEvents: false })
            }
            const [drop, rng] = rollDrop(s)
            if (drop === null) {
                misses++
                expect(rng).toBe(advance(s.rng.drops, 1))
            } else {
                hits++
                expect(rng).toBe(advance(s.rng.drops, 2))
            }
        }
        expect(misses).toBeGreaterThan(0)
        expect(hits).toBeGreaterThan(0)
    })

    it("every hit in a one-item config is that item", () => {
        const one: PowerUpConfig = { powerUps: { freeze: config.powerUps.freeze } }
        const drops = Array.from({ length: 200 }, (_, seed) => {
            const s = createGame(seed, {
                mode: "survival",
                allowPowerUps: true,
                allowEvents: false
            })
            return rollDrop(s, one)[0]
        })
        expect(drops).toContain("freeze")
        expect(drops.every((d) => d === null || d === "freeze")).toBe(true)
    })

    it("drops close to dropChance, split close to the weights", () => {
        const upgrades = withDropChance(UPGRADES.stats.dropChance.max)
        const chance = UPGRADES.stats.dropChance.max
        const counts: Record<string, number> = { ready: 0, freeze: 0, coins: 0 }
        let drops = 0
        const n = 4000
        let s = state({ upgrades })
        for (let i = 0; i < n; i++) {
            const [drop, rng] = rollDrop(s, config)
            s = { ...s, rng: { ...s.rng, drops: rng } }
            if (drop !== null) {
                drops++
                counts[drop]++
            }
        }
        expect(drops / n).toBeGreaterThan(chance / 100 - 0.05)
        expect(drops / n).toBeLessThan(chance / 100 + 0.05)
        expect(counts.freeze / drops).toBeGreaterThan(0.4) // weight 3 of 6
        expect(counts.freeze / drops).toBeLessThan(0.6)
        expect(counts.ready / drops).toBeGreaterThan(0.1) // weight 1 of 6
        expect(counts.ready / drops).toBeLessThan(0.25)
    })
})

describe("powerUpTargets / canUsePowerUp", () => {
    const plots: Plot[] = [
        { state: "empty" },
        { state: "growing", cropId: "garlic", plantedAt: 0, readyAt: 80 },
        { state: "ready", cropId: "garlic" },
        { state: "growing", cropId: "garlic", plantedAt: 0, readyAt: 80 }
    ]

    it("Ready one targets only growing plots, in order; others and bad slots give []", () => {
        const s = state({ plots, powerUps: ["readyOne", "orderFreeze"] })
        expect(powerUpTargets(s, 0)).toEqual([1, 3])
        expect(powerUpTargets(s, 1)).toEqual([])
        expect(powerUpTargets(s, 2)).toEqual([])
        expect(powerUpTargets(s, -1)).toEqual([])
    })

    it("agrees with applyAction in every case", () => {
        const s = state({ plots, powerUps: ["readyOne", "orderFreeze"] })
        const cases: [GameState, number, number | null][] = [
            [s, 0, 1],
            [s, 0, 0],
            [s, 0, 2],
            [s, 0, null],
            [s, 1, null],
            [s, 1, 1],
            [s, 2, null],
            [s, 0.5, null],
            [{ ...s, allowPowerUps: false, allowEvents: false }, 1, null],
            [{ ...s, status: "ended" }, 1, null],
            [{ ...s, upgradeOffer: [{ id: "bigTips", tier: "common" }] }, 1, null]
        ]
        for (const [st, slot, target] of cases) {
            const action =
                target === null
                    ? ({ type: "usePowerUp", slot } as const)
                    : ({ type: "usePowerUp", slot, target } as const)
            const result = applyAction(st, action, crops)
            expect(canUsePowerUp(st, slot, target)).toBe(result !== null)
        }
        expect(canUsePowerUp(s, 0, 1)).toBe(true)
        expect(canUsePowerUp(s, 1, null)).toBe(true)
    })
})

describe("durationFor", () => {
    it("scales lasting power-ups by powerUpDurationPct and is null for instant ones", () => {
        const freeze = POWER_UPS.powerUps.orderFreeze
        expect(durationFor(freeze, [])).toBe(freeze.durationTicks)
        const upgrades: OwnedUpgrade[] = [{ id: "longLasting", tier: "legendary", target: null }]
        expect(durationFor(freeze, upgrades)).toBe(scalePct(freeze.durationTicks!, 150))
        expect(durationFor(POWER_UPS.powerUps.coinBag, [])).toBeNull()
    })
})
