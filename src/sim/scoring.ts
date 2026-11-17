import { RunData } from "./types"

function calcScore(data: RunData): number {
    return data.points + data.orders_completed * 10
}

export { calcScore }
