import { Scene } from "phaser"
import { addBackground } from "../theme"

export class Preloader extends Scene {
    constructor() {
        super("Preloader")
    }

    init() {
        addBackground(this)
        const { centerX, centerY } = this.cameras.main

        //  A simple progress bar: an outline, and a fill that grows with the load progress.
        this.add.rectangle(centerX, centerY, 468, 32).setStrokeStyle(1, 0xffffff)
        const bar = this.add.rectangle(centerX - 230, centerY, 4, 28, 0xffffff)
        this.load.on("progress", (progress: number) => {
            bar.width = 4 + 460 * progress
        })
    }

    preload() {
        this.load.setPath("assets")
        this.load.image("logo", "logo.png")
    }

    create() {
        this.scene.start("MainMenu")
    }
}
