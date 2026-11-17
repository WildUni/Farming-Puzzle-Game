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