# Plot Rush menu assets

Open `preview.png` to see the shared farm background, board, and tab states in use. Import the individual PNGs into the game.

| Asset | PNG size | Use |
| --- | --- | --- |
| `background/bg-farm-portrait.png` | 1080 × 1920 | Shared portrait background |
| `background/bg-farm-landscape.png` | 1920 × 1080 | Wide framing of the same farm |
| `background/bg-grass-bleed-tile.png` | 256 × 256 | Seamless grass fill for extra viewport space |
| `ui/ui-board.png` | 448 × 256 | Blank rectangular board with cream fill |
| `ui/ui-frame.png` | 256 × 256 | Square source for Phaser NineSlice, 80 px insets on all four sides (20 base units at 4×) |
| `ui/ui-tab-bar.png` | 1032 × 152 | Blank rail for four tabs |
| `ui/ui-tab-selected.png`, `ui/ui-tab-unselected.png` | 240 × 112 each | Gold and honey-brown tab faces |
| `icons/icon-{hub,inventory,store,profile}-{selected,unselected}.png` | 64 × 64 each | Full-color selected icons and monochrome cream-and-brown unselected icons, with matching alpha masks |

Use the four tabs in this order: Hub, Inventory, Store, Profile. Keep the text labels live in the game so they can resize and localize. The UI assets have transparent edges. Render icons at 16 × 16 base units and provide touch targets at least 32 base units tall.

Use the background that matches the screen orientation. On wider or taller screens, fill the outer viewport with the grass tile and keep interactive content inside the centered safe zone.
