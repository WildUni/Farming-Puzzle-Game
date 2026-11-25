// End-of-run panel: a shade over the board, a title and summary for the mode, the high-score line,
// and Restart / Menu buttons. The shade swallows clicks so the finished board can't be used.
import { GameObjects, Scene } from "phaser"
import type { GameState } from "../../sim/types"
import { gameOverText, gameOverTitle } from "../format"
import { COLORS, TEXT } from "../theme"

const PANEL_W = 480
const PANEL_H = 570 // room for the score breakdown, the run's stats and the best line (up to 9)
const BUTTON_W = 190
const BUTTON_H = 72
const BUTTON_GAP = 24
const DEPTH = 300 // above the pause shade and the plant picker

export class GameOverView {
    private root: GameObjects.Container
    private shade: GameObjects.Rectangle
    private title: GameObjects.Text
    private summary: GameObjects.Text

    constructor(scene: Scene, onRestart: () => void, onMenu: () => void) {
        const { width, height } = scene.scale

        this.shade = scene.add
            .rectangle(0, 0, width, height, COLORS.shade, 0.6)
            .setOrigin(0)
            .setDepth(DEPTH)
            .setInteractive()

        const panel = scene.add
            .rectangle(0, 0, PANEL_W, PANEL_H, COLORS.card)
            .setStrokeStyle(4, COLORS.cardStroke)
        this.title = scene.add
            .text(0, -PANEL_H / 2 + 50, "", { ...TEXT.label, fontSize: 48 })
            .setOrigin(0.5)
        this.summary = scene.add
            .text(0, -20, "", { ...TEXT.body, fontSize: 26, align: "center", lineSpacing: 8 })
            .setOrigin(0.5)

        const buttonY = PANEL_H / 2 - 30 - BUTTON_H / 2
        const offset = (BUTTON_W + BUTTON_GAP) / 2
        const buttons = [
            ...this.makeButton(scene, -offset, buttonY, "Restart", onRestart),
            ...this.makeButton(scene, offset, buttonY, "Menu", onMenu)
        ]

        this.root = scene.add
            .container(width / 2, height / 2, [panel, this.title, this.summary, ...buttons])
            .setDepth(DEPTH + 1)

        this.update(null)
    }

    // Shows the panel for an ended run, with `bestLine` (bestScoreText) under the summary;
    // hides it otherwise.
    update(state: GameState | null, bestLine = ""): void {
        const visible = state !== null && state.status === "ended"
        this.root.setVisible(visible)
        this.shade.setVisible(visible)
        this.shade.input!.enabled = visible
        if (!visible) return
        this.title.setText(gameOverTitle(state))
        this.summary.setText(
            bestLine === ""
                ? gameOverText(state)
                : `${gameOverText(state)}
${bestLine}`
        )
    }

    private makeButton(
        scene: Scene,
        x: number,
        y: number,
        text: string,
        onClick: () => void
    ): GameObjects.GameObject[] {
        const box = scene.add
            .rectangle(x, y, BUTTON_W, BUTTON_H, COLORS.button)
            .setStrokeStyle(3, COLORS.cardStroke)
            .setInteractive({ useHandCursor: true })
            .on("pointerover", () => box.setFillStyle(COLORS.buttonHover))
            .on("pointerout", () => box.setFillStyle(COLORS.button))
            .on("pointerdown", onClick)
        const label = scene.add.text(x, y, text, { ...TEXT.label, fontSize: 32 }).setOrigin(0.5)
        return [box, label]
    }
}
