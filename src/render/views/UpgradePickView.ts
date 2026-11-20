// Upgrade pick screen: a shade over the board, a title and one card per offered upgrade.
// Shown while state.upgradeOffer is set; the shade swallows clicks so the board can't be used.
import { GameObjects, Scene } from "phaser"
import type { GameState } from "../../sim/types"
import { UPGRADES } from "../../sim/upgrades"
import { upgradeCardText } from "../format"
import { COLORS, TEXT } from "../theme"

const CARD_W = 200
const CARD_H = 260
const CARD_GAP = 20
const DEPTH = 150 // above the plant picker, below the pause shade and game over

type Card = { box: GameObjects.Rectangle; label: GameObjects.Text }

export class UpgradePickView {
    private scene: Scene
    private onPick: (upgradeId: string) => void
    private shade: GameObjects.Rectangle
    private title: GameObjects.Text
    private cards: Card[] = []
    private shown: readonly string[] | null = null // the offer the cards were built for

    constructor(scene: Scene, onPick: (upgradeId: string) => void) {
        this.scene = scene
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
        if (offer !== this.shown) this.build(offer, state?.upgrades ?? [])
    }

    // Rebuilds the cards whenever a different offer opens (or the offer closes).
    private build(offer: readonly string[] | null, upgrades: readonly string[]): void {
        this.cards.forEach(({ box, label }) => {
            box.destroy()
            label.destroy()
        })
        this.cards = []
        this.shown = offer
        if (offer === null) return

        const { width, height } = this.scene.scale
        const step = CARD_W + CARD_GAP
        const x0 = width / 2 - ((offer.length - 1) * step) / 2
        this.cards = offer.map((id, i) => {
            const x = x0 + i * step
            const box = this.scene.add
                .rectangle(x, height / 2, CARD_W, CARD_H, COLORS.card)
                .setStrokeStyle(4, COLORS.cardStroke)
                .setDepth(DEPTH + 1)
                .setInteractive({ useHandCursor: true })
                .on("pointerover", () => box.setStrokeStyle(4, COLORS.ready))
                .on("pointerout", () => box.setStrokeStyle(4, COLORS.cardStroke))
                .on("pointerdown", () => this.onPick(id))
            const label = this.scene.add
                .text(x, height / 2, upgradeCardText(UPGRADES[id], upgrades), {
                    ...TEXT.body,
                    fontSize: 22,
                    align: "center",
                    lineSpacing: 10,
                    wordWrap: { width: CARD_W - 24 }
                })
                .setOrigin(0.5)
                .setDepth(DEPTH + 2)
            return { box, label }
        })
    }
}
