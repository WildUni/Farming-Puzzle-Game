// Order cards stacked down from the top-left corner, one per open order.
// Reports clicks by order id. A card is outlined when there are enough crops to fill it.
// A countdown bar along the bottom shrinks with the time left and turns red in the last quarter;
// Fog hides it. With Sneak peek, a dimmed card under the others shows the next order. While an
// order power-up is being aimed, the cards it can fill are outlined and the rest dimmed.
// Past ROWS orders (a rush wave), cards narrow into two columns, filled top to bottom, so the
// first orders keep their place and the extra ones start a new column. A card grows past CARD_H
// when its text needs more room (a Giant order lists a line per crop); the cards under it in its
// column move down.
// Cards slide: a new order's card comes in from the left, one that left slides out to the left
// (green when filled, red when failed), and cards that move up the stack glide there.
import { GameObjects, Scene, Tweens } from "phaser"
import type { GameState, Order } from "../../sim/types"
import { canFulfill } from "../../sim/orders"
import {
    isFogged,
    nextOrderText,
    orderText,
    orderTimeFraction,
    isOrderUrgent,
    ordersFrozen
} from "../format"
import { orderChanges } from "../cues"
import { MARGIN, COLORS, TEXT } from "../theme"

const CARD_W = 300
const NARROW_W = 220 // card width in two columns; both fit left of the stats table
const CARD_H = 100
const CARD_GAP = 10
const ROWS = 3 // rows in one column; more orders than this switch to two columns
const BAR_PAD = 10
const BAR_H = 10
const TEXT_TOP = 8 // label's offset from the card's top
const TEXT_GAP = 6 // least room between the label and the countdown bar
const SLIDE_MS = 260
const GLIDE_MS = 180

// Rows in one column for `count` cards.
function rowsFor(count: number): number {
    return count <= ROWS ? count : Math.max(ROWS, Math.ceil(count / 2))
}

// Top-left corner and width of card `i`, given every card's height. Cards stack down their
// column by their own heights.
function cardSlot(i: number, heights: number[]): { x: number; y: number; w: number } {
    const count = heights.length
    const rows = rowsFor(count)
    const col = Math.floor(i / rows)
    let y = MARGIN
    for (let j = col * rows; j < i; j++) y += heights[j] + CARD_GAP
    if (count <= ROWS) return { x: MARGIN, y, w: CARD_W }
    return { x: MARGIN + col * (NARROW_W + CARD_GAP), y, w: NARROW_W }
}

// A card's height: CARD_H, or more when a label this tall would run into the countdown bar.
function cardHeight(labelHeight: number): number {
    return Math.max(CARD_H, TEXT_TOP + labelHeight + TEXT_GAP + BAR_H + BAR_PAD)
}

// Lowest card bottom over every column, for the Sneak peek card underneath.
function stackBottom(heights: number[]): number {
    if (heights.length === 0) return MARGIN
    const rows = rowsFor(heights.length)
    let bottom = MARGIN
    for (let start = 0; start < heights.length; start += rows) {
        const column = heights.slice(start, start + rows)
        bottom = Math.max(bottom, MARGIN + column.reduce((sum, h) => sum + h + CARD_GAP, 0))
    }
    return bottom
}

type Rect = { x: number; y: number; w: number; h: number }

type Card = {
    layout: Rect // where update placed the card; offset by dx, dy while it slides
    dx: number
    dy: number
    slide: Tweens.Tween | null
    box: GameObjects.Rectangle
    label: GameObjects.Text
    track: GameObjects.Rectangle // countdown bar background
    bar: GameObjects.Rectangle // countdown bar, shrinks as time runs out
}

export class OrdersView {
    private scene: Scene
    private onClick: (orderId: number) => void
    private cards: Card[] = []
    private shownIds: number[] = [] // order id on each visible card, by card index
    private shownOrders: Order[] = [] // the orders the cards showed last update
    private left = new Map<number, Rect>() // cards of orders that left on the last update
    private peekBox: GameObjects.Rectangle
    private peekLabel: GameObjects.Text

    constructor(scene: Scene, onClick: (orderId: number) => void) {
        this.scene = scene
        this.onClick = onClick
        this.peekBox = scene.add
            .rectangle(MARGIN, MARGIN, CARD_W, CARD_H, COLORS.card)
            .setOrigin(0)
            .setAlpha(0.55)
            .setStrokeStyle(2, COLORS.cardStroke)
        this.peekLabel = scene.add.text(MARGIN + 10, MARGIN + 8, "", TEXT.body).setAlpha(0.8)
    }

    // `preview` is the Sneak peek order, or null. `targets` lists the order ids an order
    // power-up can be used on while the player is choosing one, else null.
    update(state: GameState, preview: Order | null = null, targets: number[] | null = null): void {
        // Cards are kept and hidden rather than destroyed, so the count only ever grows.
        while (this.cards.length < state.orders.length) this.cards.push(this.makeCard())

        // Where each order's card was, before the cards are reused for the new list.
        const before = new Map<number, Rect>()
        this.shownIds.forEach((id, i) => before.set(id, this.cards[i].layout))
        const changes = orderChanges(this.shownOrders, state.orders, state.tick)
        this.left = new Map()
        for (const { id, failed } of changes.removed) {
            this.left.set(id, before.get(id)!)
            this.slideOut(this.cards[this.shownIds.indexOf(id)], failed)
        }
        const added = new Set(changes.added)
        this.shownOrders = state.orders
        this.shownIds = state.orders.map((o) => o.id)
        const frozen = ordersFrozen(state)
        const fog = isFogged(state)
        // Text first, so each card's height is known before any card is placed.
        const heights = state.orders.map((order, i) => {
            const label = this.cards[i].label
            label.setText(orderText(order, state))
            return cardHeight(label.height)
        })
        this.cards.forEach((card, i) => {
            const order = state.orders[i]
            const visible = order !== undefined
            for (const part of [card.box, card.label, card.track, card.bar])
                part.setVisible(visible)
            if (!visible) return
            const { x, y, w } = cardSlot(i, heights)
            const h = heights[i]
            const barW = w - BAR_PAD * 2
            const from = before.get(order.id)
            card.layout = { x, y, w, h }
            card.box.setSize(w, h)
            card.box.input?.hitArea.setSize(w, h)
            card.track.setSize(barW, BAR_H)
            if (added.has(order.id)) this.slideFrom(card, -(x + w), 0, SLIDE_MS)
            else if (from !== undefined && (from.x !== x || from.y !== y))
                this.slideFrom(card, from.x - x, from.y - y, GLIDE_MS)
            this.place(card)
            card.track.setVisible(!fog)
            card.bar.setVisible(!fog)
            const isTarget = targets !== null && targets.includes(order.id)
            const alpha = targets !== null && !isTarget ? 0.45 : 1
            for (const part of [card.box, card.label, card.track, card.bar]) part.setAlpha(alpha)
            card.box.setFillStyle(order.rush ? COLORS.rushCard : COLORS.card)
            card.bar.setSize(barW * orderTimeFraction(order, state.tick), BAR_H)
            card.bar.setFillStyle(
                frozen
                    ? COLORS.barFrozen
                    : isOrderUrgent(order, state.tick)
                      ? COLORS.barUrgent
                      : COLORS.barFill
            )
            if (isTarget) card.box.setStrokeStyle(4, COLORS.highlight)
            else if (canFulfill(order, state.inventory)) card.box.setStrokeStyle(4, COLORS.ready)
            else card.box.setStrokeStyle(2, COLORS.cardStroke)
        })

        const peek = preview !== null
        this.peekBox.setVisible(peek)
        this.peekLabel.setVisible(peek)
        if (peek) {
            const y = stackBottom(heights)
            this.peekBox.setY(y)
            this.peekLabel.setY(y + TEXT_TOP)
            this.peekLabel.setText(nextOrderText(preview))
        }
    }

    // Where the card of an order that left on the last update was, or undefined. The floating
    // score starts there.
    leftCard(orderId: number): Rect | undefined {
        return this.left.get(orderId)
    }

    // Starts the card offset by (dx, dy) and eases it back to its layout spot.
    private slideFrom(card: Card, dx: number, dy: number, ms: number): void {
        card.slide?.stop()
        card.dx = dx
        card.dy = dy
        card.slide = this.scene.tweens.add({
            targets: card,
            dx: 0,
            dy: 0,
            duration: ms,
            ease: "Cubic.Out",
            onUpdate: () => this.place(card),
            onComplete: () => {
                card.slide = null
                this.place(card)
            }
        })
    }

    // Puts the card's parts at its layout spot plus the slide offset.
    private place(card: Card): void {
        const { h } = card.layout
        const x = card.layout.x + card.dx
        const y = card.layout.y + card.dy
        const barY = y + h - BAR_PAD - BAR_H
        card.box.setPosition(x, y)
        card.label.setPosition(x + 10, y + TEXT_TOP)
        card.track.setPosition(x + BAR_PAD, barY)
        card.bar.setPosition(x + BAR_PAD, barY)
    }

    // A copy of the card as it was slides off to the left and fades, so the card itself can
    // show another order at once.
    private slideOut(card: Card, failed: boolean): void {
        const { w, h } = card.layout
        const x = card.layout.x + card.dx
        const y = card.layout.y + card.dy
        const box = this.scene.add
            .rectangle(x, y, w, h, card.box.fillColor)
            .setOrigin(0)
            .setStrokeStyle(4, failed ? COLORS.barUrgent : COLORS.ready)
        const label = this.scene.add.text(x + 10, y + TEXT_TOP, card.label.text, TEXT.body)
        this.scene.tweens.add({
            targets: [box, label],
            x: `-=${x + w + MARGIN}`,
            alpha: 0,
            duration: SLIDE_MS,
            ease: "Cubic.In",
            onComplete: () => {
                box.destroy()
                label.destroy()
            }
        })
    }

    // Cards are placed by update (cardSlot), since their spot depends on how many are open.
    private makeCard(): Card {
        const i = this.cards.length
        const { x, y, w } = cardSlot(
            i,
            Array.from({ length: i + 1 }, () => CARD_H)
        )
        const box = this.scene.add
            .rectangle(x, y, w, CARD_H, COLORS.card)
            .setOrigin(0)
            .setInteractive({ useHandCursor: true })
            .on("pointerdown", () => {
                // Hidden cards can still catch clicks, so check a card is showing an order.
                const id = this.shownIds[i]
                if (id !== undefined) this.onClick(id)
            })
        const label = this.scene.add.text(x + 10, y + TEXT_TOP, "", TEXT.body)
        const barY = y + CARD_H - BAR_PAD - BAR_H
        const barW = w - BAR_PAD * 2
        const track = this.scene.add
            .rectangle(x + BAR_PAD, barY, barW, BAR_H, COLORS.barTrack)
            .setOrigin(0)
        const bar = this.scene.add
            .rectangle(x + BAR_PAD, barY, barW, BAR_H, COLORS.barFill)
            .setOrigin(0)
        return { layout: { x, y, w, h: CARD_H }, dx: 0, dy: 0, slide: null, box, label, track, bar }
    }
}
