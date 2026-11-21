// Banner above the plots announcing the next event and counting down its warning, then its
// time left. Green for good events, red for bad ones. Never takes clicks.
import { GameObjects, Scene } from "phaser"
import type { GameState } from "../../sim/types"
import { eventBannerText, eventIsGood } from "../format"
import { COLORS, TEXT } from "../theme"

const WIDTH = 420
const HEIGHT = 44
const CENTER_Y = 490 // between the order cards and the plot grid

export class EventBanner {
    private box: GameObjects.Rectangle
    private label: GameObjects.Text

    constructor(scene: Scene) {
        const x = scene.scale.width / 2
        this.box = scene.add
            .rectangle(x, CENTER_Y, WIDTH, HEIGHT, COLORS.eventBad)
            .setStrokeStyle(2, COLORS.cardStroke)
        this.label = scene.add.text(x, CENTER_Y, "", TEXT.title).setOrigin(0.5)
    }

    update(state: GameState): void {
        const text = state.allowEvents ? eventBannerText(state) : null
        const visible = text !== null
        this.box.setVisible(visible)
        this.label.setVisible(visible)
        if (!visible) return
        this.label.setText(text)
        this.box.setFillStyle(eventIsGood(state) ? COLORS.eventGood : COLORS.eventBad)
    }
}
