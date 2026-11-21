// Order cards stacked down from the top-left corner, one per open order.
// Reports clicks by order id. A card is outlined when there are enough crops to fill it.
// A countdown bar along the bottom shrinks with the time left and turns red in the last quarter.
import { GameObjects, Scene } from "phaser"
import type { GameState } from "../../sim/types"
import { canFulfill } from "../../sim/orders"
import { orderText, orderTimeFraction, isOrderUrgent, ordersFrozen } from "../format"
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

    constructor(scene: Scene, onClick: (orderId: number) => void) {
        this.scene = scene
        this.onClick = onClick
    }

    update(state: GameState): void {
        // Cards are kept and hidden rather than destroyed, so the count only ever grows.
        while (this.cards.length < state.orders.length) this.cards.push(this.makeCard())

        this.shownIds = state.orders.map((o) => o.id)
        const frozen = ordersFrozen(state)
        this.cards.forEach((card, i) => {
            const order = state.orders[i]
            const visible = order !== undefined
            for (const part of [card.box, card.label, card.track, card.bar])
                part.setVisible(visible)
            if (!visible) return
            card.label.setText(orderText(order, state))
            card.bar.width = BAR_W * orderTimeFraction(order, state.tick)
            card.bar.setFillStyle(
                frozen
                    ? COLORS.barFrozen
                    : isOrderUrgent(order, state.tick)
                      ? COLORS.barUrgent
                      : COLORS.barFill
            )
            if (canFulfill(order, state.inventory)) card.box.setStrokeStyle(4, COLORS.ready)
            else card.box.setStrokeStyle(2, COLORS.cardStroke)
        })
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
