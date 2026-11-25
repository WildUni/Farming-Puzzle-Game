import { Scene, GameObjects } from "phaser"
import type { Action, CropTable, GameMode, GameState, LogEntry } from "../../sim/types"
import { createGame, applyAction, step, nextOrderPreview, miracleTargets } from "../../sim/main"
import { TICKS_PER_SECOND } from "../../sim/game_constants"
import { bestScoreText, debugText, MAX_SEED } from "../format"
import { recordScore } from "../../app/saves"
import { finalScore } from "../../sim/scoring"
import { getSave, putSave } from "../saves"
import { COLORS, MARGIN, TEXT } from "../theme"
import { OrdersView } from "../views/OrdersView"
import { StatsView } from "../views/StatsView"
import { PlotsView } from "../views/PlotsView"
import { CropBar } from "../views/CropBar"
import { PauseView } from "../views/PauseView"
import { BuyLifeView } from "../views/BuyLifeView"
import { GameOverView } from "../views/GameOverView"
import { UpgradePickView } from "../views/UpgradePickView"
import { PowerUpBar } from "../views/PowerUpBar"
import { MiracleGrowView } from "../views/MiracleGrowView"
import { EventBanner } from "../views/EventBanner"
import { RushBanner } from "../views/RushBanner"
import { DebugPanel } from "../views/DebugPanel"
import { DrawerView } from "../views/DrawerView"
import { ShopButtonView } from "../views/ShopButtonView"
import type { ShopData } from "./Shop"
import { POWER_UPS, powerUpTargets } from "../../sim/powerups"
import { fertilizerTargets } from "../../sim/economy"
import { isShopOpen } from "../../sim/shop"

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
    private selectedCrop: string // the crop bar's selection; an empty plot click plants it
    private choosingSlot: number | null // power-up slot whose plot or order target is being picked
    private fertilizing: boolean // the plot to fertilize is being picked
    private miracling: boolean // the plot for Miracle grow is being picked

    private orders: OrdersView
    private stats: StatsView
    private plots: PlotsView
    private cropBar: CropBar
    private pause: PauseView
    private buyLife: BuyLifeView
    private gameOver: GameOverView
    private upgradePick: UpgradePickView
    private powerUpBar: PowerUpBar
    private miracle: MiracleGrowView
    private eventBanner: EventBanner
    private rushBanner: RushBanner
    private drawer: DrawerView
    private shopButton: ShopButtonView
    private debugPanel: DebugPanel | null // dev builds only
    private debugged: boolean // the debug menu changed this run, so its log won't replay
    private bestLine: string | null // the summary's high-score line, set once when the run ends
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
        this.state = createGame(this.seed, {
            mode: this.mode,
            allowPowerUps: true,
            allowEvents: true
        })
        this.log = []
        this.elapsed = 0
        this.paused = false
        this.choosingSlot = null
        this.fertilizing = false
        this.miracling = false
        this.debugged = false
        this.bestLine = null

        this.orders = new OrdersView(this, (id) => this.onOrderClick(id))
        this.stats = new StatsView(this, this.crops)
        this.plots = new PlotsView(this, (i) => this.onPlotClick(i))
        this.cropBar = new CropBar(this, this.crops, (cropId) => this.onCropPick(cropId))
        this.selectedCrop = this.cropBar.first
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
        this.upgradePick = new UpgradePickView(
            this,
            this.crops,
            (upgradeId, target) =>
                this.act(
                    target === null
                        ? { type: "chooseUpgrade", upgradeId }
                        : { type: "chooseUpgrade", upgradeId, target }
                ),
            () => this.act({ type: "rerollOffer" })
        )
        this.powerUpBar = new PowerUpBar(this, (slot) => this.onPowerUpClick(slot))
        this.shopButton = new ShopButtonView(
            this,
            this.scale.width - MARGIN,
            this.buyLife.bottom + GAP,
            () => this.openShop()
        )
        this.miracle = new MiracleGrowView(
            this,
            this.scale.width - MARGIN,
            this.shopButton.bottom + GAP,
            () => this.toggleMiracle()
        )
        this.eventBanner = new EventBanner(this)
        this.rushBanner = new RushBanner(this)
        this.drawer = new DrawerView(this, () => this.toggleFertilizing())
        this.debugPanel = import.meta.env.DEV
            ? new DebugPanel(this.crops, (change) => this.applyDebug(change))
            : null
        this.events.once("shutdown", () => {
            this.debugPanel?.destroy()
            this.scene.stop("Shop")
        })
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
        keys.on("keydown-ESC", () => {
            if (this.choosingSlot !== null || this.fertilizing || this.miracling)
                this.stopChoosing()
            else this.togglePause()
        })
        keys.on("keydown-R", () => this.scene.restart({ seed: this.seed, mode: this.mode }))
        keys.on("keydown-L", () => this.printLog())
        keys.on("keydown-BACKTICK", () => this.debugPanel?.toggle())

        this.render()
    }

    // Fixed-tick loop: step() once per MS_PER_TICK of real time. Paused, or while an
    // upgrade offer or the shop is open, the counter stops.
    update(_time: number, delta: number) {
        if (this.paused || this.state.status === "ended") return
        if (this.state.upgradeOffer !== null || isShopOpen(this.state)) {
            this.elapsed = 0
            return
        }

        this.elapsed = Math.min(this.elapsed + delta, MAX_CATCH_UP_TICKS * MS_PER_TICK)
        while (this.elapsed >= MS_PER_TICK && this.state.status === "running") {
            this.state = step(this.state, this.crops)
            this.elapsed -= MS_PER_TICK
        }
        if (
            this.state.status === "ended" ||
            this.state.upgradeOffer !== null ||
            isShopOpen(this.state)
        ) {
            this.choosingSlot = null
            this.fertilizing = false
            this.miracling = false
        }
        this.render()
    }

    private render(): void {
        // Drop target mode once nothing can be targeted (the last growing crop turned ready).
        if (this.choosingSlot !== null && this.targets() === null) this.choosingSlot = null
        if (this.fertilizing && fertilizerTargets(this.state).length === 0) this.fertilizing = false
        if (this.miracling && miracleTargets(this.state).length === 0) this.miracling = false
        const aiming = this.choosingSlot === null ? null : this.choosingDef()?.target
        const plotTargets =
            aiming === "plot"
                ? this.targets()
                : this.fertilizing
                  ? fertilizerTargets(this.state)
                  : this.miracling
                    ? miracleTargets(this.state)
                    : null
        this.orders.update(
            this.state,
            nextOrderPreview(this.state, this.crops),
            aiming === "order" ? this.targets() : null
        )
        this.stats.update(this.state)
        this.plots.update(this.state, null, plotTargets)
        // The crop bar and the drawer are off while something covers the board.
        const boardFree =
            !this.paused &&
            this.state.status === "running" &&
            this.state.upgradeOffer === null &&
            !isShopOpen(this.state)
        this.cropBar.update(this.selectedCrop, boardFree)
        this.drawer.update(this.state, boardFree, this.fertilizing)
        this.shopButton.update(this.state, this.paused)
        this.powerUpBar.update(this.state, this.choosingSlot)
        this.miracle.update(this.state, this.miracling)
        this.eventBanner.update(this.state)
        this.rushBanner.update(this.state)
        this.pause.update(this.paused)
        this.buyLife.update(this.state)
        this.upgradePick.update(this.state)
        if (this.state.status === "ended" && this.bestLine === null) this.saveScore()
        this.gameOver.update(this.state, this.bestLine ?? "")
        this.debug.setText(debugText(this.state, this.seed, this.paused, this.debugged))
        this.debugPanel?.update(this.state)
    }

    // Once per run, when it ends: saves the final score if it beats the mode's best. A run
    // changed by the debug menu is never saved.
    private saveScore(): void {
        const result = recordScore(getSave(this), this.mode, finalScore(this.state))
        if (!this.debugged && result.newBest) putSave(this, result.save)
        this.bestLine = bestScoreText(result.best, result.newBest, this.debugged)
    }

    // The game-over panel's Restart: a fresh run on a new random seed.
    private restartNewSeed(): void {
        const seed = Math.floor(Math.random() * (MAX_SEED + 1))
        this.scene.restart({ seed, mode: this.mode })
    }

    private togglePause(): void {
        if (this.state.status === "ended") return
        this.paused = !this.paused
        if (this.paused) {
            this.choosingSlot = null
            this.fertilizing = false
            this.miracling = false
        }
        this.render()
    }

    // Prints what's needed to replay this run: the seed and every logged action.
    private printLog(): void {
        if (this.debugged) {
            console.warn("This run was changed by the debug menu, so this log won't replay.")
        }
        console.log(`Action log (seed ${this.seed}, tick ${this.state.tick}):`)
        console.log(JSON.stringify({ seed: this.seed, log: this.log }))
    }

    // Debug menu changes skip applyAction and the log, so the run is marked debugged.
    private applyDebug(change: (state: GameState) => GameState | null): boolean {
        const next = change(this.state)
        if (next === null) return false
        this.state = next
        this.debugged = true
        this.render()
        return true
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

    // The definition of the power-up being aimed, or null.
    private choosingDef() {
        if (this.choosingSlot === null) return null
        return POWER_UPS.powerUps[this.state.powerUps[this.choosingSlot]] ?? null
    }

    // Plots or order ids the power-up being aimed can go on, or null when not choosing (or none
    // are valid).
    private targets(): number[] | null {
        if (this.choosingSlot === null) return null
        const targets = powerUpTargets(this.state, this.choosingSlot)
        return targets.length > 0 ? targets : null
    }

    // Untargeted power-up: use it. Plot or order power-up: start (or cancel) choosing its target.
    private onPowerUpClick(slot: number): void {
        if (this.paused) return
        const def = POWER_UPS.powerUps[this.state.powerUps[slot]]
        if (def === undefined) return
        if (def.target === null) {
            this.stopChoosing()
            this.act({ type: "usePowerUp", slot })
            return
        }
        this.fertilizing = false
        this.miracling = false
        this.choosingSlot = this.choosingSlot === slot ? null : slot
        this.render()
    }

    private stopChoosing(): void {
        this.choosingSlot = null
        this.fertilizing = false
        this.miracling = false
        this.render()
    }

    // The Miracle grow button: start (or cancel) choosing the growing plot to finish.
    private toggleMiracle(): void {
        if (this.paused) return
        this.choosingSlot = null
        this.fertilizing = false
        this.miracling = !this.miracling
        this.render()
    }

    // The drawer's Fertilize button: start (or cancel) choosing the plot to fertilize.
    private toggleFertilizing(): void {
        if (this.paused) return
        this.choosingSlot = null
        this.miracling = false
        this.fertilizing = !this.fertilizing
        this.render()
    }

    // Plot with crows: scare them off. Empty plot: plant the crop bar's crop. Ready plot: harvest
    // it. Growing plot: nothing.
    // While a power-up's target is being chosen, a click picks (or cancels) instead.
    private onPlotClick(plot: number): void {
        if (
            this.paused ||
            this.state.status === "ended" ||
            this.state.upgradeOffer !== null ||
            isShopOpen(this.state)
        ) {
            return
        }
        if (this.choosingSlot !== null) {
            const slot = this.choosingSlot
            const aimsAtPlot = this.choosingDef()?.target === "plot"
            this.choosingSlot = null
            if (aimsAtPlot && powerUpTargets(this.state, slot).includes(plot)) {
                this.act({ type: "usePowerUp", slot, target: plot })
            }
            this.render()
            return
        }
        if (this.miracling) {
            this.miracling = false
            if (miracleTargets(this.state).includes(plot)) {
                this.act({ type: "useMiracleGrow", plot })
            }
            this.render()
            return
        }
        if (this.fertilizing) {
            this.fertilizing = false
            if (fertilizerTargets(this.state).includes(plot)) {
                this.act({ type: "useFertilizer", plot })
            }
            this.render()
            return
        }
        // Crows on this plot: the click scares them off instead of harvesting.
        if (this.act({ type: "scareCrows", plot })) return
        switch (this.state.plots[plot].state) {
            case "empty":
                this.act({ type: "plant", plot, cropId: this.selectedCrop })
                return
            case "ready":
                this.act({ type: "harvest", plot })
                return
            case "growing":
                // Birds' seeds are dug up; during a Drought any other crop is watered.
                if (!this.act({ type: "digUp", plot })) this.act({ type: "waterPlot", plot })
                return
        }
    }

    // applyAction refuses the delivery if the inventory is short, so no check is needed here.
    // While an order power-up is being aimed, a click fills that order (or cancels) instead.
    private onOrderClick(orderId: number): void {
        this.fertilizing = false
        this.miracling = false
        if (this.choosingSlot !== null) {
            const slot = this.choosingSlot
            const aimsAtOrder = this.choosingDef()?.target === "order"
            this.choosingSlot = null
            if (aimsAtOrder && powerUpTargets(this.state, slot).includes(orderId)) {
                this.act({ type: "usePowerUp", slot, target: orderId })
            }
            this.render()
            return
        }
        this.act({ type: "deliver", orderId })
    }

    // The crop bar: select a crop. It stays selected until another is clicked.
    private onCropPick(cropId: string): void {
        this.selectedCrop = cropId
        this.render()
    }

    // The Shop button: sends openShop, then launches the shop page over this scene and pauses
    // this one (the clock is stopped anyway, and the page takes every click).
    private openShop(): void {
        if (!this.act({ type: "openShop" })) return
        this.stopChoosing()
        const data: ShopData = {
            crops: this.crops,
            state: () => this.state,
            act: (action) => this.act(action),
            close: () => this.closeShop()
        }
        this.scene.launch("Shop", data)
        this.scene.pause()
    }

    // The shop page's Close: sends closeShop, closes the page, and the clock resumes.
    private closeShop(): void {
        if (!this.act({ type: "closeShop" })) return
        this.scene.stop("Shop")
        this.scene.resume()
        this.elapsed = 0
        this.render()
    }
}
