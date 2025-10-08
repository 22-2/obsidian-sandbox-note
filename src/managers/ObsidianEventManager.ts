import log from "loglevel";
import type { Workspace } from "obsidian";
import type { AppEvents } from "src/events/AppEvents";
import type { EventEmitter } from "src/utils/EventEmitter";
import type { IManager } from "./IManager";
import { ViewManager } from "./ViewManager";

type Context = {
	getActiveView: ViewManager["getActiveView"];
	workspaceEvents: {
		on: Workspace["on"];
		off: Workspace["off"];
		onLayoutReady: Workspace["onLayoutReady"];
	};
};

/** Manages Obsidian workspace event handling */
export class ObsidianEventManager implements IManager {
	constructor(
		private context: Context,
		private emitter: EventEmitter<AppEvents>,
	) {}

	/** Set up all workspace event listeners */
	public load(): void {
		this.context.workspaceEvents.onLayoutReady(() =>
			this.emitter.emit("obsidian-layout-ready", undefined),
		);
		this.context.workspaceEvents.on(
			"active-leaf-change",
			this.handleActiveLeafChange,
		);
	}

	public unload(): void {
		this.context.workspaceEvents.off(
			"active-leaf-change",
			this.handleActiveLeafChange,
		);
	}

	/**
	 * Handles active leaf changes and emits an event with the new active view.
	 */
	private handleActiveLeafChange = () => {
		const activeView = this.context.getActiveView();
		log.debug(`Active leaf changed to: ${activeView?.leaf?.id}`);
		this.emitter.emit("obsidian-active-leaf-changed", { view: activeView });
	};
}
