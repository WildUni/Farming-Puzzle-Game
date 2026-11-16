import { run_data } from "./custom_types"

function calc_score(data: run_data): number {
    return data.points + data.orders_completed * 10
}

export {
    calc_score
}