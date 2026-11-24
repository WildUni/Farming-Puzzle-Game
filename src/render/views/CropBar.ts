// Crop bar: one button per crop, in id order, always on the play screen. Clicking one selects it
// (white outline); an empty plot click then plants the selected crop, which stays selected so
// several plots can be planted in a row. The selection is screen state kept by the Game scene,
// never part of GameState. See specs/ui.md.
import { Scene } from "phaser"
import type { CropTable } from "../../sim/types"
import { cropButtonText } from "../format"
import { Button } from "./Button"

const CENTER_Y = 1050 // under the power-up bar and its effects line
const BUTTON_W = 160
const BUTTON_H = 56
const GAP = 14

export class CropBar {
    private ids: string[]
    private buttons: Button[]

    constructor(scene: Scene, crops: CropTable, onSelect: (cropId: string) => void) {
        this.ids = Object.keys(crops).sort()
        const step = BUTTON_W + GAP
        const x0 = scene.scale.width / 2 - ((this.ids.length - 1) * step) / 2
        this.buttons = this.ids.map(
            (id, i) =>
                new Button(
                    scene,
                    x0 + i * step,
                    CENTER_Y,
                    BUTTON_W,
                    BUTTON_H,
                    cropButtonText(crops[id]),
                    () => onSelect(id)
                )
        )
    }

    // The first crop, selected when a run starts.
    get first(): string {
        return this.ids[0]
    }

    // `selected` is outlined; `usable` is false while the board is covered or the run is over.
    update(selected: string, usable: boolean): void {
        this.buttons.forEach((b, i) => b.setSelected(this.ids[i] === selected).setEnabled(usable))
    }
}
