// The play screen's Shop button, in the right-hand column: Shop, and the free restocks banked.
// Clicking it opens the shop page. Disabled while an upgrade offer is open (the pick comes
// first), while paused, and after the run ends. Hidden in Puzzle. See specs/ui.md.
import { Scene } from "phaser"
import type { GameState } from "../../sim/types"
import { canOpenShop } from "../../sim/shop"
import { shopButtonText } from "../format"
import { COLORS } from "../theme"
import { Button } from "./Button"

const BUTTON_W = 180 // narrower than the column, so it clears the plot grid
const BUTTON_H = 64

export class ShopButtonView {
    private button: Button

    // (right, top) is the button's top-right corner.
    constructor(scene: Scene, right: number, top: number, onClick: () => void) {
        this.button = new Button(
            scene,
            right - BUTTON_W / 2,
            top + BUTTON_H / 2,
            BUTTON_W,
            BUTTON_H,
            "Shop",
            onClick,
            { fill: COLORS.rush, hover: COLORS.sunnyTint }
        )
    }

    get bottom(): number {
        return this.button.bottom
    }

    update(state: GameState, paused: boolean): void {
        this.button.setVisible(state.mode !== "puzzle")
        this.button.setText(shopButtonText(state)).setEnabled(!paused && canOpenShop(state))
    }
}
