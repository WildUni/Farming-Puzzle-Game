// Upgrade pick screen: a shade over the board, a title and one card per offered card.
// Shown while state.upgradeOffer is set; the shade swallows clicks so the board can't be used.
// A targeted card opens a second step with one button per valid target and a Back button.
import { GameObjects, Scene } from "phaser"
import type { CropTable, GameState, OfferCard, UpgradeTarget } from "../../sim/types"
import { UPGRADES, validTargets } from "../../sim/upgrades"
import { targetText, targetTitle, upgradeCardText } from "../format"
import { COLORS, TEXT } from "../theme"

const CARD_W = 200
const CARD_H = 260
const CARD_GAP = 20
const STROKE = 6
const BUTTON_W = 160
const BUTTON_H = 60
const BUTTON_GAP = 14
const DEPTH = 150 // above the plant picker, below the pause shade and game over

type OnPick = (upgradeId: string, target: UpgradeTarget) => void

export class UpgradePickView {
    private scene: Scene
    private crops: CropTable
    private onPick: OnPick
    private shade: GameObjects.Rectangle
    private title: GameObjects.Text
    private parts: GameObjects.GameObject[] = [] // everything below the title, rebuilt per screen
    private shown: readonly OfferCard[] | null = null // the offer the screen was built for

    constructor(scene: Scene, crops: CropTable, onPick: OnPick) {
        this.scene = scene
        this.crops = crops
        this.onPick = onPick
        const { width, height } = scene.scale

        this.shade = scene.add
            .rectangle(0, 0, width, height, COLORS.shade, 0.6)
            .setOrigin(0)
            .setDepth(DEPTH)
            .setInteractive()
        this.title = scene.add
            .text(width / 2, height / 2 - CARD_H / 2 - 60, "Choose an upgrade", {
                ...TEXT.label,
                fontSize: 40
            })
            .setOrigin(0.5)
            .setDepth(DEPTH + 1)

        this.update(null)
    }

    // Shows the cards for an open offer; hides everything otherwise.
    update(state: GameState | null): void {
        const offer = state?.status === "running" ? state.upgradeOffer : null
        const visible = offer !== null
        this.shade.setVisible(visible)
        this.shade.input!.enabled = visible
        this.title.setVisible(visible)
        if (offer !== this.shown) {
            this.shown = offer
            if (state !== null && offer !== null) this.showCards(state, offer)
            else this.clear()
        }
    }

    private clear(): void {
        this.parts.forEach((p) => p.destroy())
        this.parts = []
    }

    // Step 1: one card per offered upgrade, framed in its tier's colour.
    private showCards(state: GameState, offer: readonly OfferCard[]): void {
        this.clear()
        this.title.setText("Choose an upgrade")
        const { width, height } = this.scene.scale
        const step = CARD_W + CARD_GAP
        const x0 = width / 2 - ((offer.length - 1) * step) / 2
        offer.forEach((card, i) => {
            const def = UPGRADES.upgrades[card.id]
            const frame = COLORS.tier[card.tier]
            const x = x0 + i * step
            const box = this.scene.add
                .rectangle(x, height / 2, CARD_W, CARD_H, COLORS.card)
                .setStrokeStyle(STROKE, frame)
                .setDepth(DEPTH + 1)
                .setInteractive({ useHandCursor: true })
                .on("pointerover", () => box.setStrokeStyle(STROKE, COLORS.highlight))
                .on("pointerout", () => box.setStrokeStyle(STROKE, frame))
                .on("pointerdown", () => {
                    if (def.target === null) this.onPick(card.id, null)
                    else this.showTargets(state, offer, card)
                })
            const label = this.scene.add
                .text(x, height / 2, upgradeCardText(def, card.tier, state.upgrades), {
                    ...TEXT.body,
                    fontSize: 22,
                    align: "center",
                    lineSpacing: 10,
                    wordWrap: { width: CARD_W - 24 }
                })
                .setOrigin(0.5)
                .setDepth(DEPTH + 2)
            this.parts.push(box, label)
        })
    }

    // Step 2 for a targeted card: one button per valid target, then Back.
    private showTargets(state: GameState, offer: readonly OfferCard[], card: OfferCard): void {
        this.clear()
        const def = UPGRADES.upgrades[card.id]
        this.title.setText(targetTitle(def))
        const targets = validTargets(state.upgrades, card.id, state.plots.length, this.crops)
        const { width, height } = this.scene.scale
        const step = BUTTON_W + BUTTON_GAP
        const x0 = width / 2 - ((targets.length - 1) * step) / 2
        targets.forEach((target, i) => {
            this.addButton(x0 + i * step, height / 2, targetText(target), () =>
                this.onPick(card.id, target)
            )
        })
        this.addButton(width / 2, height / 2 + BUTTON_H + 40, "Back", () =>
            this.showCards(state, offer)
        )
    }

    private addButton(x: number, y: number, text: string, onClick: () => void): void {
        const box = this.scene.add
            .rectangle(x, y, BUTTON_W, BUTTON_H, COLORS.button)
            .setDepth(DEPTH + 1)
            .setInteractive({ useHandCursor: true })
            .on("pointerover", () => box.setFillStyle(COLORS.buttonHover))
            .on("pointerout", () => box.setFillStyle(COLORS.button))
            .on("pointerdown", onClick)
        const label = this.scene.add
            .text(x, y, text, TEXT.label)
            .setOrigin(0.5)
            .setDepth(DEPTH + 2)
        this.parts.push(box, label)
    }
}
