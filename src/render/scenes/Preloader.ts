import { GameObjects, Scene } from "phaser"
import { loadHubArt, sliceHubArt } from "../hubArt"

const VERSION = "v0.1.0"
const TIP = "Harvest crops to fill orders."

// The bar is shown filling for at least this long, so the screen doesn't just flash past.
const MIN_SHOW_MS = 1200

// Layout of the bar sheet (see Boot): the cream inside of the frame, in frame pixels.
const BAR = { x: 360, y: 1057, width: 643 }
const FRAME_WIDTH = 1258
const INNER = { left: 61, right: 1206, top: 54, bottom: 162 }
const FILL_HEIGHT = 138
const FILL_CAP = 69 // the rounded ends of the fill, kept unstretched

export class Preloader extends Scene {
    private loaded = 0
    private done = false
    private shownStart = 0
    private fill!: GameObjects.NineSlice
    private fillScale = 1
    private fillMax = 0
    private percent!: GameObjects.Text

    constructor() {
        super("Preloader")
    }

    init() {
        const { width, height } = this.scale
        this.loaded = 0
        this.done = false
        this.shownStart = this.time.now

        const bg = this.add.image(width / 2, height / 2, "loading-bg")
        bg.setScale(Math.max(width / bg.width, height / bg.height))

        const title = this.add.image(width / 2, 250, "loading-title").setScale(0.98)
        this.tweens.add({
            targets: title,
            y: 258,
            duration: 1400,
            yoyo: true,
            repeat: -1,
            ease: "Sine.easeInOut"
        })

        const plot = this.add.image(width / 2, 805, "loading-plot").setScale(0.8)
        this.tweens.add({
            targets: plot,
            scaleY: 0.82,
            duration: 900,
            yoyo: true,
            repeat: -1,
            ease: "Sine.easeInOut"
        })

        this.addBar()
        this.addTip(width / 2, 1162)

        this.add
            .text(width - 18, height - 16, VERSION, {
                fontFamily: "Arial Black, Arial",
                fontSize: 24,
                color: "#fff8e6",
                stroke: "#4a2a10",
                strokeThickness: 5
            })
            .setOrigin(1, 1)

        this.load.on("progress", (progress: number) => {
            this.loaded = progress
        })
    }

    preload() {
        this.load.setPath("assets")
        this.load.image("logo", "logo.png")
        this.load.setPath("")
        loadHubArt(this)
    }

    create() {
        sliceHubArt(this)
        this.loaded = 1
    }

    update(time: number) {
        if (this.done) return
        const shown = Math.min(this.loaded, (time - this.shownStart) / MIN_SHOW_MS)
        this.setProgress(shown)
        if (shown >= 1) {
            this.done = true
            this.time.delayedCall(150, () => this.scene.start("MainMenu"))
        }
    }

    private addBar() {
        const frameScale = BAR.width / FRAME_WIDTH
        const frame = this.add.image(BAR.x, BAR.y, "loading-bar", "frame").setScale(frameScale)

        const top = BAR.y - frame.displayHeight / 2
        const left = BAR.x - frame.displayWidth / 2
        const innerTop = top + INNER.top * frameScale
        const innerBottom = top + INNER.bottom * frameScale
        const innerLeft = left + INNER.left * frameScale
        this.fillMax = (INNER.right - INNER.left) * frameScale

        // Slightly taller than the cream area so the fill covers the frame's inner outline.
        this.fillScale = (innerBottom - innerTop + 2) / FILL_HEIGHT
        this.fill = this.add
            .nineslice(
                innerLeft - 1,
                (innerTop + innerBottom) / 2,
                "loading-bar",
                "fill",
                FILL_CAP * 2,
                FILL_HEIGHT,
                FILL_CAP,
                FILL_CAP,
                0,
                0
            )
            .setOrigin(0, 0.5)
            .setScale(this.fillScale)
            .setVisible(false)

        this.percent = this.add
            .text(BAR.x, (innerTop + innerBottom) / 2, "0%", {
                fontFamily: "Arial Black, Arial",
                fontSize: 32,
                color: "#fff8e6",
                stroke: "#4a2a10",
                strokeThickness: 7
            })
            .setOrigin(0.5)
    }

    private setProgress(progress: number) {
        const minWidth = FILL_CAP * 2 * this.fillScale
        const width = Math.max(minWidth, (this.fillMax + 2) * progress)
        this.fill.setVisible(progress > 0)
        this.fill.setSize(width / this.fillScale, FILL_HEIGHT)
        this.percent.setText(`${Math.round(progress * 100)}%`)
    }

    private addTip(x: number, y: number) {
        const w = 532
        const h = 70
        const g = this.add.graphics()
        g.fillStyle(0x6b3f1a, 0.35)
        g.fillRoundedRect(x - w / 2, y - h / 2 + 4, w, h, h / 2)
        g.fillStyle(0xfff4dc, 1)
        g.fillRoundedRect(x - w / 2, y - h / 2, w, h, h / 2)
        g.lineStyle(4, 0xb7834a, 1)
        g.strokeRoundedRect(x - w / 2, y - h / 2, w, h, h / 2)

        this.add
            .text(x, y, TIP, {
                fontFamily: "Arial",
                fontStyle: "bold",
                fontSize: 30,
                color: "#3b2410"
            })
            .setOrigin(0.5)
    }
}
