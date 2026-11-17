// Landing page: logo, a seed field and a Play button. A blank seed picks one at random.
import { Scene, GameObjects } from "phaser"
import { parseSeed, MAX_SEED } from "../format"
import { COLORS, TEXT, addBackground } from "../theme"

const FIELD_W = 360
const FIELD_H = 64
const BUTTON_W = 240
const BUTTON_H = 80

export class MainMenu extends Scene {
    private seedField: HTMLInputElement
    private error: GameObjects.Text

    constructor() {
        super("MainMenu")
    }

    create() {
        addBackground(this)
        const { centerX, centerY } = this.cameras.main

        this.add.image(centerX, centerY - 300, "logo")

        this.add.text(centerX, centerY - 110, "Seed (optional)", TEXT.title).setOrigin(0.5)

        // A real <input> so typing, pasting and mobile keyboards work as expected.
        this.seedField = document.createElement("input")
        this.seedField.type = "text"
        this.seedField.inputMode = "numeric"
        this.seedField.placeholder = "random"
        this.seedField.maxLength = String(MAX_SEED).length
        this.seedField.setAttribute("aria-label", "Seed")
        Object.assign(this.seedField.style, {
            width: `${FIELD_W}px`,
            height: `${FIELD_H}px`,
            boxSizing: "border-box",
            padding: "0 16px",
            fontSize: "28px",
            fontFamily: "Arial",
            textAlign: "center",
            border: "3px solid #5a3e1b",
            borderRadius: "8px",
            background: "#fff4d6",
            color: "#222222"
        })
        this.seedField.addEventListener("keydown", (e) => {
            if (e.key === "Enter") this.play()
        })
        this.add.dom(centerX, centerY - 50, this.seedField)

        this.error = this.add
            .text(centerX, centerY + 10, "", {
                ...TEXT.title,
                color: "#ffffff",
                stroke: "#a3140c",
                strokeThickness: 5,
                fontSize: 18
            })
            .setOrigin(0.5)

        const button = this.add
            .rectangle(centerX, centerY + 100, BUTTON_W, BUTTON_H, COLORS.button)
            .setStrokeStyle(3, COLORS.cardStroke)
            .setInteractive({ useHandCursor: true })
            .on("pointerover", () => button.setFillStyle(COLORS.buttonHover))
            .on("pointerout", () => button.setFillStyle(COLORS.button))
            .on("pointerdown", () => this.play())
        this.add
            .text(centerX, centerY + 100, "Play", { ...TEXT.label, fontSize: 36 })
            .setOrigin(0.5)
    }

    private play(): void {
        const parsed = parseSeed(this.seedField.value)
        if (parsed === null) {
            this.error.setText(`Seed must be a whole number from 0 to ${MAX_SEED}`)
            return
        }
        const seed = parsed ?? Math.floor(Math.random() * (MAX_SEED + 1))
        this.scene.start("Game", { seed })
    }
}
