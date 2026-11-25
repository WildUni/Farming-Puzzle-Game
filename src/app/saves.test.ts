import { describe, it, expect } from "vitest"
import {
    SAVE_KEY,
    SAVE_VERSION,
    defaultSave,
    loadSave,
    writeSave,
    recordScore,
    setSoundOn
} from "./saves"
import type { KeyValueStore } from "./saves"

function memoryStore(initial: Record<string, string> = {}): KeyValueStore & {
    data: Record<string, string>
} {
    const data = { ...initial }
    return {
        data,
        getItem: (key) => (key in data ? data[key] : null),
        setItem: (key, value) => {
            data[key] = value
        }
    }
}

const throwingStore: KeyValueStore = {
    getItem: () => {
        throw new Error("blocked")
    },
    setItem: () => {
        throw new Error("quota")
    }
}

describe("loadSave", () => {
    it("gives the defaults with no store, no key, bad JSON or a thrown read", () => {
        expect(loadSave(null)).toEqual(defaultSave())
        expect(loadSave(memoryStore())).toEqual(defaultSave())
        expect(loadSave(memoryStore({ [SAVE_KEY]: "{not json" }))).toEqual(defaultSave())
        expect(loadSave(throwingStore)).toEqual(defaultSave())
    })

    it("defaults to no high scores and sound on", () => {
        expect(defaultSave()).toEqual({ highScores: {}, soundOn: true })
    })

    it("ignores a save from another version", () => {
        const text = JSON.stringify({ version: 99, highScores: { timed: 5 }, soundOn: false })
        expect(loadSave(memoryStore({ [SAVE_KEY]: text }))).toEqual(defaultSave())
    })

    it("drops bad fields and keeps the good ones", () => {
        const text = JSON.stringify({
            version: SAVE_VERSION,
            highScores: { survival: 120, timed: -4, puzzle: "x", other: 9 },
            soundOn: "no"
        })
        expect(loadSave(memoryStore({ [SAVE_KEY]: text }))).toEqual({
            highScores: { survival: 120 },
            soundOn: true
        })
    })
})

describe("writeSave", () => {
    it("round-trips through loadSave", () => {
        const store = memoryStore()
        const save = { highScores: { survival: 300, timed: 45 }, soundOn: false }
        expect(writeSave(store, save)).toBe(true)
        expect(loadSave(store)).toEqual(save)
    })

    it("returns false with no store or a thrown write", () => {
        expect(writeSave(null, defaultSave())).toBe(false)
        expect(writeSave(throwingStore, defaultSave())).toBe(false)
    })
})

describe("recordScore", () => {
    it("is a new best when it beats the old one, and keeps the other modes", () => {
        const save = { highScores: { survival: 100, timed: 50 }, soundOn: true }
        const result = recordScore(save, "survival", 150)
        expect(result).toEqual({
            save: { highScores: { survival: 150, timed: 50 }, soundOn: true },
            best: 150,
            newBest: true
        })
        expect(save.highScores.survival).toBe(100) // input unchanged
    })

    it("is not a new best when it ties or loses", () => {
        const save = { highScores: { survival: 100 }, soundOn: true }
        expect(recordScore(save, "survival", 100)).toEqual({ save, best: 100, newBest: false })
        expect(recordScore(save, "survival", 20)).toEqual({ save, best: 100, newBest: false })
    })

    it("counts a missing best as 0, so a first run scoring 0 is not a new best", () => {
        expect(recordScore(defaultSave(), "timed", 0).newBest).toBe(false)
        expect(recordScore(defaultSave(), "timed", 1)).toMatchObject({ best: 1, newBest: true })
    })
})

describe("setSoundOn", () => {
    it("returns a new save with the setting changed", () => {
        const save = defaultSave()
        expect(setSoundOn(save, false)).toEqual({ highScores: {}, soundOn: false })
        expect(save.soundOn).toBe(true)
    })
})
