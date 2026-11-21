// Row of power-up slot buttons under the plots, plus a line listing running effects.
// Hidden when power-ups are off. Reports clicks by slot index.
import { GameObjects, Scene } from "phaser"
import type { GameState } from "../../sim/types"
import { modifiersFor } from "../../sim/upgrades"
import { POWER_UPS, canUsePowerUp, powerUpTargets } from "../../sim/powerups"
import { activeEffectText, powerUpButtonText, shownEffects } from "../format"
import { COLORS, TEXT } from "../theme"

const BUTTON_W = 200
const BUTTON_H = 84
const BUTTON_GAP = 14
const TOP = 900 // below the plot grid
const EFFECTS_GAP = 14 // between the buttons and the effects line

type Slot = { box: GameObjects.Rectangle; label: GameObjects.Text; enabled: boolean }

export class PowerUpBar {
    private scene: Scene
    private onClick: (slot: number) => void
    private slots: Slot[] = []
    private effects: GameObjects.Text

    constructor(scene: Scene, onClick: (slot: number) => void) {
        this.scene = scene
        this.onClick = onClick
        this.effects = scene.add
            .text(scene.scale.width / 2, TOP + BUTTON_H + EFFECTS_GAP, "", TEXT.title)
            .setOrigin(0.5, 0)
    }

    // `choosing` is the slot whose plot target is being picked, or null.
    update(state: GameState, choosing: number | null): void {
        const visible = state.allowPowerUps
        const count = modifiersFor(state.upgrades).powerUpSlots
        if (this.slots.length !== count) this.build(count)

        this.slots.forEach((slot, i) => {
            slot.box.setVisible(visible)
            slot.label.setVisible(visible)
            if (!visible) return
            const id = state.powerUps[i]
            if (id === undefined) {
                slot.enabled = false
                slot.label.setText("")
            } else {
                const def = POWER_UPS.powerUps[id]
                slot.label.setText(powerUpButtonText(def, state.upgrades))
                const targets = def.target !== null ? powerUpTargets(state, i) : []
                slot.enabled =
                    def.target !== null
                        ? targets.some((t) => canUsePowerUp(state, i, t))
                        : canUsePowerUp(state, i, null)
            }
            const held = id !== undefined
            slot.box.setFillStyle(
                !held ? COLORS.slotEmpty : slot.enabled ? COLORS.powerUp : COLORS.buttonDisabled
            )
            slot.box.setStrokeStyle(
                i === choosing ? 4 : 2,
                i === choosing ? COLORS.highlight : COLORS.cardStroke
            )
            slot.label.setAlpha(slot.enabled ? 1 : 0.6)
            slot.box.input!.cursor = slot.enabled ? "pointer" : "default"
        })

        const lines = shownEffects(state).map((a) => activeEffectText(a, state.tick))
        this.effects.setVisible(visible && lines.length > 0)
        this.effects.setText(lines.join("   "))
    }

    // Lays out `count` slot buttons centered under the plots. Rebuilt when the count changes.
    private build(count: number): void {
        this.slots.forEach((s) => {
            s.box.destroy()
            s.label.destroy()
        })
        const step = BUTTON_W + BUTTON_GAP
        const x0 = this.scene.scale.width / 2 - ((count - 1) * step) / 2
        this.slots = Array.from({ length: count }, (_, i) => {
            const x = x0 + i * step
            const slot: Slot = {
                enabled: false,
                box: this.scene.add
                    .rectangle(x, TOP + BUTTON_H / 2, BUTTON_W, BUTTON_H, COLORS.slotEmpty)
                    .setInteractive({ useHandCursor: true }),
                label: this.scene.add
                    .text(x, TOP + BUTTON_H / 2, "", {
                        ...TEXT.label,
                        fontSize: 15,
                        wordWrap: { width: BUTTON_W - 16 }
                    })
                    .setOrigin(0.5)
            }
            slot.box
                .on("pointerover", () => slot.enabled && slot.box.setFillStyle(COLORS.powerUpHover))
                .on("pointerout", () => slot.enabled && slot.box.setFillStyle(COLORS.powerUp))
                .on("pointerdown", () => slot.enabled && this.onClick(i))
            return slot
        })
    }
}
