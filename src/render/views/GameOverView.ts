// Plain game-over panel: a shade over the board, the run's summary and a Restart button.
// The shade swallows clicks so the finished board can't be used.
import { GameObjects, Scene } from "phaser"
import type { GameState } from "../../sim/types"
import { gameOverText } from "../format"
import { COLORS, TEXT } from "../theme"

const PANEL_W = 460
const PANEL_H = 420
const BUTTON_W = 240
const BUTTON_H = 72
const DEPTH = 300 // above the pause shade and the plant picker

export class GameOverView {
    private root: GameObjects.Container
    private shade: GameObjects.Rectangle
    private summary: GameObjects.Text

    constructor(scene: Scene, onRestart: () => void) {
        const { width, height } = scene.scale

        this.shade = scene.add
            .rectangle(0, 0, width, height, COLORS.shade, 0.6)
            .setOrigin(0)
            .setDepth(DEPTH)
            .setInteractive()

        const panel = scene.add
            .rectangle(0, 0, PANEL_W, PANEL_H, COLORS.card)
            .setStrokeStyle(4, COLORS.cardStroke)
        const title = scene.add
            .text(0, -PANEL_H / 2 + 50, "Game over", { ...TEXT.label, fontSize: 48 })
            .setOrigin(0.5)
        this.summary = scene.add
            .text(0, -20, "", { ...TEXT.body, fontSize: 26, align: "center", lineSpacing: 8 })
            .setOrigin(0.5)

        const buttonY = PANEL_H / 2 - 30 - BUTTON_H / 2
        const button = scene.add
            .rectangle(0, buttonY, BUTTON_W, BUTTON_H, COLORS.button)
            .setStrokeStyle(3, COLORS.cardStroke)
            .setInteractive({ useHandCursor: true })
            .on("pointerover", () => button.setFillStyle(COLORS.buttonHover))
            .on("pointerout", () => button.setFillStyle(COLORS.button))
            .on("pointerdown", onRestart)
        const label = scene.add
            .text(0, buttonY, "Restart", { ...TEXT.label, fontSize: 32 })
            .setOrigin(0.5)

        this.root = scene.add
            .container(width / 2, height / 2, [panel, title, this.summary, button, label])
            .setDepth(DEPTH + 1)

        this.update(null)
    }

    // Shows the panel for an ended run; hides it otherwise.
    update(state: GameState | null): void {
        const visible = state !== null && state.status === "ended"
        this.root.setVisible(visible)
        this.shade.setVisible(visible)
        this.shade.input!.enabled = visible
        if (visible) this.summary.setText(gameOverText(state))
    }
}
