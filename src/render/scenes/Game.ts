import { Scene, GameObjects } from "phaser"
import type { Action, CropTable, GameMode, GameState, LogEntry } from "../../sim/types"
import { createGame, applyAction, step } from "../../sim/main"
import { TICKS_PER_SECOND } from "../../sim/game_constants"
import { debugText, MAX_SEED } from "../format"
import { COLORS, MARGIN, TEXT } from "../theme"
import { OrdersView } from "../views/OrdersView"
import { StatsView } from "../views/StatsView"
import { PlotsView } from "../views/PlotsView"
import { PlantPicker } from "../views/PlantPicker"
import { PauseView } from "../views/PauseView"
import { BuyLifeView } from "../views/BuyLifeView"
import { GameOverView } from "../views/GameOverView"
import { UpgradePickView } from "../views/UpgradePickView"

const MS_PER_TICK = 1000 / TICKS_PER_SECOND
const MAX_CATCH_UP_TICKS = 5 // a background tab doesn't jump ahead when it comes back
const GAP = 12

type GameData = { seed: number; mode: GameMode }

// Owns one run: holds the GameState, advances it on a fixed tick, turns clicks into
// actions, and hands each new state to the views.
export class Game extends Scene {
    private crops: CropTable
    private seed: number
    private mode: GameMode
    private state: GameState
    private log: LogEntry[]
    private elapsed: number
    private paused: boolean
    private pickerPlot: number | null // plot the plant picker is open for

    private orders: OrdersView
    private stats: StatsView
    private plots: PlotsView
    private picker: PlantPicker
    private pause: PauseView
    private buyLife: BuyLifeView
    private gameOver: GameOverView
    private upgradePick: UpgradePickView
    private debug: GameObjects.Text

    constructor() {
        super("Game")
    }

    // The seed and mode come from the mode select, or from a restart.
    init(data: Partial<GameData>) {
        this.seed = data.seed ?? 0
        this.mode = data.mode ?? "survival"
    }

    create() {
        this.cameras.main.setBackgroundColor(COLORS.background)

        this.crops = this.registry.get("crops") as CropTable
        this.state = createGame(this.seed, { mode: this.mode, allowPowerUps: false })
        this.log = []
        this.elapsed = 0
        this.paused = false
        this.pickerPlot = null

        this.orders = new OrdersView(this, (id) => this.onOrderClick(id))
        this.stats = new StatsView(this, this.crops)
        this.plots = new PlotsView(this, (i) => this.onPlotClick(i))
        this.picker = new PlantPicker(
            this,
            this.crops,
            (cropId) => this.onCropPick(cropId),
            () => this.closePicker()
        )
        this.stats.update(this.state) // builds the table so its height is known
        this.pause = new PauseView(this, this.scale.width - MARGIN, this.stats.bottom + GAP, () =>
            this.togglePause()
        )
        this.buyLife = new BuyLifeView(
            this,
            this.scale.width - MARGIN,
            this.pause.bottom + GAP,
            () => this.act({ type: "buyLife" })
        )
        this.upgradePick = new UpgradePickView(this, (upgradeId) =>
            this.act({ type: "chooseUpgrade", upgradeId })
        )
        this.gameOver = new GameOverView(
            this,
            () => this.restartNewSeed(),
            () => this.scene.start("MainMenu", { mode: this.mode })
        )
        this.debug = this.add
            .text(MARGIN, this.scale.height - MARGIN, "", TEXT.debug)
            .setOrigin(0, 1)
            .setDepth(1000)

        const keys = this.input.keyboard!
        keys.on("keydown-P", () => this.togglePause())
        keys.on("keydown-ESC", () => this.togglePause())
        keys.on("keydown-R", () => this.scene.restart({ seed: this.seed, mode: this.mode }))
        keys.on("keydown-L", () => this.printLog())

        this.render()
    }

    // Fixed-tick loop: step() once per MS_PER_TICK of real time. Paused, or while an
    // upgrade offer is open, the counter stops.
    update(_time: number, delta: number) {
        if (this.paused || this.state.status === "ended") return
        if (this.state.upgradeOffer !== null) {
            this.elapsed = 0
            return
        }

        this.elapsed = Math.min(this.elapsed + delta, MAX_CATCH_UP_TICKS * MS_PER_TICK)
        while (this.elapsed >= MS_PER_TICK && this.state.status === "running") {
            this.state = step(this.state, this.crops)
            this.elapsed -= MS_PER_TICK
        }
        if (this.state.status === "ended" || this.state.upgradeOffer !== null) this.closePicker()
        this.render()
    }

    private render(): void {
        this.orders.update(this.state)
        this.stats.update(this.state)
        this.plots.update(this.state, this.pickerPlot)
        this.pause.update(this.paused)
        this.buyLife.update(this.state)
        this.upgradePick.update(this.state)
        this.gameOver.update(this.state)
        this.debug.setText(debugText(this.state, this.seed, this.paused))
    }

    // The game-over panel's Restart: a fresh run on a new random seed.
    private restartNewSeed(): void {
        const seed = Math.floor(Math.random() * (MAX_SEED + 1))
        this.scene.restart({ seed, mode: this.mode })
    }

    private togglePause(): void {
        if (this.state.status === "ended") return
        this.paused = !this.paused
        if (this.paused) this.closePicker()
        this.render()
    }

    // Prints what's needed to replay this run: the seed and every logged action.
    private printLog(): void {
        console.log(`Action log (seed ${this.seed}, tick ${this.state.tick}):`)
        console.log(JSON.stringify({ seed: this.seed, log: this.log }))
    }

    // Every player move goes through here so it is checked by the sim and logged for replay.
    private act(action: Action): boolean {
        if (this.paused) return false
        const next = applyAction(this.state, action, this.crops)
        if (next === null) return false
        this.log.push({ tick: this.state.tick, action })
        this.state = next
        this.render()
        return true
    }

    // Empty plot: open the plant picker. Ready plot: harvest it. Growing plot: nothing.
    private onPlotClick(plot: number): void {
        if (this.paused || this.state.status === "ended" || this.state.upgradeOffer !== null) return
        switch (this.state.plots[plot].state) {
            case "empty":
                this.pickerPlot = plot
                this.picker.show(plot)
                this.render()
                return
            case "ready":
                this.act({ type: "harvest", plot })
                return
            case "growing":
                return
        }
    }

    // applyAction refuses the delivery if the inventory is short, so no check is needed here.
    private onOrderClick(orderId: number): void {
        this.act({ type: "deliver", orderId })
    }

    private onCropPick(cropId: string): void {
        if (this.pickerPlot !== null) this.act({ type: "plant", plot: this.pickerPlot, cropId })
        this.closePicker()
    }

    private closePicker(): void {
        this.pickerPlot = null
        this.picker.hide()
        this.render()
    }
}
