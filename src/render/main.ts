import { Boot } from "./scenes/Boot"
import { GameOver } from "./scenes/GameOver"
import { Game as MainGame } from "./scenes/Game"
import { MainMenu } from "./scenes/MainMenu"
import { AUTO, Game, Scale } from "phaser"
import { Preloader } from "./scenes/Preloader"

// Portrait canvas that scales to fit the window. `dom` lets scenes place HTML
// elements (the seed input) that scale along with the canvas.
const config: Phaser.Types.Core.GameConfig = {
    type: AUTO,
    width: 720,
    height: 1280,
    parent: "game-container",
    backgroundColor: "#028af8",
    scale: {
        mode: Scale.FIT,
        autoCenter: Scale.CENTER_BOTH
    },
    dom: { createContainer: true },
    scene: [Boot, Preloader, MainMenu, MainGame, GameOver]
}

const StartGame = (parent: string) => {
    return new Game({ ...config, parent })
}

export default StartGame
