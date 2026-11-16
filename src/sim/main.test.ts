import { describe, it, expect } from "vitest";
import createGame from "./main";
import { START_PLOTS } from "./game_constants";
import type { GameConfig } from "./types";

const config: GameConfig = { gameMode: "classic", allowPowerUps: false };

describe("createGame", () => {
    it("starts with a fresh state", () => {
        const g = createGame(1, config);
        expect(g.mode).toBe("classic");
        expect(g.tick).toBe(0);
        expect(g.score).toBe(0);
        expect(g.plots).toBe(START_PLOTS);
        expect(g.orders).toEqual([]);
        expect(g.inventory.size).toBe(0);
    });

    it("is reproducible from the same seed", () => {
        expect(createGame(7, config)).toEqual(createGame(7, config));
    });
});
