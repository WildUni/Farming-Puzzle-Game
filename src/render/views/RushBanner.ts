// Timed rush wave banner: counts down each wave's warning, then shows how many of its orders
// are still open. Sits where the event banner does, and moves up above it while both show.
// Never takes clicks.
import { GameObjects, Scene } from "phaser"
import type { GameState } from "../../sim/types"
import { eventBannerText, rushBannerText, newsText } from "../format"
import { COLORS, TEXT } from "../theme"

const WIDTH = 420
const HEIGHT = 44
const CENTER_Y = 490 // the event banner's spot, between the order cards and the plot grid
const STACKED_Y = CENTER_Y - HEIGHT - 6 // above the event banner while both show

export class RushBanner {
    private box: GameObjects.Rectangle
    private label: GameObjects.Text

    constructor(scene: Scene) {
        const x = scene.scale.width / 2
        this.box = scene.add
            .rectangle(x, CENTER_Y, WIDTH, HEIGHT, COLORS.rush)
            .setStrokeStyle(2, COLORS.cardStroke)
        this.label = scene.add.text(x, CENTER_Y, "", TEXT.title).setOrigin(0.5)
    }

    update(state: GameState): void {
        const text = rushBannerText(state)
        const visible = text !== null
        this.box.setVisible(visible)
        this.label.setVisible(visible)
        if (!visible) return
        this.label.setText(text)
        const event =
            state.allowEvents && (eventBannerText(state) !== null || newsText(state) !== null)
        const y = event ? STACKED_Y : CENTER_Y
        this.box.setY(y)
        this.label.setY(y)
    }
}
