// Order cards stacked down from the top-left corner, one per open order.
// Reports clicks by order id. A card is outlined when there are enough crops to fill it.
import { GameObjects, Scene } from "phaser"
import type { GameState } from "../../sim/types"
import { canFulfill } from "../../sim/orders"
import { orderText } from "../format"
import { MARGIN, COLORS, TEXT } from "../theme"

const CARD_W = 300
const CARD_H = 90
const CARD_GAP = 10

type Card = { box: GameObjects.Rectangle; label: GameObjects.Text }

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
        this.cards.forEach((card, i) => {
            const order = state.orders[i]
            const visible = order !== undefined
            card.box.setVisible(visible)
            card.label.setVisible(visible)
            if (!visible) return
            card.label.setText(orderText(order, state))
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
        return { box, label }
    }
}
