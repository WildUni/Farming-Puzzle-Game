import { describe, it, expect } from "vitest";
import createGame from "./main";
import { START_PLOTS } from "./game_constants";
import type { GameConfig } from "./types";

const config: GameConfig = { mode: "survival", allowPowerUps: false };

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
