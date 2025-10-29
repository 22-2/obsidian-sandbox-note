import log from "loglevel";
import type { WorkspaceLeaf } from "obsidian";
import "reflect-metadata";
import type { AppEvents } from "src/events/AppEvents";
import type SandboxNotePlugin from "src/main";
import { DatabaseManager } from "src/managers/DatabaseManager";
import type { EventEmitter } from "src/utils/EventEmitter";
import { HotSandboxNoteView } from "src/views/HotSandboxNoteView";
import invariant from "tiny-invariant";
import { container, injectable } from "tsyringe";
import { CacheManager } from "./CacheManager";
import { CodeMirrorExtensionManager } from "./CodeMirrorExtensionManager";
import { DatabaseAPI } from "./DatabaseAPI";
import { EditorSyncManager } from "./EditorSyncManager";
import type { IManager } from "./IManager";
import { ObsidianEventManager } from "./ObsidianEventManager";
import { PluginEventManager } from "./PluginEventManager";
import { SettingsManager } from "./SettingsManager";
import { URIManager } from "./URIManager";
import { ViewManager } from "./ViewManager";
import { ViewPatchManager } from "./ViewPatchManager";

const logger = log.getLogger("AppOrchestrator");

const MANAGER_NAMES = [
	"settingsManager",
	"cacheManager",
	"dbManager",
	"viewManager",
	"editorSyncManager",
	"cmExtensionManager",
	"pluginEventManager",
	"viewPatchManager",
	"uriManager",
	"obsidianEventManager",
] as const;

/**
 * Manages the manager's lifecycle and dependencies using tsyringe DI container.
 */
@injectable()
export class AppOrchestrator implements IManager {
	private readonly plugin: SandboxNotePlugin;
	private readonly emitter: EventEmitter<AppEvents>;
	private readonly dbAPI: DatabaseAPI;

	private settingsManager!: SettingsManager;
	private cacheManager!: CacheManager;
	private dbManager!: DatabaseManager;
	private viewManager!: ViewManager;
	private editorSyncManager!: EditorSyncManager;
	private cmExtensionManager!: CodeMirrorExtensionManager;
	private pluginEventManager!: PluginEventManager;
	private viewPatchManager!: ViewPatchManager;
	private uriManager!: URIManager;
	private obsidianEventManager!: ObsidianEventManager;

	constructor(plugin: SandboxNotePlugin, emitter: EventEmitter<AppEvents>) {
		this.plugin = plugin;
		this.emitter = emitter;
		this.dbAPI = new DatabaseAPI();

		this.setupDependencies();
	}

	private setupDependencies(): void {
		// Register singleton instances
		container.registerInstance("plugin", this.plugin);
		container.registerInstance("emitter", this.emitter);
		container.registerInstance("dbAPI", this.dbAPI);

		// Register SettingsManager
		this.settingsManager = new SettingsManager({
			emitter: this.emitter,
			loadData: this.plugin.loadData.bind(this.plugin),
			saveData: this.plugin.saveData.bind(this.plugin),
			// @ts-expect-error
			getObsidianConfig: this.plugin.app.vault.getConfig.bind(
				this.plugin.app.vault,
			),
		});
		container.registerInstance(SettingsManager, this.settingsManager);

		// Register CacheManager (without dbManager dependency)
		this.cacheManager = new CacheManager({
			emitter: this.emitter,
			getAllSandboxes: () => this.dbAPI.getAllSandboxes(),
		});
		container.registerInstance(CacheManager, this.cacheManager);

		// Register DatabaseManager
		this.dbManager = new DatabaseManager({
			dbAPI: this.dbAPI,
			cache: {
				get: (noteId: string) => this.cacheManager.get(noteId),
				set: (noteId: string, content: string) =>
					this.cacheManager.updateSandboxContent(noteId, content),
				delete: (noteId: string) => this.cacheManager.delete(noteId),
			},
			emitter: this.emitter,
			getAllHotSandboxViews: () => this.viewManager.getAllViews(),
		});
		container.registerInstance(DatabaseManager, this.dbManager);

		// Register ViewManager
		this.viewManager = new ViewManager({
			registerView: (type, viewCreator) =>
				this.plugin.registerView(type, viewCreator),
			createView: (leaf: WorkspaceLeaf): HotSandboxNoteView =>
				this.createHotSandboxNoteView(leaf),
			getLeaf: (type) => this.plugin.app.workspace.getLeaf(type),
			detachLeavesOfType: (type) =>
				this.plugin.app.workspace.detachLeavesOfType(type),
			getActiveViewOfType: (type) =>
				this.plugin.app.workspace.getActiveViewOfType(type),
			getLeavesOfType: (type: string) =>
				this.plugin.app.workspace.getLeavesOfType(type),
			getAllSandboxes: () => this.cacheManager.getAllSandboxes(),
		});
		container.registerInstance(ViewManager, this.viewManager);

		// Register EditorSyncManager
		this.editorSyncManager = new EditorSyncManager({
			emitter: this.emitter,
			getAllHotSandboxViews: () => this.viewManager.getAllViews(),
			getAllSandboxes: () => this.cacheManager.getAllSandboxes(),
			registerNewSandbox: (note) => this.cacheManager.registerNewSandbox(note),
			getSandboxContent: (noteId) =>
				this.cacheManager.getSandboxContent(noteId),
			getActiveView: () => this.viewManager.getActiveView(),
			workspace: this.plugin.app.workspace as never,
			getSettings: this.getSettings.bind(this),
		});
		container.registerInstance(EditorSyncManager, this.editorSyncManager);

		// Register CodeMirrorExtensionManager
		this.cmExtensionManager = new CodeMirrorExtensionManager({
			emitter: this.emitter,
			plugin: this.plugin,
		});
		container.registerInstance(
			CodeMirrorExtensionManager,
			this.cmExtensionManager,
		);

		// Register PluginEventManager
		this.pluginEventManager = new PluginEventManager({
			cache: this.cacheManager,
			emitter: this.emitter,
			settings: this.settingsManager,
			connectEditorPluginToView: (leaf) =>
				this.cmExtensionManager.connectEditorPluginToView(leaf),
			saveSandbox: (...args) => this.dbManager.debouncedSaveSandboxes(...args),
			immediateSave: (masterId: string, content: string) =>
				this.dbManager.immediateSave(masterId, content),
			clearOldDeadSandboxes: () => this.dbManager.clearOldDeadSandboxes(),
			getAllViews: () => this.viewManager.getAllViews(),
			isLastHotView: (masterId: string) =>
				this.viewManager.isLastHotView(masterId),
			deleteFromAll: (masterId: string | null) =>
				this.dbManager.deleteFromAll(masterId),
			togglLoggersBy: this.plugin.togglLoggersBy.bind(this.plugin),
		});
		container.registerInstance(PluginEventManager, this.pluginEventManager);

		// Register ViewPatchManager
		this.viewPatchManager = new ViewPatchManager({
			emitter: this.emitter,
			register: this.plugin.register.bind(this.plugin),
			getActiveView: () => this.viewManager.getActiveView(),
			// @ts-expect-error
			findCommand: this.plugin.app.commands.findCommand.bind(
			// @ts-expect-error
				this.plugin.app.commands,
			),
			getSettings: () => this.settingsManager.getSettings(),
		});
		container.registerInstance(ViewPatchManager, this.viewPatchManager);

		// Register URIManager
		this.uriManager = new URIManager({
			registerObsidianProtocolHandler:
				this.plugin.registerObsidianProtocolHandler.bind(this.plugin),
			createAndOpenSandbox: (content) =>
				this.viewManager.createAndOpenSandbox(content),
		});
		container.registerInstance(URIManager, this.uriManager);

		// Register ObsidianEventManager
		this.obsidianEventManager = new ObsidianEventManager(
			{
				getActiveView: () => this.viewManager.getActiveView(),
				workspaceEvents: this.plugin.app.workspace,
			},
			this.emitter,
		);
		container.registerInstance(
			ObsidianEventManager,
			this.obsidianEventManager,
		);
	}

	private createHotSandboxNoteView(leaf: WorkspaceLeaf): HotSandboxNoteView {
		return new HotSandboxNoteView(leaf, {
			emitter: this.emitter,
			getActiveView: () => this.viewManager.getActiveView(),
			getSettings: () => this.settingsManager.getSettings(),
			getDisplayIndex: (masterId: string) => {
				invariant(masterId, "masterId must not be null");
				const groupCount = this.viewManager.indexOfMasterId(masterId);
				return groupCount === -1 ? 0 : groupCount + 1;
			},
			isLastHotView: (id: string) => this.viewManager.isLastHotView(id),
			deleteFromAll: (id: string) => this.dbManager.deleteFromAll(id),
		});
	}

	async load(): Promise<void> {
		const managers = [
			this.settingsManager,
			this.cacheManager,
			this.dbManager,
			this.viewManager,
			this.editorSyncManager,
			this.cmExtensionManager,
			this.pluginEventManager,
			this.viewPatchManager,
			this.uriManager,
			this.obsidianEventManager,
		];

		for (const manager of managers) {
			invariant(manager?.load, `Manager must have a load method`);
			await manager.load();
		}
		logger.debug("AppOrchestrator: All managers loaded successfully");
	}

	unload(): void {
		const managers = [
			this.obsidianEventManager,
			this.uriManager,
			this.viewPatchManager,
			this.pluginEventManager,
			this.cmExtensionManager,
			this.editorSyncManager,
			this.viewManager,
			this.dbManager,
			this.cacheManager,
			this.settingsManager,
		];

		for (const manager of managers) {
			if (manager) {
				invariant(manager.unload, `Manager must have an unload method`);
				manager.unload();
			}
		}

		container.clearInstances();
		logger.debug("AppOrchestrator: All managers unloaded successfully");
	}

	// --- Public API: Delegated Methods ---

	getActiveView() {
		return this.viewManager.getActiveView();
	}

	activateView() {
		return this.viewManager.activateView();
	}

	getSettings() {
		return this.settingsManager.getSettings();
	}

	async updateSettings(
		settings: Parameters<SettingsManager["updateSettingsAndSave"]>[0],
	) {
		await this.settingsManager.updateSettingsAndSave(settings);
	}

	get(name: "dbManager"): DatabaseManager {
		return this.dbManager;
	}
}
