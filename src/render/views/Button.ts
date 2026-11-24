// A plain rectangle button with a centred label, used by the crop bar, the drawer, the Shop
// button and the shop page. Disabled buttons are greyed out and ignore clicks; a selected one
// gets a white outline.
import { GameObjects, Scene } from "phaser"
import { COLORS, TEXT } from "../theme"

type ButtonOptions = {
    fontSize?: number
    fill?: number // colour while enabled
    hover?: number // colour under the pointer while enabled
    depth?: number
}

export class Button {
    readonly box: GameObjects.Rectangle
    readonly label: GameObjects.Text
    private enabled = true
    private selected = false
    private fill: number
    private hover: number

    // (x, y) is the button's centre.
    constructor(
        scene: Scene,
        x: number,
        y: number,
        w: number,
        h: number,
        text: string,
        onClick: () => void,
        options: ButtonOptions = {}
    ) {
        this.fill = options.fill ?? COLORS.button
        this.hover = options.hover ?? COLORS.buttonHover
        const depth = options.depth ?? 0
        this.box = scene.add
            .rectangle(x, y, w, h, this.fill)
            .setDepth(depth)
            .setInteractive({ useHandCursor: true })
            .on("pointerover", () => this.enabled && this.box.setFillStyle(this.hover))
            .on("pointerout", () => this.paint())
            .on("pointerdown", () => this.enabled && onClick())
        this.label = scene.add
            .text(x, y, text, {
                ...TEXT.label,
                fontSize: options.fontSize ?? 18,
                align: "center",
                wordWrap: { width: w - 10 }
            })
            .setOrigin(0.5)
            .setDepth(depth + 1)
        this.paint()
    }

    get bottom(): number {
        return this.box.y + this.box.height / 2
    }

    setText(text: string): this {
        if (this.label.text !== text) this.label.setText(text)
        return this
    }

    setEnabled(enabled: boolean): this {
        this.enabled = enabled
        this.paint()
        return this
    }

    setSelected(selected: boolean): this {
        this.selected = selected
        this.paint()
        return this
    }

    setVisible(visible: boolean): this {
        this.box.setVisible(visible)
        this.label.setVisible(visible)
        this.box.input!.enabled = visible
        return this
    }

    setAlpha(alpha: number): this {
        this.box.setAlpha(alpha)
        this.label.setAlpha(alpha)
        return this
    }

    destroy(): void {
        this.box.destroy()
        this.label.destroy()
    }

    private paint(): void {
        this.box.setFillStyle(this.enabled ? this.fill : COLORS.buttonDisabled)
        this.box.setStrokeStyle(
            this.selected ? 4 : 2,
            this.selected ? COLORS.highlight : COLORS.cardStroke
        )
        this.label.setAlpha(this.enabled ? 1 : 0.6)
        this.box.input!.cursor = this.enabled ? "pointer" : "default"
    }
}
