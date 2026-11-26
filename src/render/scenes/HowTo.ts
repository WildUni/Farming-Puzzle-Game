// How to play: four short panels, paged with Back / Next, opened from the title screen.
// It gets the title screen's selected mode and hands it back. See specs/ui.md.
import { GameObjects, Scene } from "phaser"
import type { GameMode } from "../../sim/types"
import { HOW_TO_PANELS, howToPageText } from "../format"
import { COLORS, MARGIN, TEXT, addBackground } from "../theme"
import { Button } from "../views/Button"

const CARD_W = 600
const CARD_H = 640
const CARD_PAD = 36
const BUTTON_W = 220
const BUTTON_H = 80
const CLOSE_W = 150
const CLOSE_H = 56

type HowToData = { mode: GameMode }

export class HowTo extends Scene {
    private mode: GameMode
    private page: number
    private title: GameObjects.Text
    private body: GameObjects.Text
    private count: GameObjects.Text
    private back: Button
    private next: Button

    constructor() {
        super("HowTo")
    }

    init(data: Partial<HowToData>) {
        this.mode = data.mode ?? "survival"
        this.page = 0
    }

    create() {
        addBackground(this)
        const { centerX, centerY } = this.cameras.main

        this.add
            .text(centerX, centerY - CARD_H / 2 - 110, "How to play", {
                ...TEXT.label,
                fontSize: 52
            })
            .setOrigin(0.5)
        this.add
            .rectangle(centerX, centerY, CARD_W, CARD_H, COLORS.card)
            .setStrokeStyle(4, COLORS.cardStroke)
        this.title = this.add
            .text(centerX, centerY - CARD_H / 2 + CARD_PAD, "", { ...TEXT.label, fontSize: 38 })
            .setOrigin(0.5, 0)
        this.body = this.add
            .text(centerX - CARD_W / 2 + CARD_PAD, centerY - CARD_H / 2 + CARD_PAD + 80, "", {
                ...TEXT.body,
                fontSize: 26,
                lineSpacing: 8,
                wordWrap: { width: CARD_W - CARD_PAD * 2 }
            })
            .setOrigin(0)
        this.count = this.add
            .text(centerX, centerY + CARD_H / 2 - CARD_PAD, "", { ...TEXT.body, fontSize: 22 })
            .setOrigin(0.5, 1)

        const buttonY = centerY + CARD_H / 2 + 30 + BUTTON_H / 2
        const offset = (BUTTON_W + 30) / 2
        this.back = new Button(
            this,
            centerX - offset,
            buttonY,
            BUTTON_W,
            BUTTON_H,
            "Back",
            () => this.turn(-1),
            { fontSize: 32 }
        )
        this.next = new Button(
            this,
            centerX + offset,
            buttonY,
            BUTTON_W,
            BUTTON_H,
            "Next",
            () => this.turn(1),
            { fontSize: 32 }
        )
        new Button(
            this,
            this.scale.width - MARGIN - CLOSE_W / 2,
            MARGIN + CLOSE_H / 2,
            CLOSE_W,
            CLOSE_H,
            "Close",
            () => this.close(),
            { fontSize: 22 }
        )

        const keys = this.input.keyboard!
        keys.on("keydown-LEFT", () => this.turn(-1))
        keys.on("keydown-RIGHT", () => this.turn(1))
        keys.on("keydown-ESC", () => this.close())

        this.show()
    }

    // Back and Next. Next on the last panel is Done, which closes the screen.
    private turn(by: number): void {
        const page = this.page + by
        if (page < 0) return
        if (page >= HOW_TO_PANELS.length) {
            this.close()
            return
        }
        this.page = page
        this.show()
    }

    private show(): void {
        const panel = HOW_TO_PANELS[this.page]
        this.title.setText(panel.title)
        this.body.setText(panel.body)
        this.count.setText(howToPageText(this.page))
        this.back.setEnabled(this.page > 0)
        this.next.setText(this.page === HOW_TO_PANELS.length - 1 ? "Done" : "Next")
    }

    private close(): void {
        this.scene.start("MainMenu", { mode: this.mode })
    }
}
