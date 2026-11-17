// Visual constants shared by the views: spacing, colors and text styles.
import type { Plot } from "../sim/types"

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
    buttonHover: 0x659c38
}

const TEXT: Record<"body" | "label" | "title", TextStyle> = {
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
    }
}

export { MARGIN, COLORS, TEXT }
