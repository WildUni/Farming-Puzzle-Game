// Shop screen: the stock as cards with Buy buttons, the owned upgrades with Sell buttons, and
// Restock and Close. Shown while state.shop is set. A pausing shop puts a shade over the board
// that swallows clicks; a running shop shows its time left. A targeted buy (a plot or crop
// upgrade, or Promotion) opens a second step with one button per target and Back.
// See specs/ui.md.
import { GameObjects, Scene } from "phaser"
import type { CropTable, GameState, UpgradeTarget } from "../../sim/types"
import { buyTargets, canBuyAny, canBuy, canRestock, canSell, needsTarget } from "../../sim/shop"
import { UPGRADES } from "../../sim/upgrades"
import {
    ownedUpgradeText,
    promotionTargetText,
    restockText,
    sellRefundText,
    shopItemText,
    shopPriceText,
    shopTimerText,
    shopTitleText,
    targetText,
    targetTitle
} from "../format"
import { COLORS, TEXT } from "../theme"

const DEPTH = 150 // with the upgrade pick: above the plant picker, below pause and game over
const CARD_W = 210
const CARD_H = 230
const SMALL_H = 170 // power-up and life cards
const GAP = 16
const STROKE = 5
const BUY_H = 44
const OWNED_W = 220
const OWNED_H = 58
const OWNED_COLS = 3
const OWNED_ROWS = 6
const BUTTON_W = 200
const BUTTON_H = 64

type Handlers = {
    buy: (slot: number, target: UpgradeTarget) => void
    sell: (index: number) => void
    restock: () => void
    close: () => void
}

export class ShopView {
    private scene: Scene
    private crops: CropTable
    private on: Handlers
    private shade: GameObjects.Rectangle
    private title: GameObjects.Text
    private timer: GameObjects.Text
    private parts: GameObjects.GameObject[] = [] // rebuilt whenever what they show changes
    private built: string | null = null // key of the state the screen was built for
    private choosing: number | null = null // stock slot whose target is being chosen

    constructor(scene: Scene, crops: CropTable, on: Handlers) {
        this.scene = scene
        this.crops = crops
        this.on = on
        const { width, height } = scene.scale
        this.shade = scene.add
            .rectangle(0, 0, width, height, COLORS.shade, 0.75)
            .setOrigin(0)
            .setDepth(DEPTH)
            .setInteractive()
        this.title = scene.add
            .text(width / 2, 70, "", { ...TEXT.label, fontSize: 38 })
            .setOrigin(0.5)
            .setDepth(DEPTH + 1)
        this.timer = scene.add
            .text(width / 2, 112, "", { ...TEXT.label, fontSize: 22 })
            .setOrigin(0.5)
            .setDepth(DEPTH + 1)
        this.update(null)
    }

    // Shows the shop while one is open and no upgrade offer covers it; hides it otherwise.
    update(state: GameState | null): void {
        const open =
            state !== null &&
            state.status === "running" &&
            state.shop !== null &&
            state.upgradeOffer === null
        this.shade.setVisible(open)
        this.shade.input!.enabled = open
        this.title.setVisible(open)
        this.timer.setVisible(open)
        if (!open) {
            this.choosing = null
            if (this.built !== null) this.clear()
            this.built = null
            return
        }
        this.title.setText(shopTitleText(state))
        this.timer.setText(shopTimerText(state))
        // Rebuild only when something the buttons show has changed.
        const key = JSON.stringify([
            state.shop,
            state.upgrades,
            state.coins,
            state.lives,
            state.powerUps,
            state.inventory,
            this.choosing
        ])
        if (key === this.built) return
        this.built = key
        if (this.choosing !== null) this.showTargets(state, this.choosing)
        else this.showShop(state)
    }

    private clear(): void {
        this.parts.forEach((p) => p.destroy())
        this.parts = []
    }

    // The main screen: stock cards, owned upgrades, Restock and Close.
    private showShop(state: GameState): void {
        this.clear()
        const { width, height } = this.scene.scale
        const stock = state.shop!.stock
        const upgrades = stock.flatMap((it, i) => (it.kind === "upgrade" ? [i] : []))
        const others = stock.flatMap((it, i) => (it.kind !== "upgrade" ? [i] : []))

        const row1 = 160 + CARD_H / 2
        this.cardRow(state, upgrades, row1, CARD_H)
        const row2 = row1 + CARD_H / 2 + GAP + SMALL_H / 2
        this.cardRow(state, others, row2, SMALL_H)

        // Owned upgrades, a grid of sell buttons.
        const ownedTop = row2 + SMALL_H / 2 + 46
        this.addText(
            width / 2,
            ownedTop - 22,
            state.upgrades.length > 0 ? "Your upgrades" : "No upgrades yet",
            22
        )
        const max = OWNED_COLS * OWNED_ROWS
        const stepX = OWNED_W + 10
        const x0 = width / 2 - ((OWNED_COLS - 1) * stepX) / 2
        state.upgrades.slice(0, max).forEach((copy, i) => {
            const x = x0 + (i % OWNED_COLS) * stepX
            const y = ownedTop + 10 + OWNED_H / 2 + Math.floor(i / OWNED_COLS) * (OWNED_H + 8)
            this.addButton(
                x,
                y,
                OWNED_W,
                OWNED_H,
                `${ownedUpgradeText(copy)}\n${sellRefundText(state, i)}`,
                () => this.on.sell(i),
                canSell(state, i),
                14
            )
        })
        if (state.upgrades.length > max) {
            const y = ownedTop + 10 + OWNED_ROWS * (OWNED_H + 8) + 10
            this.addText(width / 2, y, `+${state.upgrades.length - max} more`, 18)
        }

        const by = height - 130
        this.addButton(
            width / 2 - BUTTON_W / 2 - 12,
            by,
            BUTTON_W,
            BUTTON_H,
            restockText(state),
            () => this.on.restock(),
            canRestock(state)
        )
        this.addButton(
            width / 2 + BUTTON_W / 2 + 12,
            by,
            BUTTON_W,
            BUTTON_H,
            "Close",
            () => this.on.close(),
            true
        )
    }

    // One row of stock cards centred at height y.
    private cardRow(state: GameState, slots: number[], y: number, h: number): void {
        const { width } = this.scene.scale
        const step = CARD_W + GAP
        const x0 = width / 2 - ((slots.length - 1) * step) / 2
        slots.forEach((slot, i) => {
            const item = state.shop!.stock[slot]
            const x = x0 + i * step
            const frame =
                item.kind === "upgrade"
                    ? COLORS.tier[item.tier]
                    : item.kind === "powerUp"
                      ? COLORS.powerUp
                      : COLORS.eventTarget
            const box = this.scene.add
                .rectangle(x, y, CARD_W, h, COLORS.card)
                .setStrokeStyle(STROKE, frame)
                .setDepth(DEPTH + 1)
                .setAlpha(item.sold ? 0.5 : 1)
            const label = this.scene.add
                .text(x, y - BUY_H / 2 - 4, shopItemText(state, slot), {
                    ...TEXT.body,
                    fontSize: 19,
                    align: "center",
                    lineSpacing: 6,
                    wordWrap: { width: CARD_W - 20 }
                })
                .setOrigin(0.5)
                .setDepth(DEPTH + 2)
                .setAlpha(item.sold ? 0.5 : 1)
            this.parts.push(box, label)
            const buyY = y + h / 2 - BUY_H / 2 - 10
            this.addButton(
                x,
                buyY,
                CARD_W - 30,
                BUY_H,
                shopPriceText(state, slot),
                () => {
                    if (!needsTarget(state, slot)) {
                        this.on.buy(slot, null)
                        return
                    }
                    this.choosing = slot
                    this.built = null
                    this.update(state)
                },
                !item.sold && canBuyAny(state, slot, this.crops),
                20
            )
        })
    }

    // Second step for a targeted buy: one button per target, then Back.
    private showTargets(state: GameState, slot: number): void {
        this.clear()
        const { width, height } = this.scene.scale
        const item = state.shop!.stock[slot]
        if (item.kind !== "upgrade") return
        const def = UPGRADES.upgrades[item.id]
        const promote = def.kind === "instant"
        this.addText(
            width / 2,
            height / 2 - 220,
            promote ? "Choose an upgrade to promote" : targetTitle(def),
            30
        )
        const targets = buyTargets(state, slot, this.crops).filter((t) =>
            canBuy(state, slot, t, this.crops)
        )
        const cols = 3
        const w = promote ? 210 : 160
        const stepX = w + 14
        targets.forEach((target, i) => {
            const n = Math.min(cols, targets.length)
            const x = width / 2 - ((n - 1) * stepX) / 2 + (i % cols) * stepX
            const y = height / 2 - 140 + Math.floor(i / cols) * (BUTTON_H + 14)
            const text = promote
                ? promotionTargetText(state.upgrades[target as number])
                : targetText(target)
            this.addButton(
                x,
                y,
                w,
                BUTTON_H,
                text,
                () => {
                    this.choosing = null
                    this.on.buy(slot, target)
                },
                true,
                promote ? 16 : 20
            )
        })
        this.addButton(
            width / 2,
            height / 2 + 300,
            BUTTON_W,
            BUTTON_H,
            "Back",
            () => {
                this.choosing = null
                this.built = null
                this.update(state)
            },
            true
        )
    }

    private addText(x: number, y: number, text: string, size: number): void {
        const t = this.scene.add
            .text(x, y, text, { ...TEXT.label, fontSize: size })
            .setOrigin(0.5)
            .setDepth(DEPTH + 1)
        this.parts.push(t)
    }

    private addButton(
        x: number,
        y: number,
        w: number,
        h: number,
        text: string,
        onClick: () => void,
        enabled: boolean,
        fontSize = 20
    ): void {
        const fill = enabled ? COLORS.button : COLORS.buttonDisabled
        const box = this.scene.add
            .rectangle(x, y, w, h, fill)
            .setDepth(DEPTH + 2)
            .setInteractive({ useHandCursor: enabled })
            .on("pointerover", () => enabled && box.setFillStyle(COLORS.buttonHover))
            .on("pointerout", () => box.setFillStyle(fill))
            .on("pointerdown", () => enabled && onClick())
        const label = this.scene.add
            .text(x, y, text, {
                ...TEXT.label,
                fontSize,
                align: "center",
                wordWrap: { width: w - 10 }
            })
            .setOrigin(0.5)
            .setDepth(DEPTH + 3)
            .setAlpha(enabled ? 1 : 0.6)
        this.parts.push(box, label)
    }
}
