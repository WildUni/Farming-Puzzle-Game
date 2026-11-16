import { RunData } from "./types"

function calc_score(data: RunData): number {
    return data.points + data.orders_completed * 10
}

export {
    calc_score
}