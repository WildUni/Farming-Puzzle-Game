// The save shared by every scene: loaded once in Boot and kept in the registry, so a write
// that fails (storage blocked or full) still keeps the values for this session.
import type { Scene } from "phaser"
import { browserStore, loadSave, writeSave } from "../app/saves"
import type { SaveData } from "../app/saves"

const REGISTRY_KEY = "save"

// Reads the stored save into the registry and applies the sound setting. Called by Boot.
function initSave(scene: Scene): void {
    const save = loadSave(browserStore())
    scene.registry.set(REGISTRY_KEY, save)
    scene.sound.mute = !save.soundOn
}

function getSave(scene: Scene): SaveData {
    return scene.registry.get(REGISTRY_KEY) as SaveData
}

// Keeps the new save for this session, writes it to storage, and applies the sound setting.
function putSave(scene: Scene, save: SaveData): void {
    scene.registry.set(REGISTRY_KEY, save)
    writeSave(browserStore(), save)
    scene.sound.mute = !save.soundOn
}

export { initSave, getSave, putSave }
