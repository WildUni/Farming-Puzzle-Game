import { Scene } from "phaser"
import { addBackground } from "../theme"

export class GameOver extends Scene {
    constructor() {
        super("GameOver")
    }

    create() {
        this.cameras.main.setBackgroundColor(0xff0000)
        addBackground(this).setAlpha(0.5)

        const { centerX, centerY } = this.cameras.main
        this.add
            .text(centerX, centerY, "Game Over", {
                fontFamily: "Arial Black",
                fontSize: 64,
                color: "#ffffff",
                stroke: "#000000",
                strokeThickness: 8,
                align: "center"
            })
            .setOrigin(0.5)

        this.input.once("pointerdown", () => {
            this.scene.start("MainMenu")
        })
    }
}
