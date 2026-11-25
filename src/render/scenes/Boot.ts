import { Scene } from "phaser"
import { buildCropTable } from "../../sim/plot"
import cropList from "../../data/crops.json"
import { initSave } from "../saves"

export class Boot extends Scene {
    constructor() {
        super("Boot")
    }

    preload() {
        this.load.image("background", "assets/bg.png")
    }

    // Loads the game config and the local save once and shares them through the registry,
    // so every scene reads the same crop table and save.
    create() {
        this.registry.set("crops", buildCropTable(cropList))
        initSave(this)
        this.scene.start("Preloader")
    }
}
