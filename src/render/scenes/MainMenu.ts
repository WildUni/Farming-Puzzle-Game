// The game hub (title screen): a top bar with the seed field and the sound toggle, the farm
// banner with the logo, one card per playable mode, the modes still to come shown locked, a
// How to play button, and the bottom tab bar. A blank seed picks one at random.
// See specs/ui.md.
import { Scene, GameObjects } from "phaser"
import type { GameMode } from "../../sim/types"
import {
    parseSeed,
    MAX_SEED,
    PLAYABLE_MODES,
    modeName,
    modeDescription,
    modeBestText,
    soundButtonText,
    LOCKED_HUB_ROWS,
    HUB_TABS,
    COMING_SOON_TEXT,
    SEED_PLACEHOLDER
} from "../format"
import { setSoundOn } from "../../app/saves"
import { getSave, putSave } from "../saves"
import { addFrame, addIcon } from "../hubArt"
import type { HubIcon, HubTab } from "../hubArt"

type TextStyle = Phaser.Types.GameObjects.Text.TextStyle

const W = 720
const CREAM = 0xf7ead0
const BROWN = "#3b2410"
const SOFT_BROWN = "#5a3e1b"

const HEADING: TextStyle = { fontFamily: "Arial Black, Arial", color: BROWN }
const BODY: TextStyle = { fontFamily: "Arial", fontStyle: "bold", color: SOFT_BROWN }

const TOP_H = 84
const BANNER_Y = 72
const CARD_X = 24
const CARD_W = W - 2 * CARD_X
const CARD_H = 232
const CARD_TOP = [366, 624]
const LOCKED_TOP = [894, 1012]
const LOCKED_W = 560
const LOCKED_H = 96
const NAV_Y = 1214
const TAB_W = 160
const TAB_H = 112

const MODE_ICONS: Partial<Record<GameMode, HubIcon>> = { survival: "trophy", timed: "timer" }
const LOCKED_ICONS: HubIcon[] = ["puzzle", "calendar"]
const TAB_KEYS: HubTab[] = ["hub", "inventory", "store", "profile"]

type MenuData = { mode: GameMode }
type ModeCard = { mode: GameMode; gold: GameObjects.NineSlice }

export class MainMenu extends Scene {
    private seedField: HTMLInputElement
    private error: GameObjects.Text
    private toast: GameObjects.Text
    private mode: GameMode
    private cards: ModeCard[]

    constructor() {
        super("MainMenu")
    }

    // Coming back from a run selects the mode that was just played.
    init(data: Partial<MenuData>) {
        this.mode = data.mode ?? "survival"
    }

    create() {
        this.add.rectangle(0, 0, W, this.scale.height, CREAM).setOrigin(0)

        const banner = this.add.image(W / 2, BANNER_Y, "hub-banner").setOrigin(0.5, 0)
        banner.setScale(W / banner.width)
        this.add.image(178, BANNER_Y + 134, "loading-title").setScale(0.44)

        this.addTopBar()

        this.error = this.add
            .text(W / 2, BANNER_Y + banner.displayHeight + 4, "", {
                ...BODY,
                fontSize: 20,
                color: "#ffffff",
                stroke: "#a3140c",
                strokeThickness: 5
            })
            .setOrigin(0.5, 0)

        this.cards = PLAYABLE_MODES.map((mode, i) => this.addModeCard(mode, CARD_TOP[i]))
        this.selectMode(this.mode)

        LOCKED_HUB_ROWS.forEach((label, i) =>
            this.addLockedRow(label, LOCKED_ICONS[i], LOCKED_TOP[i])
        )
        this.addHelpButton(W - 64, (LOCKED_TOP[0] + LOCKED_TOP[1] + LOCKED_H) / 2)
        this.addNavBar()

        this.toast = this.add
            .text(W / 2, NAV_Y - 100, "", {
                ...HEADING,
                fontSize: 26,
                color: "#fff8e6",
                stroke: "#4a2a10",
                strokeThickness: 6
            })
            .setOrigin(0.5)
            .setAlpha(0)
    }

    // Wooden plank across the top: the seed field on the left, the sound toggle on the right.
    private addTopBar(): void {
        addFrame(this, "plank", W / 2, TOP_H / 2, W + 24, TOP_H + 8, 0.4)

        const pillScale = 0.25
        const pillH = 237 * pillScale
        addFrame(this, "pill", 168, TOP_H / 2, 300, pillH, pillScale)

        // A real <input> so typing, pasting and mobile keyboards work as expected.
        this.seedField = document.createElement("input")
        this.seedField.type = "text"
        this.seedField.inputMode = "numeric"
        this.seedField.placeholder = SEED_PLACEHOLDER
        this.seedField.maxLength = String(MAX_SEED).length
        this.seedField.setAttribute("aria-label", "Seed")
        Object.assign(this.seedField.style, {
            width: "250px",
            height: "44px",
            boxSizing: "border-box",
            padding: "0 4px",
            fontSize: "24px",
            fontFamily: "Arial Black, Arial",
            border: "none",
            outline: "none",
            background: "transparent",
            color: BROWN
        })
        this.seedField.addEventListener("keydown", (e) => {
            if (e.key === "Enter") this.play(this.mode)
        })
        this.add.dom(168, TOP_H / 2, this.seedField)

        const soundX = 520
        const pill = addFrame(this, "pill", soundX, TOP_H / 2, 196, pillH, pillScale)
        const label = this.add
            .text(soundX, TOP_H / 2, soundButtonText(getSave(this).soundOn), {
                ...HEADING,
                fontSize: 22
            })
            .setOrigin(0.5)
        const gear = addIcon(this, "gear", 662, TOP_H / 2, 58)

        const toggle = () => {
            const save = setSoundOn(getSave(this), !getSave(this).soundOn)
            putSave(this, save)
            label.setText(soundButtonText(save.soundOn))
        }
        for (const target of [pill, gear]) {
            target.setInteractive({ useHandCursor: true }).on("pointerdown", toggle)
        }
        this.addPress(gear, gear.scale)
    }

    // One playable mode: icon, name, description, saved best and a Play button.
    // Tapping the card selects it; Play starts it.
    private addModeCard(mode: GameMode, top: number): ModeCard {
        const cy = top + CARD_H / 2
        addFrame(this, "card", W / 2, cy, CARD_W, CARD_H, 0.42)
            .setInteractive({ useHandCursor: true })
            .on("pointerdown", () => this.selectMode(mode))
        // The gold frame sits on top and is shown only while this mode is selected.
        const gold = addFrame(this, "cardSelected", W / 2, cy, CARD_W, CARD_H, 0.42)

        addIcon(this, MODE_ICONS[mode] ?? "star", CARD_X + 104, cy, 150)
        this.add.rectangle(CARD_X + 200, cy, 3, CARD_H - 70, 0x8b5a2b).setAlpha(0.35)

        const textX = CARD_X + 222
        this.add.text(textX, top + 30, modeName(mode), { ...HEADING, fontSize: 44 })
        this.add.text(textX, top + 92, modeDescription(mode), {
            ...BODY,
            fontSize: 22,
            wordWrap: { width: 262 }
        })

        const best = this.add
            .text(textX + 18, top + CARD_H - 50, modeBestText(getSave(this).highScores[mode]), {
                ...BODY,
                fontSize: 24,
                color: BROWN
            })
            .setOrigin(0, 0.5)
        const pillW = best.width + 36
        this.add
            .graphics()
            .fillStyle(0xe9d3a8, 1)
            .fillRoundedRect(textX, best.y - 22, pillW, 44, 22)
        best.setDepth(1)

        const playX = CARD_X + CARD_W - 106
        const play = addFrame(this, "play", playX, cy, 172, 96, 0.4).setInteractive({
            useHandCursor: true
        })
        const playText = this.add
            .text(playX, cy - 4, "Play", {
                ...HEADING,
                fontSize: 40,
                color: "#ffffff",
                stroke: "#1f5a12",
                strokeThickness: 6
            })
            .setOrigin(0.5)
        play.on("pointerdown", () => this.play(mode))
        this.addPress(play, play.scale, playText)

        return { mode, gold }
    }

    // A mode that isn't playable yet: greyed out with a lock.
    private addLockedRow(label: string, icon: HubIcon, top: number): void {
        const cy = top + LOCKED_H / 2
        const row = addFrame(this, "locked", CARD_X + LOCKED_W / 2, cy, LOCKED_W, LOCKED_H, 0.4)
        addIcon(this, icon, CARD_X + 64, cy, 66).setAlpha(0.75)
        this.add.rectangle(CARD_X + 124, cy, 3, LOCKED_H - 36, 0x8b5a2b).setAlpha(0.35)
        this.add
            .text(CARD_X + 150, cy, label, { ...HEADING, fontSize: 32, color: "#5a4632" })
            .setOrigin(0, 0.5)
        addIcon(this, "lock", CARD_X + LOCKED_W - 52, cy, 56)
        row.setInteractive().on("pointerdown", () => this.showToast(COMING_SOON_TEXT))
    }

    // Round "?" button: opens How to play.
    private addHelpButton(x: number, y: number): void {
        const ring = addIcon(this, "ring", x, y, 96).setInteractive({ useHandCursor: true })
        const mark = this.add
            .text(x, y, "?", { ...HEADING, fontSize: 52, color: "#4a2a10" })
            .setOrigin(0.5)
        ring.on("pointerdown", () => this.scene.start("HowTo", { mode: this.mode }))
        this.addPress(ring, ring.scale, mark)
    }

    // Wooden bar with the four tabs. Hub is this page; the others aren't built yet.
    private addNavBar(): void {
        this.add.image(W / 2, NAV_Y, "hub-nav", "bar").setDisplaySize(W + 40, 144)
        const gap = (W - 2 * 16 - 4 * TAB_W) / 3
        TAB_KEYS.forEach((key, i) => {
            const x = 16 + TAB_W / 2 + i * (TAB_W + gap)
            const selected = i === 0
            if (selected) {
                this.add.image(x, NAV_Y, "hub-tab", "tab").setDisplaySize(TAB_W, TAB_H)
            } else {
                this.add
                    .graphics()
                    .fillStyle(0xfbefd6, 1)
                    .fillRoundedRect(x - TAB_W / 2, NAV_Y - TAB_H / 2, TAB_W, TAB_H, 22)
                    .lineStyle(4, 0x8b5a2b, 1)
                    .strokeRoundedRect(x - TAB_W / 2, NAV_Y - TAB_H / 2, TAB_W, TAB_H, 22)
            }
            this.add
                .image(x, NAV_Y - 16, `tab-${key}-${selected ? "on" : "off"}`)
                .setScale(selected ? 1.05 : 0.95)
            this.add
                .text(x, NAV_Y + 34, HUB_TABS[i], { ...HEADING, fontSize: 22, color: "#4a2a10" })
                .setOrigin(0.5)
            if (!selected) {
                this.add
                    .zone(x, NAV_Y, TAB_W, TAB_H)
                    .setInteractive({ useHandCursor: true })
                    .on("pointerdown", () => this.showToast(COMING_SOON_TEXT))
            }
        })
    }

    // Shrinks a button a little while it is held down.
    private addPress(
        target: GameObjects.Image | GameObjects.NineSlice,
        scale: number,
        label?: GameObjects.Text
    ): void {
        const set = (s: number) => {
            target.setScale(scale * s)
            label?.setScale(s)
        }
        target.on("pointerdown", () => set(0.94))
        target.on("pointerup", () => set(1))
        target.on("pointerout", () => set(1))
    }

    private showToast(text: string): void {
        this.toast.setText(text).setAlpha(1)
        this.tweens.killTweensOf(this.toast)
        this.tweens.add({ targets: this.toast, alpha: 0, delay: 900, duration: 400 })
    }

    // The selected mode gets the gold frame; Enter in the seed field starts it.
    private selectMode(mode: GameMode): void {
        this.mode = mode
        for (const card of this.cards) {
            card.gold.setVisible(card.mode === mode)
        }
    }

    private play(mode: GameMode): void {
        const parsed = parseSeed(this.seedField.value)
        if (parsed === null) {
            this.error.setText(`Seed must be a whole number from 0 to ${MAX_SEED}`)
            return
        }
        const seed = parsed ?? Math.floor(Math.random() * (MAX_SEED + 1))
        this.scene.start("Game", { seed, mode })
    }
}
