// Raccoon: while one is in the barn, a red button covers the drawer's storage bar (shown even
// when the drawer is folded). Clicking it shoos the raccoon away. See specs/ui.md.
import { Scene } from "phaser"
import type { GameState } from "../../sim/types"
import { raccoonText } from "../format"
import { COLORS, MARGIN } from "../theme"
import { Button } from "./Button"

const BAR_Y = 1124 // centre of the drawer's storage bar (DrawerView)
const HEIGHT = 56
const DEPTH = 50 // above the drawer, below the pause shade

export class RaccoonView {
    private button: Button

    constructor(scene: Scene, onShoo: () => void) {
        const width = scene.scale.width - 2 * MARGIN
        this.button = new Button(scene, scene.scale.width / 2, BAR_Y, width, HEIGHT, "", onShoo, {
            fontSize: 18,
            fill: COLORS.eventBad,
            hover: COLORS.barUrgent,
            depth: DEPTH
        })
        this.button.setVisible(false)
    }

    // `usable` is false while paused, while an upgrade offer or the shop is open, and after the
    // run ends.
    update(state: GameState, usable: boolean): void {
        const text = raccoonText(state)
        this.button.setVisible(text !== null)
        if (text === null) return
        this.button.setText(text).setEnabled(usable)
    }
}
