// Miracle grow button: shown once the upgrade is owned. Tapping it starts (or cancels) choosing a
// growing plot to finish; while it recharges it shows the time left and ignores clicks.
import { GameObjects, Scene } from "phaser"
import type { GameState } from "../../sim/types"
import { miracleTargets } from "../../sim/main"
import { modifiersFor } from "../../sim/upgrades"
import { miracleGrowText } from "../format"
import { COLORS, TEXT } from "../theme"

const BUTTON_W = 200
const BUTTON_H = 64

export class MiracleGrowView {
    private box: GameObjects.Rectangle
    private label: GameObjects.Text
    private enabled = false
    private choosing = false

    // (right, top) is the button's top-right corner.
    constructor(scene: Scene, right: number, top: number, onClick: () => void) {
        this.box = scene.add
            .rectangle(right - BUTTON_W, top, BUTTON_W, BUTTON_H, COLORS.powerUp)
            .setOrigin(0)
            .setStrokeStyle(2, COLORS.cardStroke)
            .setInteractive({ useHandCursor: true })
            .on("pointerover", () => this.enabled && this.box.setFillStyle(COLORS.powerUpHover))
            .on("pointerout", () => this.paint())
            .on("pointerdown", () => (this.enabled || this.choosing) && onClick())
        this.label = scene.add
            .text(right - BUTTON_W / 2, top + BUTTON_H / 2, "", { ...TEXT.label, fontSize: 18 })
            .setOrigin(0.5)
    }

    // `choosing`: the plot to finish is being picked.
    update(state: GameState, choosing: boolean): void {
        const visible = modifiersFor(state.upgrades).miracleGrow > 0
        this.box.setVisible(visible)
        this.label.setVisible(visible)
        this.box.input!.enabled = visible
        this.choosing = visible && choosing
        this.enabled = visible && miracleTargets(state).length > 0
        this.box.input!.cursor = this.enabled || this.choosing ? "pointer" : "default"
        if (visible) this.label.setText(this.choosing ? "Cancel" : miracleGrowText(state))
        this.paint()
    }

    private paint(): void {
        this.box.setFillStyle(this.enabled ? COLORS.powerUp : COLORS.buttonDisabled)
        this.box.setStrokeStyle(
            this.choosing ? 4 : 2,
            this.choosing ? COLORS.highlight : COLORS.cardStroke
        )
        this.label.setAlpha(this.enabled || this.choosing ? 1 : 0.6)
    }
}
