// Two-column stats and timer table in the top-right corner.
import { GameObjects, Scene } from "phaser"
import type { GameState, CropTable } from "../../sim/types"
import { statRows } from "../format"
import { lowTimePulse } from "../cues"
import { MARGIN, COLORS, TEXT } from "../theme"

const LABEL_W = 110
const VALUE_W = 90
const ROW_H = 30
const TIME_ROW = 1 // statRows: Mode, Time, Score, ...
const SCORE_ROW = 2
const TEXT_COLOR = TEXT.body.color as string
const URGENT_COLOR = "#d8342c"

type Row = { label: GameObjects.Text; value: GameObjects.Text }

export class StatsView {
    private scene: Scene
    private crops: CropTable
    private rows: Row[] = []
    private grid: GameObjects.Graphics

    constructor(scene: Scene, crops: CropTable) {
        this.scene = scene
        this.crops = crops
        this.grid = scene.add.graphics()
    }

    // Y coordinate just below the table, for laying out what goes under it.
    get bottom(): number {
        return MARGIN + this.rows.length * ROW_H
    }

    update(state: GameState): void {
        const rows = statRows(state, this.crops)
        if (this.rows.length !== rows.length) this.build(rows.length)
        rows.forEach(([label, value], i) => {
            this.rows[i].label.setText(label)
            this.rows[i].value.setText(value)
        })
        // Low time in Timed: the time value turns red and swells as each second starts.
        const time = this.rows[TIME_ROW].value
        const pulse = lowTimePulse(state)
        time.setColor(pulse === null ? TEXT_COLOR : URGENT_COLOR)
        time.setScale(pulse === null ? 1 : 1 + 0.35 * pulse * pulse)
    }

    // Centre of the Score value, where a floating score with no order card starts.
    get scorePoint(): { x: number; y: number } {
        const value = this.rows[SCORE_ROW].value
        return { x: value.x - value.width / 2, y: value.y }
    }

    // Draws the table lines and creates one label/value pair per row.
    private build(count: number): void {
        const width = LABEL_W + VALUE_W
        const height = count * ROW_H
        const left = this.scene.scale.width - MARGIN - width

        this.rows.forEach((r) => {
            r.label.destroy()
            r.value.destroy()
        })
        this.rows = Array.from({ length: count }, (_, i) => {
            const y = MARGIN + i * ROW_H + ROW_H / 2
            return {
                label: this.scene.add.text(left + 8, y, "", TEXT.body).setOrigin(0, 0.5),
                value: this.scene.add.text(left + width - 8, y, "", TEXT.body).setOrigin(1, 0.5)
            }
        })

        const g = this.grid.clear()
        g.fillStyle(COLORS.table).fillRect(left, MARGIN, width, height)
        g.lineStyle(1, COLORS.tableStroke)
        for (let i = 1; i < count; i++) {
            g.lineBetween(left, MARGIN + i * ROW_H, left + width, MARGIN + i * ROW_H)
        }
        g.lineBetween(left + LABEL_W, MARGIN, left + LABEL_W, MARGIN + height)
        g.strokeRect(left, MARGIN, width, height)
    }
}
