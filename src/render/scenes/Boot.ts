import { Scene } from "phaser"
import { buildCropTable } from "../../sim/plot"
import cropList from "../../data/crops.json"
import { initSave } from "../saves"
import loadingBg from "../../assets/PlotRush/Plot-Rush-Menu-Assets/loadingscreen/plot-rush-background.png"
import loadingTitle from "../../assets/PlotRush/Plot-Rush-Menu-Assets/loadingscreen/plot-rush-title.png"
import loadingPlot from "../../assets/PlotRush/Plot-Rush-Menu-Assets/loadingscreen/plot-rush-plot.png"
import loadingBar from "../../assets/PlotRush/Plot-Rush-Menu-Assets/loadingscreen/Empty Wooden Bar, Full Green Fill.png"

export class Boot extends Scene {
    constructor() {
        super("Boot")
    }

    // Only what the loading screen itself needs; everything else loads in Preloader.
    preload() {
        this.load.image("background", "assets/bg.png")
        this.load.image("loading-bg", loadingBg)
        this.load.image("loading-title", loadingTitle)
        this.load.image("loading-plot", loadingPlot)
        this.load.image("loading-bar", loadingBar)
    }

    // Loads the game config and the local save once and shares them through the registry,
    // so every scene reads the same crop table and save.
    create() {
        // The bar sheet holds the empty wooden frame above the green fill, on a transparent glow.
        const bar = this.textures.get("loading-bar")
        bar.add("frame", 0, 139, 278, 1258, 219)
        bar.add("fill", 0, 181, 644, 1174, 138)

        this.registry.set("crops", buildCropTable(cropList))
        initSave(this)
        this.scene.start("Preloader")
    }
}
