// The game hub's art: loading it, cutting the sprite sheets into named frames, and drawing
// the resizable frames as nine-slices.
import type { GameObjects, Scene } from "phaser"
import banner from "../assets/PlotRush/Plot-Rush-Menu-Assets/background/gamehub_banner.png"
import frames from "../assets/PlotRush/Plot-Rush-Menu-Assets/ui/gamehub_frames.png"
import icons from "../assets/PlotRush/Plot-Rush-Menu-Assets/icons/gamehub_icons.png"
import navBar from "../assets/PlotRush/Plot-Rush-Menu-Assets/ui/Warm wood four-slot navigation bar.png"
import tab from "../assets/PlotRush/Plot-Rush-Menu-Assets/ui/Sunny yellow rounded tab sprite.png"
import hubOn from "../assets/PlotRush/Plot-Rush-Menu-Assets/icons/icon-hub-selected.png"
import hubOff from "../assets/PlotRush/Plot-Rush-Menu-Assets/icons/icon-hub-unselected.png"
import inventoryOn from "../assets/PlotRush/Plot-Rush-Menu-Assets/icons/icon-inventory-selected.png"
import inventoryOff from "../assets/PlotRush/Plot-Rush-Menu-Assets/icons/icon-inventory-unselected.png"
import storeOn from "../assets/PlotRush/Plot-Rush-Menu-Assets/icons/icon-store-selected.png"
import storeOff from "../assets/PlotRush/Plot-Rush-Menu-Assets/icons/icon-store-unselected.png"
import profileOn from "../assets/PlotRush/Plot-Rush-Menu-Assets/icons/icon-profile-selected.png"
import profileOff from "../assets/PlotRush/Plot-Rush-Menu-Assets/icons/icon-profile-unselected.png"

type Rect = [x: number, y: number, w: number, h: number]

// Where each sprite sits in its sheet, in sheet pixels (measured from the alpha channel).
const FRAME_RECTS = {
    plank: [38, 90, 715, 237],
    pill: [774, 90, 731, 237],
    cardSelected: [33, 400, 718, 297],
    card: [784, 402, 719, 291],
    locked: [33, 771, 716, 173],
    play: [780, 758, 723, 190]
} satisfies Record<string, Rect>

const ICON_RECTS = {
    trophy: [18, 57, 415, 378],
    timer: [494, 32, 340, 417],
    puzzle: [945, 55, 363, 366],
    calendar: [1364, 55, 373, 375],
    lock: [71, 493, 300, 358],
    gear: [483, 491, 363, 369],
    star: [923, 494, 364, 353],
    ring: [1366, 490, 368, 375]
} satisfies Record<string, Rect>

// How far in from each edge a frame's corners reach, in sheet pixels; the middle stretches.
const FRAME_INSETS: Record<HubFrame, number> = {
    plank: 60,
    pill: 115,
    cardSelected: 70,
    card: 70,
    locked: 50,
    play: 60
}

type HubFrame = keyof typeof FRAME_RECTS
type HubIcon = keyof typeof ICON_RECTS

const TAB_ICONS = {
    hub: [hubOn, hubOff],
    inventory: [inventoryOn, inventoryOff],
    store: [storeOn, storeOff],
    profile: [profileOn, profileOff]
} as const

type HubTab = keyof typeof TAB_ICONS

function loadHubArt(scene: Scene): void {
    scene.load.image("hub-banner", banner)
    scene.load.image("hub-frames", frames)
    scene.load.image("hub-icons", icons)
    scene.load.image("hub-nav", navBar)
    scene.load.image("hub-tab", tab)
    for (const [name, [on, off]] of Object.entries(TAB_ICONS)) {
        scene.load.image(`tab-${name}-on`, on)
        scene.load.image(`tab-${name}-off`, off)
    }
}

// Adds the named frames to the loaded sheets. Call once, after loadHubArt has finished.
function sliceHubArt(scene: Scene): void {
    const add = (key: string, rects: Record<string, Rect>) => {
        const texture = scene.textures.get(key)
        for (const [name, [x, y, w, h]] of Object.entries(rects)) {
            if (!texture.has(name)) texture.add(name, 0, x, y, w, h)
        }
    }
    add("hub-frames", FRAME_RECTS)
    add("hub-icons", ICON_RECTS)
    add("hub-nav", { bar: [9, 198, 2152, 328] })
    add("hub-tab", { tab: [262, 151, 1162, 631] })
}

// A frame stretched to width × height on screen. `scale` sets how thick its border is drawn.
function addFrame(
    scene: Scene,
    frame: HubFrame,
    x: number,
    y: number,
    width: number,
    height: number,
    scale: number
): GameObjects.NineSlice {
    const inset = FRAME_INSETS[frame]
    return scene.add
        .nineslice(
            x,
            y,
            "hub-frames",
            frame,
            width / scale,
            height / scale,
            inset,
            inset,
            inset,
            inset
        )
        .setScale(scale)
}

// An icon from the icon sheet, scaled to fit inside a size × size box.
function addIcon(scene: Scene, icon: HubIcon, x: number, y: number, size: number) {
    const image = scene.add.image(x, y, "hub-icons", icon)
    return image.setScale(size / Math.max(image.width, image.height))
}

export { loadHubArt, sliceHubArt, addFrame, addIcon }
export type { HubFrame, HubIcon, HubTab }
