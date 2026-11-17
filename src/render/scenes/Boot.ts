import { Scene } from "phaser"
import { buildCropTable } from "../../sim/plot"
import cropList from "../../data/crops.json"

export class Boot extends Scene {
    constructor() {
        super("Boot")
    }

    preload() {
        this.load.image("background", "assets/bg.png")
    }

    // Loads the game config once and shares it through the registry, so every scene
    // reads the same crop table.
    create() {
        this.registry.set("crops", buildCropTable(cropList))
        this.scene.start("Preloader")
    }
}
