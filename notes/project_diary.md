# Project Diary

## 11/15/2026
* Started this project
* Ideation of features
* Deteremined how the main gameplay loop works
* Iterated on game design with help from Claude
* Claude created a design doc including the core features
* Determined the tech stack: Phaser + Tyepscript + Vite for development. Phaser comes with exisitng game engines, which accelerates development. Typescript for enforced typing + less error prone. Vite for fast updates during developemt.

## 11/16/2026
* Created a light developemnt schedule doc with cladue, noting major check points and smaller check points during development.
* Imported phaser + ts + vite template
* Added project diary for book keeping. Attached design and schedule doc.
* Added initial collection of crops to data under crops.json file
* Added mulberry rng step function for procedural generation + tests
* Declared custom types for sim folder.
* Added create game function.

## 11/17/2026
* Created a specs folder containing a specs file for each module
* Implemented a simple order modules: uniformed selection of one crop type, rng amt required dependent on max and min constants, expires after some tick.
* Implemented applyAction function that creates a copy of the current state with the action taken applied. Any unsupported behavior returns null. 
* Created custom type for supported actions. 
* Change expiration to be at the end of the expiration tick instead of at the beginnng.
* Added a replay function that takes in an action log and replays the run, then returns an object denoting if any mismatches occurred.
* Added simple game UI with squares, and tables for displaying game state data
* Specified what render takes care of. Only render will call phaser
* Right now, plant selection only shows up after clicking on empty plot. Will be changed to visible at all times
* Added custom seed selector to loading page, displays ticks, pause for testing.


## 11/19
* Added survial mode: base number of lives, scaling difficulty with time: more orders, less time.
* Added mode selection to the base screen.
* Updated end condition checks based on mode

## 11/20
* Added claude.md file
* Added readyAt field for plots for upgrades.
* Expanded on the idea of upgrades, power ups, and events
* Came up with a list of upgrades and poewr ups + upgrade tiering
* Came up with a list events
* Separated good/bad events
* Added a storage limit on the amt of crops player can hold (?)
* Added a shop event for players to spend their in-run gold (?)

## 11/21
* Separated RNG state into two, one for orders, and one for upgrades.
* Decided that the number of the same type of upgrade is capped.
* plot-targted upgrades of the same type cannot be stacked on the same plot
* Decided that some upgrades could be sold in the shop to allow players to cycle upgrades
* 
