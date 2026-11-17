// Near-square grid of plot squares centered on the screen. Reports clicks by plot index.
// Growing plots show a progress bar; ready plots and the selected plot are outlined.
import { GameObjects, Scene } from "phaser"
import type { GameState, CropTable } from "../../sim/types"
import { progress } from "../../sim/plot"
import { plotText } from "../format"
import { COLORS, TEXT } from "../theme"

const SIZE = 140
const GAP = 16
const CENTER_Y_OFFSET = 40 // nudged down to clear the orders and stats panels
const BAR_W = SIZE - 24
const BAR_H = 10
const BAR_INSET = 16 // gap from the bottom of the square to the bar

type Square = {
    box: GameObjects.Rectangle
    label: GameObjects.Text
    track: GameObjects.Rectangle // growth bar background
    bar: GameObjects.Rectangle // growth bar, fills as the crop grows
}

export class PlotsView {
    private scene: Scene
    private crops: CropTable
    private onClick: (plot: number) => void
    private squares: Square[] = []

    constructor(scene: Scene, crops: CropTable, onClick: (plot: number) => void) {
        this.scene = scene
        this.crops = crops
        this.onClick = onClick
    }

    // `selected` is the plot the plant picker is open for, or null.
    update(state: GameState, selected: number | null): void {
        if (this.squares.length !== state.plots.length) this.build(state.plots.length)

        state.plots.forEach((plot, i) => {
            const { box, label, track, bar } = this.squares[i]
            box.setFillStyle(COLORS.plot[plot.state])
            if (plot.state === "ready" || i === selected) box.setStrokeStyle(4, COLORS.highlight)
            else box.setStrokeStyle(2, COLORS.plotStroke)
            label.setText(plotText(plot, state.tick, this.crops))
            const growing = plot.state === "growing"
            track.setVisible(growing)
            bar.setVisible(growing)
            if (growing) bar.width = BAR_W * progress(plot, state.tick, this.crops)
        })
    }

    // Lays out `count` squares. Rebuilt whenever the plot count changes.
    private build(count: number): void {
        this.squares.forEach((s) => {
            for (const part of [s.box, s.label, s.track, s.bar]) part.destroy()
        })

        const cols = Math.ceil(Math.sqrt(count))
        const rows = Math.ceil(count / cols)
        const step = SIZE + GAP
        const x0 = this.scene.scale.width / 2 - ((cols - 1) * step) / 2
        const y0 = this.scene.scale.height / 2 + CENTER_Y_OFFSET - ((rows - 1) * step) / 2

        this.squares = Array.from({ length: count }, (_, i) => {
            const x = x0 + (i % cols) * step
            const y = y0 + Math.floor(i / cols) * step
            const box = this.scene.add
                .rectangle(x, y, SIZE, SIZE)
                .setInteractive({ useHandCursor: true })
                .on("pointerdown", () => this.onClick(i))
            const label = this.scene.add.text(x, y - 8, "", TEXT.label).setOrigin(0.5)
            const barX = x - BAR_W / 2
            const barY = y + SIZE / 2 - BAR_INSET - BAR_H
            const track = this.scene.add
                .rectangle(barX, barY, BAR_W, BAR_H, COLORS.barTrack)
                .setOrigin(0)
            const bar = this.scene.add
                .rectangle(barX, barY, BAR_W, BAR_H, COLORS.barFill)
                .setOrigin(0)
            return { box, label, track, bar }
        })
    }
}
