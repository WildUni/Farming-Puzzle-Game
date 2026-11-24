// Drawer along the bottom of the play screen; it never pauses the clock. A tab on its top edge
// folds it down to just the storage bar (red and FULL when full) and opens it again. Open, it
// also holds Fertilize, which starts (or cancels) choosing a plot. Selling crops and making
// fertilizer live in the shop page's Storage section. See specs/ui.md.
import { GameObjects, Scene } from "phaser"
import type { GameState } from "../../sim/types"
import { fertilizerAllowed, fertilizerTargets } from "../../sim/economy"
import { fertilizeText, isStorageFull, storageFill, storageText } from "../format"
import { COLORS, MARGIN, TEXT } from "../theme"
import { Button } from "./Button"

const TAB_Y = 1094 // the fold tab on the drawer's top edge
const TAB_W = 90
const TAB_H = 26
const BAR_Y = 1124 // centre of the storage bar
const BAR_H = 26
const ROW_Y = 1176 // Fertilize, shown while the drawer is open
const ROW_H = 52
const FERTILIZE_W = 200

export class DrawerView {
    private open = true
    private state: GameState | null = null
    private usable = false
    private fertilizing = false

    private panel: GameObjects.Rectangle
    private tab: Button
    private barFill: GameObjects.Rectangle
    private barLabel: GameObjects.Text
    private barWidth: number
    private fertilizeButton: Button

    constructor(scene: Scene, onFertilize: () => void) {
        const { width } = scene.scale
        this.barWidth = width - 2 * MARGIN
        this.panel = scene.add
            .rectangle(0, TAB_Y + TAB_H / 2, width, ROW_Y + ROW_H / 2 + 10 - TAB_Y, COLORS.barTrack)
            .setOrigin(0, 0)
            .setAlpha(0.35)
        this.tab = new Button(scene, width / 2, TAB_Y, TAB_W, TAB_H, "", () => this.toggle(), {
            fontSize: 14
        })
        scene.add
            .rectangle(MARGIN, BAR_Y, this.barWidth, BAR_H, COLORS.barTrack)
            .setOrigin(0, 0.5)
            .setStrokeStyle(2, COLORS.cardStroke)
        this.barFill = scene.add
            .rectangle(MARGIN, BAR_Y, this.barWidth, BAR_H, COLORS.barFill)
            .setOrigin(0, 0.5)
        this.barLabel = scene.add
            .text(width / 2, BAR_Y, "", { ...TEXT.label, fontSize: 18 })
            .setOrigin(0.5)
        this.fertilizeButton = new Button(
            scene,
            width / 2,
            ROW_Y,
            FERTILIZE_W,
            ROW_H,
            "",
            onFertilize,
            { fontSize: 16 }
        )
    }

    get isOpen(): boolean {
        return this.open
    }

    // `usable` is false while paused, while an upgrade offer or the shop page is open, and after
    // the run ends; `fertilizing` while a plot is being chosen.
    update(state: GameState, usable: boolean, fertilizing: boolean): void {
        this.state = state
        this.usable = usable
        this.fertilizing = fertilizing
        this.refresh()
    }

    private toggle(): void {
        this.open = !this.open
        this.refresh()
    }

    private refresh(): void {
        const state = this.state
        if (state === null) return
        const full = isStorageFull(state)
        this.barFill.width = this.barWidth * storageFill(state)
        this.barFill.setFillStyle(full ? COLORS.barUrgent : COLORS.barFill)
        this.barLabel.setText(full ? `${storageText(state)}  FULL` : storageText(state))

        this.tab.setText(this.open ? "▼ Fold" : "▲ Open").setEnabled(true)
        this.panel.setVisible(this.open)
        this.fertilizeButton.setVisible(this.open)
        const canFertilize = state.fertilizer > 0 && fertilizerTargets(state).length > 0
        this.fertilizeButton
            .setText(this.fertilizing ? "Cancel" : fertilizeText(state))
            .setSelected(this.fertilizing)
            .setEnabled(
                this.usable && fertilizerAllowed(state) && (this.fertilizing || canFertilize)
            )
    }
}
