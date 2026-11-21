// Order cards stacked down from the top-left corner, one per open order.
// Reports clicks by order id. A card is outlined when there are enough crops to fill it.
// A countdown bar along the bottom shrinks with the time left and turns red in the last quarter;
// Fog hides it. With Sneak peek, a dimmed card under the others shows the next order. While an
// order power-up is being aimed, the cards it can fill are outlined and the rest dimmed.
import { GameObjects, Scene } from "phaser"
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
import { MARGIN, COLORS, TEXT } from "../theme"

const CARD_W = 300
const CARD_H = 100
const CARD_GAP = 10
const BAR_PAD = 10
const BAR_H = 10
const BAR_W = CARD_W - BAR_PAD * 2

type Card = {
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

        this.shownIds = state.orders.map((o) => o.id)
        const frozen = ordersFrozen(state)
        const fog = isFogged(state)
        this.cards.forEach((card, i) => {
            const order = state.orders[i]
            const visible = order !== undefined
            for (const part of [card.box, card.label, card.track, card.bar])
                part.setVisible(visible)
            if (!visible) return
            card.track.setVisible(!fog)
            card.bar.setVisible(!fog)
            const isTarget = targets !== null && targets.includes(order.id)
            const alpha = targets !== null && !isTarget ? 0.45 : 1
            for (const part of [card.box, card.label, card.track, card.bar]) part.setAlpha(alpha)
            card.label.setText(orderText(order, state))
            card.bar.width = BAR_W * orderTimeFraction(order, state.tick)
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
            const y = MARGIN + state.orders.length * (CARD_H + CARD_GAP)
            this.peekBox.setY(y)
            this.peekLabel.setY(y + 8)
            this.peekLabel.setText(nextOrderText(preview))
        }
    }

    private makeCard(): Card {
        const i = this.cards.length
        const y = MARGIN + i * (CARD_H + CARD_GAP)
        const box = this.scene.add
            .rectangle(MARGIN, y, CARD_W, CARD_H, COLORS.card)
            .setOrigin(0)
            .setInteractive({ useHandCursor: true })
            .on("pointerdown", () => {
                // Hidden cards can still catch clicks, so check a card is showing an order.
                const id = this.shownIds[i]
                if (id !== undefined) this.onClick(id)
            })
        const label = this.scene.add.text(MARGIN + 10, y + 8, "", TEXT.body)
        const barY = y + CARD_H - BAR_PAD - BAR_H
        const track = this.scene.add
            .rectangle(MARGIN + BAR_PAD, barY, BAR_W, BAR_H, COLORS.barTrack)
            .setOrigin(0)
        const bar = this.scene.add
            .rectangle(MARGIN + BAR_PAD, barY, BAR_W, BAR_H, COLORS.barFill)
            .setOrigin(0)
        return { box, label, track, bar }
    }
}
