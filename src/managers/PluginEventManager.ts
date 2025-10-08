import log from "loglevel";
import type { AppEvents } from "src/events/AppEvents";
import type { CodeMirrorExtensionManager } from "src/managers/CodeMirrorExtensionManager";
import type { DatabaseManager } from "src/managers/DatabaseManager";
import type { IManager } from "src/managers/IManager";
import type { EventEmitter } from "src/utils/EventEmitter";
import { SAVE_DEBOUNCE_MS } from "src/utils/constants";
import { HotSandboxNoteView } from "src/views/HotSandboxNoteView";
import type SandboxPlugin from "../main";
import type { CacheManager } from "./CacheManager";
import type { SettingsManager } from "./SettingsManager";
import type { ViewManager } from "./ViewManager";

const logger = log.getLogger("PluginEventManager");

interface Context {
	saveSandbox: DatabaseManager["debouncedSaveSandboxes"];
	immediateSave: DatabaseManager["immediateSave"];
	cache: CacheManager;
	emitter: EventEmitter<AppEvents>;
	settings: SettingsManager;
	connectEditorPluginToView: CodeMirrorExtensionManager["connectEditorPluginToView"];
	clearOldDeadSandboxes: DatabaseManager["clearOldDeadSandboxes"];
	getAllViews: ViewManager["getAllViews"];
	isLastHotView: ViewManager["isLastHotView"];
	deleteFromAll: DatabaseManager["deleteFromAll"];
	togglLoggersBy: SandboxPlugin["togglLoggersBy"];
}

export class PluginEventManager implements IManager {
	constructor(private readonly context: Context) {}

	load(): void {
		this.registerEventHandlers();
	}

	unload(): void {
		this.unregisterEventHandlers();
	}

	private registerEventHandlers(): void {
		const { emitter } = this.context;

		emitter.on("editor-content-changed", this.handleEditorContentChanged);
		emitter.on("connect-editor-plugin", this.handleConnectEditorPlugin);
		emitter.on("settings-changed", this.handleSettingsChanged);
		emitter.on("view-closed", this.handleViewClosed);
		emitter.on("obsidian-layout-ready", this.handleLayoutReady);
		emitter.on("plugin-unload", this.handleUnload);
	}

	private unregisterEventHandlers(): void {
		const { emitter } = this.context;

		emitter.off("editor-content-changed", this.handleEditorContentChanged);
		emitter.off("connect-editor-plugin", this.handleConnectEditorPlugin);
		emitter.off("settings-changed", this.handleSettingsChanged);
		emitter.off("view-closed", this.handleViewClosed);
		emitter.off("obsidian-layout-ready", this.handleLayoutReady);
		emitter.off("plugin-unload", this.handleUnload);
	}

	private handleLayoutReady = (): void => {
		this.context.clearOldDeadSandboxes();
	};

	private handleViewClosed = async (
		payload: AppEvents["view-closed"],
	): Promise<void> => {
		const { view, content } = payload;

		if (!this.isHotSandboxView(view) || !view.masterId) {
			return;
		}

		if (this.context.isLastHotView(view.masterId)) {
			await this.saveAndCleanupView(view.masterId, content);
		}
	};

	private async saveAndCleanupView(
		masterId: string,
		content: string,
	): Promise<void> {
		try {
			logger.debug(
				`💾 Immediate save on view close for: ${masterId}, content length: ${content.length}`,
			);

			await this.context.immediateSave(masterId, content);

			logger.debug(`✅ Saved to IndexedDB for: ${masterId}`);
		} catch (error) {
			logger.warn(`❌ Failed to save on view close: ${masterId}`, error);
		}

		// Remove from in-memory cache only (keep in IndexedDB for 3-day retention)
		this.context.cache.delete(masterId);
		logger.debug(`🗑️ Removed from cache (kept in IndexedDB): ${masterId}`);
	}

	private handleUnload = async (): Promise<void> => {
		const views = this.context.getAllViews();
		logger.debug(`Plugin unload: immediately saving ${views.length} views`);

		const savePromises = this.createSavePromisesForViews(views);
		await Promise.all(savePromises);

		logger.debug("All immediate saves completed on unload");
	};

	private createSavePromisesForViews(views: unknown[]): Promise<void>[] {
		return views
			.filter(
				(view): view is HotSandboxNoteView =>
					this.isHotSandboxView(view) && Boolean(view.masterId),
			)
			.map((view) => this.saveViewOnUnload(view));
	}

	private async saveViewOnUnload(view: HotSandboxNoteView): Promise<void> {
		const masterId = view.masterId!;

		try {
			logger.debug(`Immediate save on unload for: ${masterId}`);
			await this.context.immediateSave(masterId, view.getContent());
			logger.debug(`Immediate save completed on unload for: ${masterId}`);
		} catch (error) {
			logger.warn(`Failed to immediately save on unload: ${masterId}`, error);
		}
	}

	private handleConnectEditorPlugin = (
		payload: AppEvents["connect-editor-plugin"],
	): void => {
		this.context.connectEditorPluginToView(payload.view);
	};

	private handleSettingsChanged = (
		payload: AppEvents["settings-changed"],
	): void => {
		const logLevel = payload.newSettings["advanced.enableLogger"]
			? "debug"
			: "warn";
		this.context.togglLoggersBy(logLevel);
		logger.debug("Logger initialized");
	};

	private handleEditorContentChanged = (
		payload: AppEvents["editor-content-changed"],
	): void => {
		const { content, sourceView } = payload;

		if (!this.isHotSandboxView(sourceView) || !sourceView.masterId) {
			return;
		}

		// Update in-memory state
		this.context.cache.updateSandboxContent(sourceView.masterId, content);

		// Schedule debounced save to IndexedDB
		this.context.saveSandbox(sourceView.masterId, content, SAVE_DEBOUNCE_MS);
	};

	private isHotSandboxView(view: unknown): view is HotSandboxNoteView {
		return view instanceof HotSandboxNoteView;
	}
}
