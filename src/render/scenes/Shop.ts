// The shop page: a scene launched over the Game scene while the shop is open (the clock is
// stopped). The Game scene keeps the GameState, the tick loop and the action log; it hands this
// page a way to read the state and its act() function, so every move made here is checked by
// the sim and logged. Three sections: Shop (stock, Restock), Storage (selling crops, making
// fertilizer) and Your upgrades (selling copies back). See specs/ui.md.
import { GameObjects, Scene } from "phaser"
import type { Action, CropTable, GameState, UpgradeTarget } from "../../sim/types"
import {
    buyTargets,
    canBuy,
    canBuyAny,
    canRestock,
    canSell,
    isMaxed,
    needsTarget
} from "../../sim/shop"
import { fertilizerAllowed } from "../../sim/economy"
import { UPGRADES } from "../../sim/upgrades"
import {
    barnCropText,
    freeRestockText,
    isStorageFull,
    makeFertilizerText,
    ownedUpgradeText,
    promotionTargetText,
    restockText,
    sellAmount,
    sellButtonText,
    sellRefundText,
    shopItemText,
    shopPriceText,
    shopTitleText,
    storageFill,
    storageText,
    targetText,
    targetTitle
} from "../format"
import { COLORS, MARGIN, TEXT } from "../theme"
import { Button } from "../views/Button"

type Section = "shop" | "storage" | "upgrades"

const SECTIONS: [Section, string][] = [
    ["shop", "Shop"],
    ["storage", "Storage"],
    ["upgrades", "Your upgrades"]
]

// What the Game scene hands the shop page.
type ShopData = {
    crops: CropTable
    state: () => GameState
    act: (action: Action) => boolean
    close: () => void
}

const TITLE_Y = 60
const TABS_Y = 130
const TAB_W = 210
const TAB_H = 56
const TOP = 190 // where a section's content starts
const CLOSE_Y = 1200
const BUTTON_W = 220
const BUTTON_H = 64
const CARD_W = 210
const CARD_H = 240
const SMALL_H = 180 // power-up and life cards
const CARD_GAP = 16
const STROKE = 5
const BUY_H = 44
const ROW_H = 64 // one owned copy in Your upgrades
const ROW_GAP = 8
const LIST_BOTTOM = 1110 // Your upgrades scrolls past this

export class Shop extends Scene {
    private data_!: ShopData
    private section: Section = "shop"
    private choosing: number | null = null // stock slot whose target is being chosen
    private cropId = "" // crop picked in Storage
    private amount = 1 // how many to sell in Storage
    private scroll = 0 // first row shown in Your upgrades
    private title!: GameObjects.Text
    private tabs: Button[] = []
    private parts: { destroy(): void }[] = [] // the open section, rebuilt when it changes
    private built: string | null = null // key of what the section was built for

    constructor() {
        super("Shop")
    }

    init(data: ShopData) {
        this.data_ = data
        this.section = "shop"
        this.choosing = null
        this.cropId = Object.keys(data.crops).sort()[0]
        this.amount = 1
        this.scroll = 0
        this.parts = []
        this.built = null
    }

    create() {
        const { width, height } = this.scale
        // Covers the play screen and swallows its clicks.
        this.add.rectangle(0, 0, width, height, COLORS.cardStroke).setOrigin(0).setInteractive()
        this.title = this.add
            .text(width / 2, TITLE_Y, "", { ...TEXT.label, fontSize: 36 })
            .setOrigin(0.5)
        const step = TAB_W + 12
        this.tabs = SECTIONS.map(
            ([section, name], i) =>
                new Button(
                    this,
                    width / 2 + (i - 1) * step,
                    TABS_Y,
                    TAB_W,
                    TAB_H,
                    name,
                    () => this.show(section),
                    { fontSize: 20 }
                )
        )
        new Button(this, width / 2, CLOSE_Y, BUTTON_W, BUTTON_H, "Close", () => this.close(), {
            fontSize: 22
        })
        this.input.on("wheel", (_p: unknown, _o: unknown, _dx: number, dy: number) => {
            if (this.section === "upgrades") this.scrollBy(Math.sign(dy))
        })
        this.input.keyboard!.on("keydown-ESC", () => {
            if (this.choosing !== null) this.back()
            else this.close()
        })
        this.refresh()
    }

    update() {
        this.refresh()
    }

    // ------------------------------------------------------------------------------------------

    private get state(): GameState {
        return this.data_.state()
    }

    private act(action: Action): void {
        if (this.data_.act(action)) this.refresh()
    }

    private close(): void {
        this.data_.close()
    }

    private show(section: Section): void {
        this.section = section
        this.choosing = null
        this.scroll = 0
        this.refresh()
    }

    private back(): void {
        this.choosing = null
        this.refresh()
    }

    private scrollBy(rows: number): void {
        const max = Math.max(0, this.state.upgrades.length - this.rowsShown())
        const next = Math.min(max, Math.max(0, this.scroll + rows))
        if (next === this.scroll) return
        this.scroll = next
        this.refresh()
    }

    private rowsShown(): number {
        return Math.floor((LIST_BOTTOM - TOP) / (ROW_H + ROW_GAP))
    }

    // Rebuilds the open section when anything it shows has changed.
    private refresh(): void {
        const state = this.state
        this.title.setText(shopTitleText(state))
        this.tabs.forEach((b, i) => b.setSelected(SECTIONS[i][0] === this.section))
        const key = JSON.stringify([
            this.section,
            this.choosing,
            this.cropId,
            this.amount,
            this.scroll,
            state.shop,
            state.upgrades,
            state.coins,
            state.lives,
            state.powerUps,
            state.inventory,
            state.fertilizer,
            state.ordersCompleted
        ])
        if (key === this.built) return
        this.built = key
        this.parts.forEach((p) => p.destroy())
        this.parts = []
        if (this.section === "shop") {
            if (this.choosing !== null) this.showTargets(state, this.choosing)
            else this.showStock(state)
        } else if (this.section === "storage") {
            this.showStorage(state)
        } else {
            this.showUpgrades(state)
        }
    }

    // ------------------------------------------------------------------------------------------
    // Shop section

    private showStock(state: GameState): void {
        const { width } = this.scale
        const stock = state.shop.stock ?? []
        const upgrades = stock.flatMap((it, i) => (it.kind === "upgrade" ? [i] : []))
        const others = stock.flatMap((it, i) => (it.kind !== "upgrade" ? [i] : []))
        const row1 = TOP + 20 + CARD_H / 2
        this.cardRow(state, upgrades, row1, CARD_H)
        const row2 = row1 + CARD_H / 2 + CARD_GAP + SMALL_H / 2
        this.cardRow(state, others, row2, SMALL_H)

        const restockY = row2 + SMALL_H / 2 + 70
        this.addButton(width / 2, restockY, 280, 76, restockText(state), canRestock(state), () =>
            this.act({ type: "restockShop" })
        )
        this.addText(width / 2, restockY + 64, freeRestockText(state), 20)
    }

    // One row of stock cards centred at height y.
    private cardRow(state: GameState, slots: number[], y: number, h: number): void {
        const { width } = this.scale
        const step = CARD_W + CARD_GAP
        const x0 = width / 2 - ((slots.length - 1) * step) / 2
        slots.forEach((slot, i) => {
            const item = state.shop.stock![slot]
            const x = x0 + i * step
            const frame =
                item.kind === "upgrade"
                    ? COLORS.tier[item.tier]
                    : item.kind === "powerUp"
                      ? COLORS.powerUp
                      : COLORS.eventTarget
            const maxed = isMaxed(state, slot, this.data_.crops)
            const faded = item.sold || maxed ? 0.5 : 1
            const box = this.add
                .rectangle(x, y, CARD_W, h, COLORS.card)
                .setStrokeStyle(STROKE, frame)
                .setAlpha(faded)
            const label = this.add
                .text(x, y - BUY_H / 2 - 4, shopItemText(state, slot), {
                    ...TEXT.body,
                    fontSize: 19,
                    align: "center",
                    lineSpacing: 6,
                    wordWrap: { width: CARD_W - 20 }
                })
                .setOrigin(0.5)
                .setAlpha(faded)
            this.parts.push(box, label)
            const buyY = y + h / 2 - BUY_H / 2 - 10
            const price = shopPriceText(state, slot, this.data_.crops)
            if (item.sold || maxed) {
                // SOLD or Maxed: a label where the button was.
                this.addText(x, buyY, price, 22)
                return
            }
            this.addButton(
                x,
                buyY,
                CARD_W - 30,
                BUY_H,
                price,
                canBuyAny(state, slot, this.data_.crops),
                () => {
                    if (!needsTarget(state, slot)) this.act({ type: "buyItem", slot })
                    else {
                        this.choosing = slot
                        this.refresh()
                    }
                }
            )
        })
    }

    // Second step for a targeted buy: one button per target, then Back.
    private showTargets(state: GameState, slot: number): void {
        const { width } = this.scale
        const item = state.shop.stock![slot]
        if (item.kind !== "upgrade" || item.sold) {
            this.choosing = null
            this.showStock(state)
            return
        }
        const def = UPGRADES.upgrades[item.id]
        const promote = def.kind === "instant"
        this.addText(
            width / 2,
            TOP + 60,
            promote ? "Choose an upgrade to promote" : targetTitle(def),
            30
        )
        const crops = this.data_.crops
        const targets = buyTargets(state, slot, crops).filter((t) => canBuy(state, slot, t, crops))
        const cols = 3
        const w = promote ? 210 : 160
        const stepX = w + 14
        targets.forEach((target: UpgradeTarget, i) => {
            const n = Math.min(cols, targets.length)
            const x = width / 2 - ((n - 1) * stepX) / 2 + (i % cols) * stepX
            const y = TOP + 160 + Math.floor(i / cols) * (BUTTON_H + 14)
            const text = promote
                ? promotionTargetText(state.upgrades[target as number])
                : targetText(target)
            this.addButton(
                x,
                y,
                w,
                BUTTON_H,
                text,
                true,
                () => {
                    this.choosing = null
                    this.act(
                        target === null
                            ? { type: "buyItem", slot }
                            : { type: "buyItem", slot, target }
                    )
                    this.refresh()
                },
                promote ? 16 : 20
            )
        })
        this.addButton(width / 2, LIST_BOTTOM - 40, BUTTON_W, BUTTON_H, "Back", true, () =>
            this.back()
        )
    }

    // ------------------------------------------------------------------------------------------
    // Storage section

    private showStorage(state: GameState): void {
        const { width } = this.scale
        const crops = this.data_.crops
        const ids = Object.keys(crops).sort()
        const held = state.inventory[this.cropId] ?? 0
        const amount = sellAmount(String(this.amount), held)
        const crop = crops[this.cropId]

        // Storage bar.
        const barW = width - 2 * MARGIN
        const barY = TOP + 30
        const full = isStorageFull(state)
        const track = this.add
            .rectangle(MARGIN, barY, barW, 30, COLORS.barTrack)
            .setOrigin(0, 0.5)
            .setStrokeStyle(2, COLORS.card)
        const fill = this.add
            .rectangle(
                MARGIN,
                barY,
                barW * storageFill(state),
                30,
                full ? COLORS.barUrgent : COLORS.barFill
            )
            .setOrigin(0, 0.5)
        this.parts.push(track, fill)
        this.addText(width / 2, barY, full ? `${storageText(state)}  FULL` : storageText(state), 20)

        // One button per crop; clicking one selects it.
        const cropW = 200
        const step = cropW + 14
        const x0 = width / 2 - ((ids.length - 1) * step) / 2
        ids.forEach((id, i) => {
            const b = this.addButton(
                x0 + i * step,
                TOP + 120,
                cropW,
                BUTTON_H,
                barnCropText(id, state),
                true,
                () => {
                    this.cropId = id
                    this.amount = 1
                    this.refresh()
                }
            )
            b.setSelected(id === this.cropId)
        })

        // - amount +
        const rowY = TOP + 220
        this.addButton(
            width / 2 - 110,
            rowY,
            70,
            BUTTON_H,
            "−",
            amount > 1,
            () => {
                this.amount = Math.max(1, amount - 1)
                this.refresh()
            },
            28
        )
        const amountBox = this.add
            .rectangle(width / 2, rowY, 110, BUTTON_H, COLORS.card)
            .setStrokeStyle(2, COLORS.cardStroke)
        const amountText = this.add
            .text(width / 2, rowY, String(held > 0 ? amount : 0), { ...TEXT.body, fontSize: 28 })
            .setOrigin(0.5)
        this.parts.push(amountBox, amountText)
        this.addButton(
            width / 2 + 110,
            rowY,
            70,
            BUTTON_H,
            "+",
            amount < held,
            () => {
                this.amount = Math.min(held, amount + 1)
                this.refresh()
            },
            28
        )

        // Sell, Sell all.
        const sellY = TOP + 310
        this.addButton(
            width / 2 - 125,
            sellY,
            230,
            BUTTON_H,
            sellButtonText(state, crop, amount),
            held > 0,
            () => {
                this.act({ type: "sellCrop", cropId: this.cropId, amount })
                this.amount = 1
                this.refresh()
            }
        )
        this.addButton(width / 2 + 125, sellY, 230, BUTTON_H, "Sell all", held > 0, () => {
            this.act({ type: "sellCrop", cropId: this.cropId, amount: held })
            this.amount = 1
            this.refresh()
        })

        // Make fertilizer.
        const allowed = fertilizerAllowed(state)
        this.addButton(
            width / 2,
            TOP + 410,
            300,
            BUTTON_H,
            makeFertilizerText(crop, allowed),
            allowed && held >= crop.fertilizerCost,
            () => this.act({ type: "makeFertilizer", cropId: this.cropId }),
            18
        )
    }

    // ------------------------------------------------------------------------------------------
    // Your upgrades section

    private showUpgrades(state: GameState): void {
        const { width } = this.scale
        if (state.upgrades.length === 0) {
            this.addText(width / 2, TOP + 60, "No upgrades yet", 24)
            return
        }
        const shown = this.rowsShown()
        const listW = width - 2 * MARGIN
        const sellW = 220
        state.upgrades.slice(this.scroll, this.scroll + shown).forEach((copy, row) => {
            const index = this.scroll + row
            const y = TOP + ROW_H / 2 + row * (ROW_H + ROW_GAP)
            const box = this.add
                .rectangle(MARGIN, y, listW, ROW_H, COLORS.card)
                .setOrigin(0, 0.5)
                .setStrokeStyle(4, COLORS.tier[copy.tier])
            const name = this.add
                .text(MARGIN + 16, y, ownedUpgradeText(copy), {
                    ...TEXT.body,
                    fontSize: 20,
                    wordWrap: { width: listW - sellW - 40 }
                })
                .setOrigin(0, 0.5)
            this.parts.push(box, name)
            this.addButton(
                width - MARGIN - sellW / 2 - 8,
                y,
                sellW,
                ROW_H - 12,
                sellRefundText(state, index),
                canSell(state, index),
                () => this.act({ type: "sellUpgrade", index }),
                17
            )
        })
        // Scroll buttons, past what fits (the mouse wheel scrolls too).
        if (state.upgrades.length > shown) {
            const y = LIST_BOTTOM + 30
            this.addButton(width / 2 - 70, y, 110, 44, "▲", this.scroll > 0, () =>
                this.scrollBy(-1)
            )
            this.addButton(
                width / 2 + 70,
                y,
                110,
                44,
                "▼",
                this.scroll + shown < state.upgrades.length,
                () => this.scrollBy(1)
            )
        }
    }

    // ------------------------------------------------------------------------------------------

    private addText(x: number, y: number, text: string, size: number): void {
        const t = this.add.text(x, y, text, { ...TEXT.label, fontSize: size }).setOrigin(0.5)
        this.parts.push(t)
    }

    private addButton(
        x: number,
        y: number,
        w: number,
        h: number,
        text: string,
        enabled: boolean,
        onClick: () => void,
        fontSize = 20
    ): Button {
        const b = new Button(this, x, y, w, h, text, onClick, { fontSize }).setEnabled(enabled)
        this.parts.push(b)
        return b
    }
}

export type { ShopData }
