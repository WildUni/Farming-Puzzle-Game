// Dev-only HTML side panel for testing by hand: trigger any event, add any upgrade, give any
// power-up. Each change goes through src/sim/debug.ts; see specs/ui.md "Debug menu".
import type { CropTable, GameState, Tier, UpgradeTarget } from "../../sim/types"
import { EVENTS, eventTargets } from "../../sim/events"
import { UPGRADES, validTargets } from "../../sim/upgrades"
import { POWER_UPS } from "../../sim/powerups"
import {
    debugEvent,
    debugPowerUp,
    debugOpenShop,
    debugUpgrade,
    upgradeTiers
} from "../../sim/debug"
import { targetText, tierName } from "../format"

// Applies a debug change to the run. Returns false when the change was refused.
type ApplyChange = (change: (state: GameState) => GameState | null, label: string) => boolean

const PANEL_STYLE = `
position: fixed; top: 0; right: 0; width: 260px; height: 100vh; box-sizing: border-box;
overflow-y: auto; padding: 12px; background: rgba(20, 24, 20, 0.94); color: #eee;
font: 14px Arial, sans-serif; z-index: 1000; border-left: 2px solid #4e7d2a;`
const TAB_STYLE = `
position: fixed; top: 12px; right: 0; z-index: 1001; padding: 6px 10px; cursor: pointer;
background: #4e7d2a; color: #fff; border: none; border-radius: 6px 0 0 6px;
font: bold 14px Arial, sans-serif;`
const ROW_STYLE =
    "display: block; width: 100%; margin: 4px 0; padding: 4px; box-sizing: border-box;"

function el<K extends keyof HTMLElementTagNameMap>(
    tag: K,
    text = "",
    style = ""
): HTMLElementTagNameMap[K] {
    const node = document.createElement(tag)
    node.textContent = text
    node.style.cssText = style
    return node
}

// Replaces a select's options only when they changed, so an open list isn't reset every frame.
// Keeps the current choice when it is still offered.
function setOptions(select: HTMLSelectElement, options: [value: string, label: string][]): void {
    const key = JSON.stringify(options)
    if (select.dataset.key === key) return
    const keep = select.value
    select.replaceChildren(
        ...options.map(([value, label]) => {
            const option = el("option", label)
            option.value = value
            return option
        })
    )
    select.dataset.key = key
    if (options.some(([value]) => value === keep)) select.value = keep
}

// Target values are plot indexes or crop ids; select values are strings.
function targetValue(target: UpgradeTarget): string {
    return target === null ? "" : typeof target === "number" ? `p${target}` : `c${target}`
}

function parseTarget(value: string): UpgradeTarget {
    if (value === "") return null
    return value.startsWith("p") ? Number(value.slice(1)) : value.slice(1)
}

export class DebugPanel {
    private crops: CropTable
    private apply: ApplyChange
    private state: GameState | null = null

    private tab: HTMLButtonElement
    private panel: HTMLDivElement
    private status: HTMLDivElement

    private eventSelect: HTMLSelectElement
    private eventPlot: HTMLSelectElement
    private skipWarning: HTMLInputElement
    private triggerButton: HTMLButtonElement

    private upgradeSelect: HTMLSelectElement
    private tierSelect: HTMLSelectElement
    private targetSelect: HTMLSelectElement
    private upgradeButton: HTMLButtonElement

    private powerUpSelect: HTMLSelectElement
    private powerUpButton: HTMLButtonElement

    constructor(crops: CropTable, apply: ApplyChange) {
        this.crops = crops
        this.apply = apply

        this.tab = el("button", "Debug", TAB_STYLE)
        this.tab.addEventListener("click", () => this.toggle())
        this.panel = el("div", "", PANEL_STYLE + "display: none;")
        this.panel.append(el("div", "Debug menu", "font-weight: bold; font-size: 16px;"))

        // Events
        this.eventSelect = el("select", "", ROW_STYLE)
        setOptions(
            this.eventSelect,
            Object.values(EVENTS.events).map((d) => [d.id, `${d.name} (${d.kind})`])
        )
        this.eventPlot = el("select", "", ROW_STYLE)
        this.skipWarning = el("input")
        this.skipWarning.type = "checkbox"
        const skipLabel = el("label", "", "display: block; margin: 4px 0;")
        skipLabel.append(this.skipWarning, " Skip warning")
        this.triggerButton = el("button", "Trigger", ROW_STYLE)
        this.triggerButton.addEventListener("click", () => this.triggerEvent())
        this.section("Events", this.eventSelect, this.eventPlot, skipLabel, this.triggerButton)

        // Upgrades
        this.upgradeSelect = el("select", "", ROW_STYLE)
        setOptions(
            this.upgradeSelect,
            Object.values(UPGRADES.upgrades)
                .sort((a, b) => a.name.localeCompare(b.name))
                .map((d) => [d.id, d.name])
        )
        this.tierSelect = el("select", "", ROW_STYLE)
        this.targetSelect = el("select", "", ROW_STYLE)
        this.upgradeButton = el("button", "Add", ROW_STYLE)
        this.upgradeButton.addEventListener("click", () => this.addUpgrade())
        this.section(
            "Upgrades",
            this.upgradeSelect,
            this.tierSelect,
            this.targetSelect,
            this.upgradeButton
        )

        // Power-ups
        this.powerUpSelect = el("select", "", ROW_STYLE)
        setOptions(
            this.powerUpSelect,
            Object.values(POWER_UPS.powerUps).map((d) => [d.id, d.name])
        )
        this.powerUpButton = el("button", "Add", ROW_STYLE)
        this.powerUpButton.addEventListener("click", () => this.addPowerUp())
        this.section("Power-ups", this.powerUpSelect, this.powerUpButton)

        // Shop
        const shopButton = el("button", "Open shop", ROW_STYLE)
        shopButton.addEventListener("click", () => {
            const label = "Opened the shop"
            this.report(
                this.apply((state) => debugOpenShop(state, this.crops), label),
                label
            )
        })
        this.section("Shop", shopButton)

        this.status = el("div", "", "margin-top: 12px; min-height: 2em; color: #cfe8b0;")
        this.panel.append(this.status)

        // Changing a list refreshes the lists that depend on it straight away.
        for (const select of [this.eventSelect, this.upgradeSelect]) {
            select.addEventListener("change", () => this.refresh())
        }
        document.body.append(this.tab, this.panel)
    }

    toggle(): void {
        this.panel.style.display = this.panel.style.display === "none" ? "block" : "none"
        this.refresh()
    }

    // Called on every render. Only does work while the panel is open.
    update(state: GameState): void {
        this.state = state
        if (this.panel.style.display !== "none") this.refresh()
    }

    destroy(): void {
        this.tab.remove()
        this.panel.remove()
    }

    private section(title: string, ...children: HTMLElement[]): void {
        this.panel.append(el("div", title, "margin-top: 14px; font-weight: bold;"), ...children)
    }

    // Rebuilds the dependent lists from the state, and disables buttons whose change would be
    // refused, by asking the same debug functions the buttons call.
    private refresh(): void {
        const state = this.state
        if (state === null) return

        const def = EVENTS.events[this.eventSelect.value]
        const plots = def.target === "plot" ? eventTargets(state, def) : []
        setOptions(
            this.eventPlot,
            plots.map((p) => [String(p), targetText(p)])
        )
        this.eventPlot.style.display = def.target === "plot" ? "block" : "none"
        this.triggerButton.disabled = this.eventChange()(state) === null

        const upgrade = UPGRADES.upgrades[this.upgradeSelect.value]
        setOptions(
            this.tierSelect,
            upgradeTiers(upgrade.id).map((t) => [t, tierName(t)])
        )
        const targets =
            upgrade.target === null
                ? []
                : validTargets(state.upgrades, upgrade.id, state.plots.length, this.crops)
        setOptions(
            this.targetSelect,
            targets.map((t) => [targetValue(t), targetText(t)])
        )
        this.targetSelect.style.display = upgrade.target === null ? "none" : "block"
        this.upgradeButton.disabled = this.upgradeChange()(state) === null

        this.powerUpButton.disabled = debugPowerUp(state, this.powerUpSelect.value) === null
    }

    private eventChange(): (state: GameState) => GameState | null {
        const id = this.eventSelect.value
        const plot =
            EVENTS.events[id].target === "plot" && this.eventPlot.value !== ""
                ? Number(this.eventPlot.value)
                : null
        const skipWarning = this.skipWarning.checked
        return (state) => debugEvent(state, id, { plot, skipWarning })
    }

    private upgradeChange(): (state: GameState) => GameState | null {
        const id = this.upgradeSelect.value
        const tier = this.tierSelect.value as Tier
        const target =
            UPGRADES.upgrades[id].target === null ? null : parseTarget(this.targetSelect.value)
        return (state) => debugUpgrade(state, id, tier, target, this.crops)
    }

    private triggerEvent(): void {
        const def = EVENTS.events[this.eventSelect.value]
        const where = def.target === "plot" ? ` → ${targetText(Number(this.eventPlot.value))}` : ""
        const label = `Triggered ${def.name}${where}`
        this.report(this.apply(this.eventChange(), label), label)
    }

    private addUpgrade(): void {
        const def = UPGRADES.upgrades[this.upgradeSelect.value]
        const tier = tierName(this.tierSelect.value as Tier).toLowerCase()
        const label = `Added ${def.name} (${tier})`
        this.report(this.apply(this.upgradeChange(), label), label)
    }

    private addPowerUp(): void {
        const id = this.powerUpSelect.value
        const label = `Added ${POWER_UPS.powerUps[id].name}`
        this.report(
            this.apply((state) => debugPowerUp(state, id), label),
            label
        )
    }

    private report(ok: boolean, label: string): void {
        this.status.textContent = ok ? label : "Not allowed"
        this.refresh()
    }
}
