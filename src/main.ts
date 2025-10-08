import { overwriteLogLevel } from "./utils/setup-logger";

import log from "loglevel";
import { Plugin } from "obsidian";
import type { AppEvents } from "./events/AppEvents";
import { t } from "./i18n";
import { AppOrchestrator } from "./managers/AppOrchestrator";
import { SandboxNoteSettingTab } from "./settings";
import { EventEmitter } from "./utils/EventEmitter";
import { DEBUG_MODE, HOT_SANDBOX_NOTE_ICON } from "./utils/constants";
import { HotSandboxNoteView } from "./views/HotSandboxNoteView";
import { extractToFileInteraction } from "./views/internal/utils";

export const logger = log.getLogger("SandboxNote");

/** Main plugin class for Sandbox Note functionality. */
export default class SandboxNotePlugin extends Plugin {
	// Core components
	orchestrator!: AppOrchestrator;
	emitter!: EventEmitter<AppEvents>;

	/** Initialize plugin on load. */
	async onload() {
		if (DEBUG_MODE) {
			logger.debug("BUILT_AT", process.env.BUILT_AT);
		} else {
			overwriteLogLevel();
		}

		this.initializeCoreComponents();

		await this.orchestrator.load();

		// Determine the initial log level based on the loaded settings.
		const settings = this.orchestrator.getSettings();
		this.togglLoggersBy(settings["advanced.enableLogger"] ? "debug" : "warn");

		this.setupSettingsTab();
		this.setupCommandsAndRibbons();

		logger.debug("Sandbox Note plugin loaded");
	}

	/** Initialize the core components of the plugin. */
	private initializeCoreComponents() {
		this.emitter = new EventEmitter<AppEvents>(this.register.bind(this));
		this.orchestrator = new AppOrchestrator(this, this.emitter);
	}

	/** Setup plugin settings tab. */
	private setupSettingsTab() {
		this.addSettingTab(new SandboxNoteSettingTab(this));
	}

	private setupCommandsAndRibbons() {
		// Command to open the new hot sandbox note
		this.addCommand({
			id: "open-hot-sandbox-note-view",
			name: t("commands.openHotSandboxNote"),
			icon: HOT_SANDBOX_NOTE_ICON,
			callback: () => {
				this.activateNewHotSandboxView();
			},
		});

		this.addCommand({
			id: "convert-to-file",
			name: t("commands.convertToFile"),
			icon: "file-pen-line",
			checkCallback: (checking) => {
				const view = this.orchestrator.getActiveView();
				if (view instanceof HotSandboxNoteView) {
					if (!checking) {
						extractToFileInteraction(view).then((success) => {
							if (success && view.masterId) {
								this.orchestrator.get("dbManager").deleteFromAll(view.masterId);
							}
						});
					}
					return true;
				}
				return false;
			},
		});

		// Ribbon icon to open the hot sandbox note
		this.addRibbonIcon(
			HOT_SANDBOX_NOTE_ICON,
			t("ribbonIcon.openHotSandboxNote"),
			() => {
				this.activateNewHotSandboxView();
			},
		);
	}

	/** Cleanup on plugin unload. */
	async onunload() {
		this.orchestrator.unload();
		this.emitter.emit("plugin-unload", undefined);
		logger.debug("Sandbox Note plugin unloaded");
	}

	/**
	 * Activates a new hot sandbox view.
	 * This is delegated to the ViewFactory managed by the orchestrator.
	 */
	activateNewHotSandboxView() {
		return this.orchestrator.activateView();
	}

	togglLoggersBy(
		level: log.LogLevelDesc,
		filter: (name: string) => boolean = () => true,
	): void {
		Object.values(log.getLoggers())
			// @ts-expect-error
			.filter((logger) => filter(logger.name))
			.forEach((logger) => {
				logger.setLevel(level);
			});
		console.log(`Logger level set to ${level}`);
	}
}
