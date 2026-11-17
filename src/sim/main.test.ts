import { describe, it, expect } from "vitest";
import { createGame, applyAction, step } from "./main";
import { buildCropTable, updateGrowth } from "./plot";
import { createOrder } from "./orders";
import { START_PLOTS, MAX_OPEN_ORDERS, ORDER_TICKS, TIMED_MODE_TICKS } from "./game_constants";
import type { Action, Crop, GameConfig, GameState, Order } from "./types";

const config: GameConfig = { mode: "survival", allowPowerUps: false };

const cropList: Crop[] = [
    { id: "garlic", growTicks: 80, yield: 2, value: 2 },
    { id: "carrot", growTicks: 150, yield: 2, value: 8 },
    { id: "pumpkin", growTicks: 250, yield: 5, value: 12 },
];
const crops = buildCropTable(cropList);

// A fresh game with some fields replaced, for setting up a test.
function makeState(overrides: Partial<GameState> = {}): GameState {
    return { ...createGame(1, config), ...overrides };
}

function makeOrder(overrides: Partial<Order> = {}): Order {
    return { id: 0, required: { carrot: 3 }, value: 24, expiresAt: 600, ...overrides };
}

// Applies an action that is expected to succeed.
function apply(state: GameState, action: Action): GameState {
    const next = applyAction(state, action, crops);
    if (next === null) throw new Error(`expected ${JSON.stringify(action)} to succeed`);
    return next;
}

describe("createGame", () => {
    it("starts with a fresh state", () => {
        const g = createGame(1, config);
        expect(g.mode).toBe("survival");
        expect(g.tick).toBe(0);
        expect(g.score).toBe(0);
        expect(g.status).toBe("running");
        expect(g.plots).toHaveLength(START_PLOTS);
        expect(g.plots.every((p) => p.state === "empty")).toBe(true);
        expect(g.orders).toEqual([]);
        expect(g.inventory).toEqual({});
        expect(g.nextOrderId).toBe(0);
        expect(g.ordersCompleted).toBe(0);
        expect(g.ordersFailed).toBe(0);
    });

    it("is reproducible from the same seed", () => {
        expect(createGame(7, config)).toEqual(createGame(7, config));
    });
});

describe("applyAction: every action", () => {
    // One valid example of each action, with a state it succeeds on.
    const cases: [string, GameState, Action][] = [
        ["plant", makeState({ tick: 5 }), { type: "plant", plot: 0, cropId: "carrot" }],
        [
            "harvest",
            makeState({ plots: [{ state: "ready", cropId: "carrot" }] }),
            { type: "harvest", plot: 0 },
        ],
        [
            "deliver",
            makeState({ orders: [makeOrder()], inventory: { carrot: 3 } }),
            { type: "deliver", orderId: 0 },
        ],
    ];

    it.each(cases)("%s succeeds on the setup state", (_, state, action) => {
        expect(applyAction(state, action, crops)).not.toBeNull();
    });

    it.each(cases)("%s returns null once the game has ended", (_, state, action) => {
        expect(applyAction({ ...state, status: "ended" }, action, crops)).toBeNull();
    });

    it.each(cases)("%s never changes the state passed in", (_, state, action) => {
        const before = structuredClone(state);
        applyAction(state, action, crops);
        expect(state).toEqual(before);
    });

    it.each(cases)("%s leaves tick and rngState unchanged", (_, state, action) => {
        const next = apply(state, action);
        expect(next.tick).toBe(state.tick);
        expect(next.rngState).toBe(state.rngState);
    });
});

describe("applyAction: plant", () => {
    it("plants on an empty plot at the current tick and leaves other plots alone", () => {
        const state = makeState({ tick: 42 });
        const next = apply(state, { type: "plant", plot: 2, cropId: "pumpkin" });
        expect(next.plots[2]).toEqual({ state: "growing", cropId: "pumpkin", plantedAt: 42 });
        for (const i of [0, 1, 3]) expect(next.plots[i]).toEqual(state.plots[i]);
        expect(next.inventory).toEqual(state.inventory);
        expect(next.score).toBe(state.score);
    });

    it("returns null for a busy plot", () => {
        const state = makeState({
            plots: [
                { state: "growing", cropId: "carrot", plantedAt: 0 },
                { state: "ready", cropId: "carrot" },
            ],
        });
        expect(applyAction(state, { type: "plant", plot: 0, cropId: "garlic" }, crops)).toBeNull();
        expect(applyAction(state, { type: "plant", plot: 1, cropId: "garlic" }, crops)).toBeNull();
    });

    it("returns null for an unknown crop", () => {
        expect(applyAction(makeState(), { type: "plant", plot: 0, cropId: "mango" }, crops)).toBeNull();
        expect(applyAction(makeState(), { type: "plant", plot: 0, cropId: "toString" }, crops)).toBeNull();
    });

    it.each([-1, START_PLOTS, 1.5, NaN])("returns null for plot index %s", (plot) => {
        expect(applyAction(makeState(), { type: "plant", plot, cropId: "carrot" }, crops)).toBeNull();
    });
});

describe("applyAction: harvest", () => {
    it("empties a ready plot and adds the yield to the inventory", () => {
        const state = makeState({ plots: [{ state: "empty" }, { state: "ready", cropId: "pumpkin" }] });
        const next = apply(state, { type: "harvest", plot: 1 });
        expect(next.plots[1]).toEqual({ state: "empty" });
        expect(next.inventory).toEqual({ pumpkin: crops.pumpkin.yield });
    });

    it("adds to crops already held and keeps other crops", () => {
        const state = makeState({
            plots: [{ state: "ready", cropId: "carrot" }],
            inventory: { carrot: 3, garlic: 1 },
        });
        const next = apply(state, { type: "harvest", plot: 0 });
        expect(next.inventory).toEqual({ carrot: 3 + crops.carrot.yield, garlic: 1 });
    });

    it("returns null for an empty or growing plot", () => {
        const state = makeState({
            plots: [{ state: "empty" }, { state: "growing", cropId: "carrot", plantedAt: 0 }],
        });
        expect(applyAction(state, { type: "harvest", plot: 0 }, crops)).toBeNull();
        expect(applyAction(state, { type: "harvest", plot: 1 }, crops)).toBeNull();
    });

    it.each([-1, START_PLOTS, 0.5])("returns null for plot index %s", (plot) => {
        expect(applyAction(makeState(), { type: "harvest", plot }, crops)).toBeNull();
    });
});

describe("applyAction: deliver", () => {
    it("fills the order: removes it, takes the crops, adds score and the counter", () => {
        const order = makeOrder({ id: 4, required: { carrot: 3 }, value: 24 });
        const state = makeState({ orders: [order], inventory: { carrot: 5, garlic: 2 }, score: 10 });
        const next = apply(state, { type: "deliver", orderId: 4 });
        expect(next.orders).toEqual([]);
        expect(next.inventory).toEqual({ carrot: 2, garlic: 2 });
        expect(next.score).toBe(34);
        expect(next.ordersCompleted).toBe(1);
        expect(next.ordersFailed).toBe(0);
        expect(next.nextOrderId).toBe(state.nextOrderId);
    });

    it("removes crops that drop to 0", () => {
        const state = makeState({ orders: [makeOrder()], inventory: { carrot: 3 } });
        expect(apply(state, { type: "deliver", orderId: 0 }).inventory).toEqual({});
    });

    it("leaves other orders in place and in order", () => {
        const a = makeOrder({ id: 1 });
        const b = makeOrder({ id: 2, required: { garlic: 2 }, value: 4 });
        const c = makeOrder({ id: 3 });
        const state = makeState({ orders: [a, b, c], inventory: { garlic: 2 } });
        expect(apply(state, { type: "deliver", orderId: 2 }).orders).toEqual([a, c]);
    });

    it("returns null when the inventory is short", () => {
        const state = makeState({ orders: [makeOrder()], inventory: { carrot: 2 } });
        expect(applyAction(state, { type: "deliver", orderId: 0 }, crops)).toBeNull();
    });

    it("returns null for an unknown order id", () => {
        const state = makeState({ orders: [makeOrder({ id: 0 })], inventory: { carrot: 9 } });
        expect(applyAction(state, { type: "deliver", orderId: 1 }, crops)).toBeNull();
    });

    it("returns null for an order delivered twice", () => {
        const state = makeState({ orders: [makeOrder()], inventory: { carrot: 9 } });
        const once = apply(state, { type: "deliver", orderId: 0 });
        expect(applyAction(once, { type: "deliver", orderId: 0 }, crops)).toBeNull();
    });

    it("allows delivery on the expiration tick and refuses it the tick after", () => {
        const order = makeOrder({ expiresAt: 60 });
        const state = makeState({ orders: [order], inventory: { carrot: 3 } });
        const deliver: Action = { type: "deliver", orderId: 0 };
        expect(applyAction({ ...state, tick: 59 }, deliver, crops)).not.toBeNull();
        expect(applyAction({ ...state, tick: 60 }, deliver, crops)).not.toBeNull();
        expect(applyAction({ ...state, tick: 61 }, deliver, crops)).toBeNull();
        expect(applyAction({ ...state, tick: 100 }, deliver, crops)).toBeNull();
    });
});

describe("applyAction: full flow", () => {
    it("plants, grows, harvests twice and fills an order", () => {
        let state = makeState({ orders: [makeOrder({ required: { carrot: 4 }, value: 32 })] });
        state = apply(state, { type: "plant", plot: 0, cropId: "carrot" });
        state = apply(state, { type: "plant", plot: 1, cropId: "carrot" });

        // Not ready yet: harvest is rejected.
        expect(applyAction(state, { type: "harvest", plot: 0 }, crops)).toBeNull();

        // Stand-in for step: move time forward and grow every plot.
        const tick = crops.carrot.growTicks;
        state = { ...state, tick, plots: state.plots.map((p) => updateGrowth(p, tick, crops)) };

        state = apply(state, { type: "harvest", plot: 0 });
        state = apply(state, { type: "harvest", plot: 1 });
        expect(state.inventory).toEqual({ carrot: 4 });

        state = apply(state, { type: "deliver", orderId: 0 });
        expect(state.orders).toEqual([]);
        expect(state.inventory).toEqual({});
        expect(state.score).toBe(32);
        expect(state.ordersCompleted).toBe(1);
        expect(state.plots.every((p) => p.state === "empty")).toBe(true);
    });
});

// Calls step n times.
function stepN(state: GameState, n: number): GameState {
    for (let i = 0; i < n; i++) state = step(state, crops);
    return state;
}

describe("step: tick and rules", () => {
    it("increases tick by 1", () => {
        const state = makeState({ tick: 41 });
        expect(step(state, crops).tick).toBe(42);
    });

    it("never changes the state passed in", () => {
        const state = makeState({
            plots: [{ state: "growing", cropId: "garlic", plantedAt: 0 }],
            orders: [makeOrder({ expiresAt: 0 }), makeOrder({ id: 1, expiresAt: 900 })],
            nextOrderId: 2,
            tick: 79,
        });
        const before = structuredClone(state);
        step(state, crops);
        expect(state).toEqual(before);
    });

    it("leaves inventory, score and ordersCompleted alone", () => {
        const state = makeState({ inventory: { carrot: 3 }, score: 50, ordersCompleted: 2 });
        const next = stepN(state, 700);
        expect(next.inventory).toEqual({ carrot: 3 });
        expect(next.score).toBe(50);
        expect(next.ordersCompleted).toBe(2);
    });

    it("returns the state unchanged once the game has ended", () => {
        const state = makeState({ status: "ended", tick: 10 });
        expect(step(state, crops)).toBe(state);
    });

    it("gives an equal state from the same seed after many steps", () => {
        const a = stepN(createGame(9, config), 2000);
        const b = stepN(createGame(9, config), 2000);
        expect(a).toEqual(b);
        expect(a.ordersFailed).toBeGreaterThan(0);
    });
});

describe("step: growth", () => {
    it("makes a crop ready exactly growTicks after planting", () => {
        let state = makeState({ tick: 10 });
        state = apply(state, { type: "plant", plot: 0, cropId: "garlic" });
        state = stepN(state, crops.garlic.growTicks - 1);
        expect(state.plots[0].state).toBe("growing");
        state = step(state, crops);
        expect(state.tick).toBe(10 + crops.garlic.growTicks);
        expect(state.plots[0]).toEqual({ state: "ready", cropId: "garlic" });
    });

    it("leaves empty and ready plots alone", () => {
        const plots: GameState["plots"] = [{ state: "empty" }, { state: "ready", cropId: "pumpkin" }];
        const next = step(makeState({ plots }), crops);
        expect(next.plots).toEqual(plots);
    });
});

describe("step: orders", () => {
    it("fills up to MAX_OPEN_ORDERS orders on the first step", () => {
        const state = createGame(3, config);
        const next = step(state, crops);

        // Build the expected orders the same way step should.
        let rng = state.rngState;
        const expected: Order[] = [];
        for (let id = 0; id < MAX_OPEN_ORDERS; id++) {
            const [order, after] = createOrder(id, 1, rng, crops);
            expected.push(order);
            rng = after;
        }

        expect(next.orders).toEqual(expected);
        expect(next.orders.every((o) => o.expiresAt === 1 + ORDER_TICKS)).toBe(true);
        expect(next.nextOrderId).toBe(MAX_OPEN_ORDERS);
        expect(next.rngState).toBe(rng);
    });

    it("never opens more than MAX_OPEN_ORDERS orders", () => {
        let state = createGame(5, config);
        for (let i = 0; i < 2000; i++) {
            state = step(state, crops);
            expect(state.orders.length).toBeLessThanOrEqual(MAX_OPEN_ORDERS);
        }
    });

    it("keeps an order open on its expiresAt tick and fails it on the tick after", () => {
        const order = makeOrder({ id: 0, expiresAt: 60 });
        const other = makeOrder({ id: 1, expiresAt: 900 });
        let state = makeState({ tick: 59, orders: [order, other], nextOrderId: 2 });

        state = step(state, crops); // tick 60
        expect(state.orders.map((o) => o.id)).toEqual([0, 1]);
        expect(state.ordersFailed).toBe(0);

        state = step(state, crops); // tick 61
        expect(state.ordersFailed).toBe(1);
        expect(state.orders.find((o) => o.id === 0)).toBeUndefined();
    });

    it("replaces a failed order on the same step and keeps the others in order", () => {
        const a = makeOrder({ id: 0, expiresAt: 900 });
        const b = makeOrder({ id: 1, expiresAt: 60 });
        const state = makeState({ tick: 60, orders: [a, b], nextOrderId: 2 });
        const next = step(state, crops);
        expect(next.orders).toHaveLength(MAX_OPEN_ORDERS);
        expect(next.orders[0]).toEqual(a);
        expect(next.orders[1].id).toBe(2);
        expect(next.orders[1].expiresAt).toBe(61 + ORDER_TICKS);
        expect(next.nextOrderId).toBe(3);
    });

    it("replaces a delivered order on the next step", () => {
        let state = step(createGame(4, config), crops);
        const target = state.orders[0];
        state = { ...state, inventory: { ...target.required } };
        state = apply(state, { type: "deliver", orderId: target.id });
        expect(state.orders).toHaveLength(MAX_OPEN_ORDERS - 1);

        state = step(state, crops);
        expect(state.orders).toHaveLength(MAX_OPEN_ORDERS);
        expect(state.orders[state.orders.length - 1].id).toBe(MAX_OPEN_ORDERS);
        expect(state.ordersFailed).toBe(0);
    });
});

describe("step: end of run", () => {
    const timed: GameConfig = { mode: "timed", allowPowerUps: false };

    it("ends a Timed run on tick TIMED_MODE_TICKS", () => {
        let state = stepN(createGame(2, timed), TIMED_MODE_TICKS - 1);
        expect(state.status).toBe("running");

        const before = state;
        state = step(state, crops);
        expect(state.tick).toBe(TIMED_MODE_TICKS);
        expect(state.status).toBe("ended");
        // No new orders on the ending step.
        expect(state.nextOrderId).toBe(before.nextOrderId);
        expect(state.rngState).toBe(before.rngState);
    });

    it("changes nothing after a Timed run ends, and refuses actions", () => {
        const ended = stepN(createGame(2, timed), TIMED_MODE_TICKS);
        expect(step(ended, crops)).toBe(ended);
        expect(applyAction(ended, { type: "plant", plot: 0, cropId: "garlic" }, crops)).toBeNull();
    });

    it("does not end a Survival run by time", () => {
        const state = stepN(createGame(2, config), TIMED_MODE_TICKS + 10);
        expect(state.status).toBe("running");
    });
});

describe("step with applyAction", () => {
    it("allows harvesting on the same tick step makes a crop ready", () => {
        let state = apply(makeState(), { type: "plant", plot: 0, cropId: "garlic" });
        state = stepN(state, crops.garlic.growTicks);
        state = apply(state, { type: "harvest", plot: 0 });
        expect(state.inventory).toEqual({ garlic: crops.garlic.yield });
    });

    it("allows delivery on the expiresAt tick, but not after the next step", () => {
        const order = makeOrder({ id: 0, expiresAt: 60 });
        const state = step(makeState({ tick: 59, orders: [order], inventory: { carrot: 3 }, nextOrderId: 1 }), crops);
        expect(state.tick).toBe(60);
        expect(applyAction(state, { type: "deliver", orderId: 0 }, crops)).not.toBeNull();
        expect(applyAction(step(state, crops), { type: "deliver", orderId: 0 }, crops)).toBeNull();
    });
});
