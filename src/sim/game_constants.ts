import type { OrderRules, Tier } from "./types"

//Game Loop
const TICKS_PER_SECOND = 10

//Player
const START_PLOTS = 4

//Orders
const ORDER_TIMELIMIT = 60 //in seconds
const ORDER_TICKS = TICKS_PER_SECOND * ORDER_TIMELIMIT
const ORDER_MIN_AMOUNT = 2
const ORDER_MAX_AMOUNT = 6
const MAX_OPEN_ORDERS = 2 //step keeps this many orders open

//Upgrades
const ORDERS_PER_UPGRADE = 10 //an upgrade offer comes after every this many filled orders
const UPGRADE_CHOICES = 3 //upgrades shown on one offer
// Upgrade tiers, weakest first. Tiered upgrades list one amount per tier in this order.
const TIERS: readonly Tier[] = ["common", "uncommon", "rare", "epic", "legendary"]

// Fixed order rules for Timed and Puzzle (Timed overrides maxOpenOrders from modes.json).
// Survival reads its rules from difficulty.json.
const DEFAULT_ORDER_RULES: OrderRules = {
    maxOpenOrders: MAX_OPEN_ORDERS,
    orderTicks: ORDER_TICKS,
    minAmount: ORDER_MIN_AMOUNT,
    maxAmount: ORDER_MAX_AMOUNT
}

export {
    DEFAULT_ORDER_RULES,
    TICKS_PER_SECOND,
    START_PLOTS,
    ORDER_TICKS,
    ORDER_MIN_AMOUNT,
    ORDER_MAX_AMOUNT,
    MAX_OPEN_ORDERS,
    ORDERS_PER_UPGRADE,
    UPGRADE_CHOICES,
    TIERS
}
