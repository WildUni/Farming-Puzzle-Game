// Local saves: high score per mode and the sound setting, kept in localStorage under one key.
// No Phaser here, so it can be unit tested. Every storage call is wrapped in try/catch:
// localStorage can be missing, blocked (private browsing, some iframes) or full, and the
// game must still run with in-memory values when it is. See specs/saves.md.
import type { GameMode } from "../sim/types"

// The part of the Web Storage API the saves use; tests pass a fake.
type KeyValueStore = {
    getItem(key: string): string | null
    setItem(key: string, value: string): void
}

type SaveData = {
    highScores: Partial<Record<GameMode, number>>
    soundOn: boolean
}

const SAVE_KEY = "farming-puzzle-game/save"
const SAVE_VERSION = 1

const MODES: readonly GameMode[] = ["survival", "timed", "puzzle"]

function defaultSave(): SaveData {
    return { highScores: {}, soundOn: true }
}

// The browser's localStorage, or null when it can't be reached (reading the property
// itself throws in some sandboxed pages).
function browserStore(): KeyValueStore | null {
    try {
        return typeof localStorage === "undefined" ? null : localStorage
    } catch {
        return null
    }
}

// Reads the save. A missing store, missing key, bad JSON or wrong version gives the
// defaults; a field with a bad value falls back on its own, keeping the rest.
function loadSave(store: KeyValueStore | null): SaveData {
    const save = defaultSave()
    if (store === null) return save
    let raw: unknown
    try {
        const text = store.getItem(SAVE_KEY)
        if (text === null) return save
        raw = JSON.parse(text)
    } catch {
        return save
    }
    if (typeof raw !== "object" || raw === null) return save
    const data = raw as Record<string, unknown>
    if (data.version !== SAVE_VERSION) return save

    if (typeof data.soundOn === "boolean") save.soundOn = data.soundOn
    const scores = data.highScores
    if (typeof scores === "object" && scores !== null) {
        for (const mode of MODES) {
            const value = (scores as Record<string, unknown>)[mode]
            if (typeof value === "number" && Number.isInteger(value) && value >= 0) {
                save.highScores[mode] = value
            }
        }
    }
    return save
}

// Writes the save. Returns false when it couldn't be written (no store, blocked or full).
function writeSave(store: KeyValueStore | null, save: SaveData): boolean {
    if (store === null) return false
    try {
        store.setItem(SAVE_KEY, JSON.stringify({ version: SAVE_VERSION, ...save }))
        return true
    } catch {
        return false
    }
}

// A finished run's score against the mode's best. It is a new best when it is above 0 and
// beats the old best (none counts as 0). Returns a new save; the input is not changed.
function recordScore(
    save: SaveData,
    mode: GameMode,
    score: number
): { save: SaveData; best: number; newBest: boolean } {
    const old = save.highScores[mode] ?? 0
    if (score <= old) return { save, best: old, newBest: false }
    return {
        save: { ...save, highScores: { ...save.highScores, [mode]: score } },
        best: score,
        newBest: true
    }
}

function setSoundOn(save: SaveData, soundOn: boolean): SaveData {
    return { ...save, soundOn }
}

export type { KeyValueStore, SaveData }
export { SAVE_KEY, SAVE_VERSION, defaultSave, browserStore, loadSave, writeSave }
export { recordScore, setSoundOn }
