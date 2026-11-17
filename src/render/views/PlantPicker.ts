// Panel of crop buttons shown below the plots after an empty plot is clicked.
// Clicking a crop calls onPick; clicking anywhere outside the panel calls onCancel.
import { GameObjects, Scene } from "phaser"
import type { CropTable } from "../../sim/types"
import { cropButtonText } from "../format"
import { MARGIN, COLORS, TEXT } from "../theme"

const BUTTON_W = 140
const BUTTON_H = 64
const BUTTON_GAP = 12
const PAD = 14
const TITLE_H = 30
const DEPTH = 100 // above the board
const BOTTOM_CLEARANCE = 70 // keeps the panel clear of the debug overlay

export class PlantPicker {
    private root: GameObjects.Container
    private backdrop: GameObjects.Zone
    private title: GameObjects.Text

    constructor(
        scene: Scene,
        crops: CropTable,
        onPick: (cropId: string) => void,
        onCancel: () => void
    ) {
        const { width, height } = scene.scale

        // Invisible full-screen catcher behind the panel: a click here closes the picker.
        this.backdrop = scene.add
            .zone(0, 0, width, height)
            .setOrigin(0)
            .setDepth(DEPTH)
            .setInteractive()
            .on("pointerdown", onCancel)

        const ids = Object.keys(crops).sort()
        const panelW = PAD * 2 + ids.length * BUTTON_W + (ids.length - 1) * BUTTON_GAP
        const panelH = PAD * 2 + TITLE_H + BUTTON_H

        // Interactive so clicks on the panel's gaps don't fall through to the backdrop.
        const panel = scene.add
            .rectangle(0, 0, panelW, panelH, COLORS.card)
            .setOrigin(0)
            .setStrokeStyle(2, COLORS.cardStroke)
            .setInteractive()
        this.title = scene.add.text(PAD, PAD, "", { ...TEXT.body, fontStyle: "bold" })

        const buttons = ids.flatMap((id, i) => {
            const x = PAD + i * (BUTTON_W + BUTTON_GAP)
            const y = PAD + TITLE_H
            const box = scene.add
                .rectangle(x, y, BUTTON_W, BUTTON_H, COLORS.button)
                .setOrigin(0)
                .setInteractive({ useHandCursor: true })
                .on("pointerover", () => box.setFillStyle(COLORS.buttonHover))
                .on("pointerout", () => box.setFillStyle(COLORS.button))
                .on("pointerdown", () => onPick(id))
            const label = scene.add
                .text(x + BUTTON_W / 2, y + BUTTON_H / 2, cropButtonText(crops[id]), TEXT.label)
                .setOrigin(0.5)
            return [box, label]
        })

        this.root = scene.add
            .container((width - panelW) / 2, height - MARGIN - BOTTOM_CLEARANCE - panelH, [
                panel,
                this.title,
                ...buttons
            ])
            .setDepth(DEPTH + 1)

        this.hide()
    }

    get isOpen(): boolean {
        return this.root.visible
    }

    show(plot: number): void {
        this.title.setText(`Plant in plot ${plot + 1}`)
        this.root.setVisible(true)
        this.backdrop.setVisible(true)
        this.backdrop.input!.enabled = true
    }

    hide(): void {
        this.root.setVisible(false)
        this.backdrop.setVisible(false)
        this.backdrop.input!.enabled = false
    }
}
