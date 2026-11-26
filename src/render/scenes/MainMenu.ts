// Title screen: logo, a seed field, a mode picker, Play and How to play.
// A blank seed picks one at random. Each mode shows its saved high score, and a corner
// button turns sound on or off. See specs/ui.md.
import { Scene, GameObjects } from "phaser"
import type { GameMode } from "../../sim/types"
import {
    parseSeed,
    MAX_SEED,
    PLAYABLE_MODES,
    modeButtonText,
    modeBestText,
    soundButtonText
} from "../format"
import { setSoundOn } from "../../app/saves"
import { getSave, putSave } from "../saves"
import { COLORS, MARGIN, TEXT, addBackground } from "../theme"
import { Button } from "../views/Button"

const FIELD_W = 360
const FIELD_H = 64
const BUTTON_W = 240
const BUTTON_H = 80
const MODE_W = 280
const MODE_H = 110
const MODE_GAP = 24
const HOW_TO_H = 64
const SOUND_W = 170
const SOUND_H = 56

type MenuData = { mode: GameMode }
type ModeButton = { mode: GameMode; box: GameObjects.Rectangle }

export class MainMenu extends Scene {
    private seedField: HTMLInputElement
    private error: GameObjects.Text
    private mode: GameMode
    private modeButtons: ModeButton[]

    constructor() {
        super("MainMenu")
    }

    // Coming back from a run selects the mode that was just played.
    init(data: Partial<MenuData>) {
        this.mode = data.mode ?? "survival"
    }

    create() {
        addBackground(this)
        const { centerX, centerY } = this.cameras.main

        this.add.image(centerX, centerY - 300, "logo")

        this.add.text(centerX, centerY - 110, "Seed (optional)", TEXT.title).setOrigin(0.5)

        // A real <input> so typing, pasting and mobile keyboards work as expected.
        this.seedField = document.createElement("input")
        this.seedField.type = "text"
        this.seedField.inputMode = "numeric"
        this.seedField.placeholder = "random"
        this.seedField.maxLength = String(MAX_SEED).length
        this.seedField.setAttribute("aria-label", "Seed")
        Object.assign(this.seedField.style, {
            width: `${FIELD_W}px`,
            height: `${FIELD_H}px`,
            boxSizing: "border-box",
            padding: "0 16px",
            fontSize: "28px",
            fontFamily: "Arial",
            textAlign: "center",
            border: "3px solid #5a3e1b",
            borderRadius: "8px",
            background: "#fff4d6",
            color: "#222222"
        })
        this.seedField.addEventListener("keydown", (e) => {
            if (e.key === "Enter") this.play()
        })
        this.add.dom(centerX, centerY - 50, this.seedField)

        this.error = this.add
            .text(centerX, centerY + 10, "", {
                ...TEXT.title,
                color: "#ffffff",
                stroke: "#a3140c",
                strokeThickness: 5,
                fontSize: 18
            })
            .setOrigin(0.5)

        this.add.text(centerX, centerY + 60, "Mode", TEXT.title).setOrigin(0.5)
        const rowW = PLAYABLE_MODES.length * MODE_W + (PLAYABLE_MODES.length - 1) * MODE_GAP
        this.modeButtons = PLAYABLE_MODES.map((mode, i) => {
            const x = centerX - rowW / 2 + MODE_W / 2 + i * (MODE_W + MODE_GAP)
            const y = centerY + 150
            const box = this.add
                .rectangle(x, y, MODE_W, MODE_H, COLORS.button)
                .setInteractive({ useHandCursor: true })
                .on("pointerdown", () => this.selectMode(mode))
            this.add
                .text(x, y, modeButtonText(mode), { ...TEXT.label, fontSize: 22 })
                .setOrigin(0.5)
            this.add
                .text(x, y + MODE_H / 2 + 22, modeBestText(getSave(this).highScores[mode]), {
                    ...TEXT.title,
                    fontSize: 22
                })
                .setOrigin(0.5)
            return { mode, box }
        })
        this.selectMode(this.mode)

        const playY = centerY + 300
        const button = this.add
            .rectangle(centerX, playY, BUTTON_W, BUTTON_H, COLORS.button)
            .setStrokeStyle(3, COLORS.cardStroke)
            .setInteractive({ useHandCursor: true })
            .on("pointerover", () => button.setFillStyle(COLORS.buttonHover))
            .on("pointerout", () => button.setFillStyle(COLORS.button))
            .on("pointerdown", () => this.play())
        this.add.text(centerX, playY, "Play", { ...TEXT.label, fontSize: 36 }).setOrigin(0.5)

        new Button(
            this,
            centerX,
            playY + BUTTON_H + 24,
            BUTTON_W,
            HOW_TO_H,
            "How to play",
            () => this.scene.start("HowTo", { mode: this.mode }),
            { fontSize: 26 }
        )

        this.addSoundToggle()
    }

    // Top-right corner: flips the saved sound setting, which also mutes or unmutes the game.
    private addSoundToggle(): void {
        const x = this.scale.width - MARGIN - SOUND_W / 2
        const y = MARGIN + SOUND_H / 2
        const box = this.add
            .rectangle(x, y, SOUND_W, SOUND_H, COLORS.button)
            .setStrokeStyle(3, COLORS.cardStroke)
            .setInteractive({ useHandCursor: true })
        const label = this.add
            .text(x, y, soundButtonText(getSave(this).soundOn), { ...TEXT.label, fontSize: 22 })
            .setOrigin(0.5)
        box.on("pointerover", () => box.setFillStyle(COLORS.buttonHover))
            .on("pointerout", () => box.setFillStyle(COLORS.button))
            .on("pointerdown", () => {
                const save = setSoundOn(getSave(this), !getSave(this).soundOn)
                putSave(this, save)
                label.setText(soundButtonText(save.soundOn))
            })
    }

    // Selecting a mode only highlights it; Play starts the run.
    private selectMode(mode: GameMode): void {
        this.mode = mode
        for (const b of this.modeButtons) {
            const selected = b.mode === mode
            b.box.setFillStyle(selected ? COLORS.button : COLORS.buttonDisabled)
            b.box.setStrokeStyle(selected ? 5 : 2, selected ? COLORS.highlight : COLORS.cardStroke)
        }
    }

    private play(): void {
        const parsed = parseSeed(this.seedField.value)
        if (parsed === null) {
            this.error.setText(`Seed must be a whole number from 0 to ${MAX_SEED}`)
            return
        }
        const seed = parsed ?? Math.floor(Math.random() * (MAX_SEED + 1))
        this.scene.start("Game", { seed, mode: this.mode })
    }
}
