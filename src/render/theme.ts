// Visual constants shared by the views: spacing, colors and text styles.
import type { GameObjects, Scene } from "phaser"
import type { Plot, Tier } from "../sim/types"

type TextStyle = Phaser.Types.GameObjects.Text.TextStyle

const MARGIN = 20

const COLORS = {
    background: 0x9ccc65,
    card: 0xfff4d6,
    cardStroke: 0x5a3e1b,
    ready: 0x2e9e3a, // outline on an order card that can be filled now
    table: 0xffffff,
    tableStroke: 0x333333,
    plot: { empty: 0x8b5a2b, growing: 0x6b8e23, ready: 0xe8b923 } satisfies Record<
        Plot["state"],
        number
    >,
    plotStroke: 0x2e1f0e,
    highlight: 0xffffff,
    button: 0x4e7d2a,
    buttonHover: 0x659c38,
    buttonDisabled: 0x7a7a6e, // a button that can't be used right now
    barTrack: 0x3b2a14, // empty part of a progress or countdown bar
    barFill: 0x7fd34e, // growth and countdown bar
    barUrgent: 0xd8342c, // countdown bar in an order's last quarter
    shade: 0x000000, // dims the board while paused
    // Frame of an upgrade card, by tier.
    tier: {
        common: 0x8a8a8a,
        uncommon: 0x3c9a3c,
        rare: 0x2f6fd6,
        epic: 0x8e3fc7,
        legendary: 0xe08a12
    } satisfies Record<Tier, number>
}

const TEXT: Record<"body" | "label" | "title" | "debug", TextStyle> = {
    body: { fontFamily: "Arial", fontSize: 16, color: "#222222" },
    label: {
        fontFamily: "Arial",
        fontSize: 20,
        color: "#ffffff",
        align: "center",
        stroke: "#000000",
        strokeThickness: 3
    },
    title: {
        fontFamily: "Arial",
        fontSize: 20,
        color: "#ffffff",
        stroke: "#000000",
        strokeThickness: 3
    },
    debug: {
        fontFamily: "monospace",
        fontSize: 16,
        color: "#ffffff",
        backgroundColor: "#000000aa",
        padding: { x: 6, y: 4 }
    }
}

// Background image scaled to cover the whole canvas, keeping its aspect ratio.
function addBackground(scene: Scene): GameObjects.Image {
    const { width, height } = scene.scale
    const bg = scene.add.image(width / 2, height / 2, "background")
    return bg.setScale(Math.max(width / bg.width, height / bg.height))
}

export { MARGIN, COLORS, TEXT, addBackground }
