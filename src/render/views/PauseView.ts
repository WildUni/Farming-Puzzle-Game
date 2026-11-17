// Pause/Resume button plus the shade that covers the board while paused.
// The shade swallows clicks so nothing can be planted, harvested or delivered while paused.
import { GameObjects, Scene } from "phaser"
import { COLORS, TEXT } from "../theme"

const BUTTON_W = 200
const BUTTON_H = 56
const DEPTH = 200 // above the plant picker

export class PauseView {
    private shade: GameObjects.Rectangle
    private banner: GameObjects.Text
    private label: GameObjects.Text

    // (right, top) is the button's top-right corner.
    constructor(scene: Scene, right: number, top: number, onToggle: () => void) {
        const { width, height } = scene.scale

        this.shade = scene.add
            .rectangle(0, 0, width, height, COLORS.shade, 0.5)
            .setOrigin(0)
            .setDepth(DEPTH)
            .setInteractive()
        this.banner = scene.add
            .text(width / 2, height / 2, "Paused", { ...TEXT.label, fontSize: 64 })
            .setOrigin(0.5)
            .setDepth(DEPTH)

        const box = scene.add
            .rectangle(right - BUTTON_W, top, BUTTON_W, BUTTON_H, COLORS.button)
            .setOrigin(0)
            .setStrokeStyle(2, COLORS.cardStroke)
            .setDepth(DEPTH + 1)
            .setInteractive({ useHandCursor: true })
            .on("pointerover", () => box.setFillStyle(COLORS.buttonHover))
            .on("pointerout", () => box.setFillStyle(COLORS.button))
            .on("pointerdown", onToggle)
        this.label = scene.add
            .text(right - BUTTON_W / 2, top + BUTTON_H / 2, "", TEXT.label)
            .setOrigin(0.5)
            .setDepth(DEPTH + 1)

        this.update(false)
    }

    update(paused: boolean): void {
        this.label.setText(paused ? "Resume" : "Pause")
        this.shade.setVisible(paused)
        this.shade.input!.enabled = paused
        this.banner.setVisible(paused)
    }
}
