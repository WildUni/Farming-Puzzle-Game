// Barn panel under the power-up bar: the storage bar (red when full), one button per crop to
// choose what to sell or compost, an amount box with - and + buttons, Sell, Sell all, Make
// fertilizer, and Fertilize (which starts choosing a plot). Hidden while the board is covered
// (upgrade offer, pause, end of run). Reports moves through callbacks. See specs/ui.md.
import { GameObjects, Scene } from "phaser"
import type { CropTable, GameState } from "../../sim/types"
import { fertilizerAllowed, fertilizerTargets } from "../../sim/economy"
import {
    barnCropText,
    fertilizeText,
    isStorageFull,
    makeFertilizerText,
    sellAmount,
    sellButtonText,
    storageFill,
    storageText
} from "../format"
import { COLORS, MARGIN, TEXT } from "../theme"

const BAR_Y = 1035 // centre of the storage bar
const BAR_H = 26
const ROW1_Y = 1095 // crop buttons and Make fertilizer
const ROW2_Y = 1160 // amount, Sell, Sell all, Fertilize
const ROW_H = 52
const GAP = 10
const CROP_W = 130
const STEP_W = 50 // - and + buttons
const INPUT_W = 70
const SELL_W = 150
const SELL_ALL_W = 110
const MAKE_W = 200
const FERTILIZE_W = 160

type Callbacks = {
    sell: (cropId: string, amount: number) => void
    makeFertilizer: (cropId: string) => void
    fertilize: () => void // start (or cancel) choosing a plot
}

type Button = { box: GameObjects.Rectangle; label: GameObjects.Text; enabled: boolean }

export class BarnView {
    private scene: Scene
    private crops: CropTable
    private ids: string[]
    private selected: string
    private state: GameState | null = null

    private barFill: GameObjects.Rectangle
    private barLabel: GameObjects.Text
    private cropButtons: Button[]
    private minus: Button
    private plus: Button
    private sellButton: Button
    private sellAllButton: Button
    private makeButton: Button
    private fertilizeButton: Button
    private input: HTMLInputElement
    private inputObject: GameObjects.DOMElement
    private barWidth: number

    constructor(scene: Scene, crops: CropTable, on: Callbacks) {
        this.scene = scene
        this.crops = crops
        this.ids = Object.keys(crops).sort()
        this.selected = this.ids[0]
        const { width } = scene.scale
        this.barWidth = width - 2 * MARGIN

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

        // Row 1: crop buttons on the left, Make fertilizer on the right.
        this.cropButtons = this.ids.map((id, i) =>
            this.button(MARGIN + CROP_W / 2 + i * (CROP_W + GAP), ROW1_Y, CROP_W, () => {
                this.selected = id
                this.input.value = "1"
                this.refresh()
            })
        )
        this.makeButton = this.button(width - MARGIN - MAKE_W / 2, ROW1_Y, MAKE_W, () =>
            on.makeFertilizer(this.selected)
        )

        // Row 2: - [amount] +, Sell, Sell all, then Fertilize on the right.
        let x = MARGIN
        this.minus = this.button(x + STEP_W / 2, ROW2_Y, STEP_W, () => this.nudge(-1))
        x += STEP_W + GAP
        this.input = document.createElement("input")
        this.input.type = "text"
        this.input.inputMode = "numeric"
        this.input.value = "1"
        this.input.setAttribute("aria-label", "Amount to sell")
        Object.assign(this.input.style, {
            width: `${INPUT_W}px`,
            height: `${ROW_H - 8}px`,
            boxSizing: "border-box",
            fontSize: "22px",
            fontFamily: "Arial",
            textAlign: "center",
            border: "2px solid #5a3e1b",
            borderRadius: "6px",
            background: "#fff4d6",
            color: "#222222"
        })
        // Keys typed here mustn't reach the game's shortcuts (R restarts, P pauses).
        this.input.addEventListener("keydown", (e) => e.stopPropagation())
        this.input.addEventListener("input", () => this.refresh())
        this.inputObject = scene.add.dom(x + INPUT_W / 2, ROW2_Y, this.input)
        x += INPUT_W + GAP
        this.plus = this.button(x + STEP_W / 2, ROW2_Y, STEP_W, () => this.nudge(1))
        x += STEP_W + GAP
        this.sellButton = this.button(x + SELL_W / 2, ROW2_Y, SELL_W, () =>
            on.sell(this.selected, this.amount())
        )
        x += SELL_W + GAP
        this.sellAllButton = this.button(x + SELL_ALL_W / 2, ROW2_Y, SELL_ALL_W, () =>
            on.sell(this.selected, this.held())
        )
        this.sellAllButton.label.setText("Sell all")
        this.fertilizeButton = this.button(
            width - MARGIN - FERTILIZE_W / 2,
            ROW2_Y,
            FERTILIZE_W,
            () => on.fertilize()
        )
    }

    // `usable` is false while the board is covered; `fertilizing` while a plot is being chosen.
    update(state: GameState, usable: boolean, fertilizing: boolean): void {
        this.state = state
        this.inputObject.setVisible(usable)
        this.input.disabled = !usable
        this.barFill.width = this.barWidth * storageFill(state)
        this.barFill.setFillStyle(isStorageFull(state) ? COLORS.barUrgent : COLORS.barFill)
        this.barLabel.setText(
            isStorageFull(state) ? `${storageText(state)}  FULL` : storageText(state)
        )
        this.refresh(usable, fertilizing)
    }

    private usable = true
    private fertilizing = false

    private refresh(usable = this.usable, fertilizing = this.fertilizing): void {
        this.usable = usable
        this.fertilizing = fertilizing
        const state = this.state
        if (state === null) return
        const crop = this.crops[this.selected]
        const held = this.held()
        const amount = this.amount()
        const fertilizer = fertilizerAllowed(state)

        this.cropButtons.forEach((b, i) => {
            const id = this.ids[i]
            b.label.setText(barnCropText(id, state))
            b.enabled = usable
            this.paint(b, id === this.selected ? COLORS.highlight : COLORS.cardStroke)
        })
        this.minus.label.setText("-")
        this.plus.label.setText("+")
        this.minus.enabled = usable && amount > 1
        this.plus.enabled = usable && amount < held
        this.sellButton.label.setText(sellButtonText(state, crop, amount))
        this.sellButton.enabled = usable && held >= amount && held > 0
        this.sellAllButton.enabled = usable && held > 0
        this.makeButton.label.setText(makeFertilizerText(crop, fertilizer))
        this.makeButton.enabled = usable && fertilizer && held >= crop.fertilizerCost
        this.fertilizeButton.label.setText(fertilizing ? "Cancel" : fertilizeText(state))
        this.fertilizeButton.enabled =
            usable &&
            fertilizer &&
            (fertilizing || (state.fertilizer > 0 && fertilizerTargets(state).length > 0))
        for (const b of [
            this.minus,
            this.plus,
            this.sellButton,
            this.sellAllButton,
            this.makeButton,
            this.fertilizeButton
        ]) {
            this.paint(
                b,
                b === this.fertilizeButton && fertilizing ? COLORS.highlight : COLORS.cardStroke
            )
        }
    }

    private held(): number {
        return this.state?.inventory[this.selected] ?? 0
    }

    private amount(): number {
        return sellAmount(this.input.value, this.held())
    }

    private nudge(by: number): void {
        this.input.value = String(sellAmount(String(this.amount() + by), this.held()))
        this.refresh()
    }

    private button(x: number, y: number, w: number, onClick: () => void): Button {
        const b: Button = {
            enabled: false,
            box: this.scene.add
                .rectangle(x, y, w, ROW_H, COLORS.button)
                .setInteractive({ useHandCursor: true }),
            label: this.scene.add
                .text(x, y, "", { ...TEXT.label, fontSize: 16, wordWrap: { width: w - 8 } })
                .setOrigin(0.5)
        }
        b.box
            .on("pointerover", () => b.enabled && b.box.setFillStyle(COLORS.buttonHover))
            .on("pointerout", () => this.paint(b))
            .on("pointerdown", () => b.enabled && onClick())
        return b
    }

    private paint(b: Button, stroke: number = COLORS.cardStroke): void {
        b.box.setFillStyle(b.enabled ? COLORS.button : COLORS.buttonDisabled)
        b.box.setStrokeStyle(stroke === COLORS.highlight ? 4 : 2, stroke)
        b.label.setAlpha(b.enabled ? 1 : 0.6)
        b.box.input!.cursor = b.enabled ? "pointer" : "default"
    }
}
