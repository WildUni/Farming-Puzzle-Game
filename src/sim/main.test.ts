import { describe, it, expect } from "vitest";
import createGame, { applyAction } from "./main";
import { buildCropTable, updateGrowth } from "./plot";
import { START_PLOTS } from "./game_constants";
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

    it("returns null for an expired order still in the list", () => {
        const order = makeOrder({ expiresAt: 600 });
        const state = makeState({ orders: [order], inventory: { carrot: 3 } });
        expect(applyAction({ ...state, tick: 599 }, { type: "deliver", orderId: 0 }, crops)).not.toBeNull();
        expect(applyAction({ ...state, tick: 600 }, { type: "deliver", orderId: 0 }, crops)).toBeNull();
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
