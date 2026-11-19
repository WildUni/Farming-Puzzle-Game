import type { OrderRules } from "./types"

//Game Loop
const TICKS_PER_SECOND = 10
const TIMED_MODE_TIMELIMIT = 300 //in seconds
const TIMED_MODE_TICKS = TICKS_PER_SECOND * TIMED_MODE_TIMELIMIT

//Player
const START_PLOTS = 4

//Orders
const ORDER_TIMELIMIT = 60 //in seconds
const ORDER_TICKS = TICKS_PER_SECOND * ORDER_TIMELIMIT
const ORDER_MIN_AMOUNT = 2
const ORDER_MAX_AMOUNT = 6
const MAX_OPEN_ORDERS = 2 //step keeps this many orders open

// Fixed order rules for Timed and Puzzle. Survival reads its rules from difficulty.json.
const DEFAULT_ORDER_RULES: OrderRules = {
    maxOpenOrders: MAX_OPEN_ORDERS,
    orderTicks: ORDER_TICKS,
    minAmount: ORDER_MIN_AMOUNT,
    maxAmount: ORDER_MAX_AMOUNT
}

export {
    DEFAULT_ORDER_RULES,
    TICKS_PER_SECOND,
    TIMED_MODE_TICKS,
    START_PLOTS,
    ORDER_TICKS,
    ORDER_MIN_AMOUNT,
    ORDER_MAX_AMOUNT,
    MAX_OPEN_ORDERS
}
