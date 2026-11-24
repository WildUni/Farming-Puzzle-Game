import { describe, it, expect } from "vitest"
import { debugEvent, debugUpgrade, debugPowerUp, debugFreeRestock, upgradeTiers } from "./debug"
import { EVENTS, buildEvent } from "./events"
import { createGame, step } from "./main"
import { buildCropTable } from "./plot"
import { START_PLOTS, TIERS } from "./game_constants"
import type { GameConfig, GameState, Plot } from "./types"

const crops = buildCropTable([
    { id: "garlic", growTicks: 80, yield: 2, value: 2, fertilizerCost: 4 },
    { id: "pumpkin", growTicks: 250, yield: 5, value: 12, fertilizerCost: 1 }
])

const all: GameConfig = { mode: "survival", allowPowerUps: true, allowEvents: true }
const none: GameConfig = { mode: "survival", allowPowerUps: false, allowEvents: false }

const ready: Plot = { state: "ready", cropId: "garlic" }
const growing: Plot = { state: "growing", cropId: "pumpkin", plantedAt: 0, readyAt: 5000 }

function game(overrides: Partial<GameState> = {}, config: GameConfig = all): GameState {
    return { ...createGame(1, config), tick: 40, ...overrides }
}

const noPlot = { plot: null, skipWarning: false }

describe("debugEvent", () => {
    it("announces each shipped event exactly as buildEvent does", () => {
        const s = game({ plots: [ready, ready, ready, ready] })
        for (const def of Object.values(EVENTS.events)) {
            const plot = def.target === "plot" ? 2 : null
            const next = debugEvent(s, def.id, { plot, skipWarning: false })!
            expect(next.event).toEqual(buildEvent(s, def, plot))
        }
    })

    it("replaces an event already announced", () => {
        const first = debugEvent(game(), "frost", noPlot)!
        expect(debugEvent(first, "crows", noPlot)!.event!.id).toBe("crows")
    })

    it("skipWarning starts the event on the next step", () => {
        const s = debugEvent(game({ plots: [growing] }), "frost", {
            plot: null,
            skipWarning: true
        })!
        expect(s.event!.startsAt).toBe(41)
        expect(s.event!.endsAt - s.event!.startsAt).toBe(EVENTS.events.frost.durationTicks)
        const next = step(s, crops)
        expect(next.activeEffects.map((a) => a.source)).toEqual(["frost"])
    })

    it("needs a valid plot for Moles and none for other events", () => {
        const s = game({ plots: [ready, { state: "empty" }, growing, ready] })
        expect(debugEvent(s, "moles", { plot: 0, skipWarning: false })).not.toBeNull()
        expect(debugEvent(s, "moles", { plot: 1, skipWarning: false })).toBeNull()
        expect(debugEvent(s, "moles", { plot: 9, skipWarning: false })).toBeNull()
        expect(debugEvent(s, "moles", noPlot)).toBeNull()
        expect(debugEvent(s, "frost", { plot: 0, skipWarning: false })).toBeNull()
    })

    it("refuses with events off, an unknown id, or an ended run; allows Generous customer in Timed", () => {
        expect(debugEvent(game({}, none), "frost", noPlot)).toBeNull()
        expect(debugEvent(game(), "hail", noPlot)).toBeNull()
        const timed = { ...createGame(1, { ...all, mode: "timed" }) }
        expect(debugEvent(timed, "generousCustomer", noPlot)).not.toBeNull()
        expect(debugEvent(game({ status: "ended" }), "frost", noPlot)).toBeNull()
    })

    it("leaves every stream and nextEventAt alone", () => {
        const s = game()
        const next = debugEvent(s, "frost", noPlot)!
        expect(next.rng).toEqual(s.rng)
        expect(next.nextEventAt).toBe(s.nextEventAt)
    })
})

describe("debugUpgrade", () => {
    it("adds the copy at the tier; a non-tiered upgrade only at its own", () => {
        const next = debugUpgrade(game(), "fastGrowth", "epic", null, crops)!
        expect(next.upgrades).toEqual([{ id: "fastGrowth", tier: "epic", target: null }])
        expect(upgradeTiers("fastGrowth")).toEqual(TIERS)
        expect(upgradeTiers("bigPockets")).toEqual(["rare"])
        expect(debugUpgrade(game(), "bigPockets", "common", null, crops)).toBeNull()
        expect(debugUpgrade(game(), "bigPockets", "rare", null, crops)).not.toBeNull()
    })

    it("ignores maxCopies and pools, but checks targets", () => {
        const owned = game({ upgrades: [{ id: "bigPockets", tier: "rare", target: null }] })
        expect(debugUpgrade(owned, "bigPockets", "rare", null, crops)!.upgrades).toHaveLength(2)
        const timed = createGame(1, { ...all, mode: "timed" })
        expect(debugUpgrade(timed, "lifeDiscount", "common", null, crops)).not.toBeNull()
        expect(debugUpgrade(game(), "greenhouse", "epic", 1, crops)!.upgrades[0].target).toBe(1)
        expect(debugUpgrade(game(), "greenhouse", "epic", null, crops)).toBeNull()
        expect(debugUpgrade(game(), "greenhouse", "epic", 99, crops)).toBeNull()
        expect(debugUpgrade(game(), "fastGrowth", "common", 1, crops)).toBeNull()
    })

    it("Extra plot adds a plot", () => {
        const next = debugUpgrade(game(), "extraPlot", "rare", null, crops)!
        expect(next.plots).toHaveLength(START_PLOTS + 1)
    })

    it("refuses an unknown id and an ended run", () => {
        expect(debugUpgrade(game(), "wings", "common", null, crops)).toBeNull()
        expect(
            debugUpgrade(game({ status: "ended" }), "fastGrowth", "common", null, crops)
        ).toBeNull()
    })
})

describe("debugPowerUp", () => {
    it("appends the power-up, ignoring its modes", () => {
        const timed = createGame(1, { ...all, mode: "timed" })
        expect(debugPowerUp(timed, "coinBag")!.powerUps).toEqual(["coinBag"])
    })

    it("refuses with full slots, power-ups off, an unknown id or an ended run", () => {
        expect(debugPowerUp(game({ powerUps: ["coinBag", "coinBag"] }), "readyOne")).toBeNull()
        expect(debugPowerUp(game({}, none), "readyOne")).toBeNull()
        expect(debugPowerUp(game(), "jetpack")).toBeNull()
        expect(debugPowerUp(game({ status: "ended" }), "readyOne")).toBeNull()
    })
})

describe("debugFreeRestock", () => {
    it("banks one free restock up to the cap, and refuses after the end and in Puzzle", () => {
        const one = debugFreeRestock(game())!
        expect(one.shop.freeRestocks).toBe(1)
        expect(one.shop.open).toBe(false)
        const two = debugFreeRestock(one)!
        expect(two.shop.freeRestocks).toBe(2)
        expect(debugFreeRestock(two)).toBeNull()
        expect(debugFreeRestock(game({ status: "ended" }))).toBeNull()
        expect(debugFreeRestock(game({}, { ...none, mode: "puzzle" }))).toBeNull()
    })

    it("never adds an instant upgrade as a copy", () => {
        expect(debugUpgrade(game(), "promotion", "epic", null, crops)).toBeNull()
    })
})
