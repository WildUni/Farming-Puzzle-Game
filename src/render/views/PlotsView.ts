// Near-square grid of plot squares centered on the screen. Reports clicks by plot index.
// Growing plots show a progress bar; ready plots and the selected plot are outlined.
import { GameObjects, Scene } from "phaser"
import type { GameState } from "../../sim/types"
import { progress } from "../../sim/plot"
import { isFogged, plotOverlays, plotText } from "../format"
import type { PlotOverlay } from "../format"
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
    tint: GameObjects.Rectangle // see-through colour over the plot (frost, sun)
    marks: GameObjects.Text // short words for event markers along the top
}

export class PlotsView {
    private scene: Scene
    private onClick: (plot: number) => void
    private squares: Square[] = []

    constructor(scene: Scene, onClick: (plot: number) => void) {
        this.scene = scene
        this.onClick = onClick
    }

    // `selected` is the plot the plant picker is open for, or null. `targets` lists the plots a
    // power-up can be used on while the player is choosing one (the rest are dimmed), else null.
    update(state: GameState, selected: number | null, targets: number[] | null = null): void {
        if (this.squares.length !== state.plots.length) this.build(state.plots.length)

        const overlays = plotOverlays(state)
        const fog = isFogged(state)
        state.plots.forEach((plot, i) => {
            const { box, label, track, bar, tint, marks } = this.squares[i]
            const here = overlays[i]
            box.setFillStyle(COLORS.plot[plot.state])
            const isTarget = targets !== null && targets.includes(i)
            const lit = targets === null ? plot.state === "ready" || i === selected : isTarget
            if (here.includes("target")) box.setStrokeStyle(5, COLORS.eventTarget)
            else if (lit) box.setStrokeStyle(4, COLORS.highlight)
            else box.setStrokeStyle(2, COLORS.plotStroke)
            const tinted = here.includes("frozen") || here.includes("fast")
            tint.setVisible(tinted)
            if (tinted) {
                tint.setFillStyle(
                    here.includes("frozen") ? COLORS.frozenTint : COLORS.sunnyTint,
                    0.35
                )
            }
            marks.setText(
                here
                    .filter((m) => m !== "target")
                    .map(markText)
                    .join(" ")
            )
            const alpha = targets !== null && !isTarget ? 0.45 : 1
            for (const part of [box, label, track, bar, tint, marks]) part.setAlpha(alpha)
            label.setText(plotText(plot, state.tick, fog))
            // Fog hides how far along a crop is.
            const growing = plot.state === "growing" && !fog
            track.setVisible(growing)
            bar.setVisible(growing)
            if (growing) bar.width = BAR_W * progress(plot, state.tick)
        })
    }

    // Lays out `count` squares. Rebuilt whenever the plot count changes.
    private build(count: number): void {
        this.squares.forEach((s) => {
            for (const part of [s.box, s.label, s.track, s.bar, s.tint, s.marks]) part.destroy()
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
            // The tint sits over the box but lets clicks through to it.
            const tint = this.scene.add.rectangle(x, y, SIZE, SIZE, COLORS.frozenTint, 0.35)
            const marks = this.scene.add
                .text(x, y - SIZE / 2 + 6, "", { ...TEXT.label, fontSize: 14 })
                .setOrigin(0.5, 0)
            return { box, label, track, bar, tint, marks }
        })
    }
}

// Word shown on a plot for each marker. The target is drawn as a red outline instead.
function markText(mark: PlotOverlay): string {
    switch (mark) {
        case "blocked":
            return "CROWS"
        case "frozen":
            return "FROST"
        case "fast":
            return "SUN"
        case "worms":
            return "WORMS"
        case "shield":
            return "SAFE"
        case "fertilized":
            return "FERT"
        case "clover":
            return "CLOVER"
        case "target":
            return ""
    }
}
