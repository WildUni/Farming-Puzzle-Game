// Buy-life button for Survival, showing the next life's price.
// Grayed out and ignores clicks when the player can't afford a life.
import { GameObjects, Scene } from "phaser"
import type { GameState } from "../../sim/types"
import { canBuyLife } from "../../sim/main"
import { buyLifeText } from "../format"
import { COLORS, TEXT } from "../theme"

const BUTTON_W = 200
const BUTTON_H = 64

export class BuyLifeView {
    private box: GameObjects.Rectangle
    private label: GameObjects.Text
    private enabled = false

    // (right, top) is the button's top-right corner.
    constructor(scene: Scene, right: number, top: number, onBuy: () => void) {
        this.box = scene.add
            .rectangle(right - BUTTON_W, top, BUTTON_W, BUTTON_H, COLORS.button)
            .setOrigin(0)
            .setStrokeStyle(2, COLORS.cardStroke)
            .setInteractive({ useHandCursor: true })
            .on("pointerover", () => this.enabled && this.box.setFillStyle(COLORS.buttonHover))
            .on("pointerout", () => this.paint())
            .on("pointerdown", () => this.enabled && onBuy())
        this.label = scene.add
            .text(right - BUTTON_W / 2, top + BUTTON_H / 2, "", { ...TEXT.label, fontSize: 18 })
            .setOrigin(0.5)
    }

    get bottom(): number {
        return this.box.y + BUTTON_H
    }

    update(state: GameState): void {
        const visible = state.mode === "survival"
        this.box.setVisible(visible)
        this.label.setVisible(visible)
        this.enabled = visible && canBuyLife(state)
        this.box.input!.enabled = visible
        this.box.input!.cursor = this.enabled ? "pointer" : "default"
        if (visible) this.label.setText(buyLifeText(state))
        this.paint()
    }

    private paint(): void {
        this.box.setFillStyle(this.enabled ? COLORS.button : COLORS.buttonDisabled)
        this.label.setAlpha(this.enabled ? 1 : 0.6)
    }
}
