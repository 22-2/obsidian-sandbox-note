import log from "loglevel";
import type { WorkspaceLeaf } from "obsidian";
import type { AppEvents } from "src/events/AppEvents";
import type SandboxNotePlugin from "src/main";
import { DatabaseManager } from "src/managers/DatabaseManager";
import type { EventEmitter } from "src/utils/EventEmitter";
import { HotSandboxNoteView } from "src/views/HotSandboxNoteView";
import invariant from "tiny-invariant";
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

// Manager type definition map
interface ManagerTypeMap {
	cacheManager: CacheManager;
	cmExtensionManager: CodeMirrorExtensionManager;
	dbManager: DatabaseManager;
	editorSyncManager: EditorSyncManager;
	obsidianEventManager: ObsidianEventManager;
	pluginEventManager: PluginEventManager;
	settingsManager: SettingsManager;
	uriManager: URIManager;
	viewManager: ViewManager;
	viewPatchManager: ViewPatchManager;
}

type ManagerName = keyof ManagerTypeMap;

const MANAGER_NAMES: readonly ManagerName[] = [
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
 * Manages the manager's lifecycle and dependencies as a DI container.
 */
export class AppOrchestrator implements IManager {
	private readonly plugin: SandboxNotePlugin;
	private readonly emitter: EventEmitter<AppEvents>;
	private readonly dbAPI: DatabaseAPI;

	private readonly instances = new Map<ManagerName, IManager>();
	private readonly factories = new Map<ManagerName, () => IManager>();

	constructor(plugin: SandboxNotePlugin, emitter: EventEmitter<AppEvents>) {
		this.plugin = plugin;
		this.emitter = emitter;
		this.dbAPI = new DatabaseAPI();

		this.registerAllFactories();
	}

	/**
	 * Get the manager instance by name.
	 * Create and cache if it doesn't exist.
	 */
	public get<K extends ManagerName>(name: K): ManagerTypeMap[K] {
		let instance = this.instances.get(name);

		if (!instance) {
			const factory = this.factories.get(name);
			if (!factory) {
				throw new Error(`Factory not registered for manager: ${name}`);
			}
			instance = factory();
			this.instances.set(name, instance);
		}

		return instance as ManagerTypeMap[K];
	}

	private registerAllFactories(): void {
		this.registerSettingsManagerFactory();
		this.registerCacheManagerFactory();
		this.registerDatabaseManagerFactory();
		this.registerViewManagerFactory();
		this.registerEditorSyncManagerFactory();
		this.registerCodeMirrorExtensionManagerFactory();
		this.registerPluginEventManagerFactory();
		this.registerURIManagerFactory();
		this.registerViewPatchManagerFactory();
		this.registerObsidianEventManagerFactory();
	}

	private registerSettingsManagerFactory(): void {
		this.factories.set("settingsManager", () => {
			return new SettingsManager({
				emitter: this.emitter,
				loadData: this.plugin.loadData.bind(this.plugin),
				saveData: this.plugin.saveData.bind(this.plugin),
				getObsidianConfig: this.plugin.app.vault.getConfig.bind(
					this.plugin.app.vault,
				),
			});
		});
	}

	private registerCacheManagerFactory(): void {
		this.factories.set("cacheManager", () => {
			return new CacheManager({
				emitter: this.emitter,
				// FIXE: Calling `getAllSandboxes` directly results in "Maximum call stack size exceeded."
				getDbManager: () => this.get("dbManager"),
			});
		});
	}

	private registerDatabaseManagerFactory(): void {
		this.factories.set("dbManager", () => {
			const cache = this.get("cacheManager");
			return new DatabaseManager({
				dbAPI: this.dbAPI,
				cache: {
					get: (noteId: string) => cache.get(noteId),
					set: (noteId: string, content: string) =>
						cache.updateSandboxContent(noteId, content),
					delete: (noteId: string) => cache.delete(noteId),
				},
				emitter: this.emitter,
				getAllHotSandboxViews: () => this.get("viewManager").getAllViews(),
			});
		});
	}

	private registerViewManagerFactory(): void {
		this.factories.set("viewManager", () => {
			const settings = this.get("settingsManager");
			const cache = this.get("cacheManager");

			// We need a reference to the ViewManager itself, so we'll set it later.
			let viewManager: ViewManager;

			viewManager = new ViewManager({
				registerView: (type, viewCreator) =>
					this.plugin.registerView(type, viewCreator),
				createView: (leaf: WorkspaceLeaf): HotSandboxNoteView =>
					this.createHotSandboxNoteView(leaf, viewManager),
				getLeaf: (type) => this.plugin.app.workspace.getLeaf(type),
				detachLeavesOfType: (type) =>
					this.plugin.app.workspace.detachLeavesOfType(type),
				getActiveViewOfType: (type) =>
					this.plugin.app.workspace.getActiveViewOfType(type),
				getLeavesOfType: (type: string) =>
					this.plugin.app.workspace.getLeavesOfType(type),
				getAllSandboxes: () => cache.getAllSandboxes(),
			});

			return viewManager;
		});
	}

	private createHotSandboxNoteView(
		leaf: WorkspaceLeaf,
		viewManager: ViewManager,
	): HotSandboxNoteView {
		const settings = this.get("settingsManager");

		return new HotSandboxNoteView(leaf, {
			emitter: this.emitter,
			getActiveView: () => viewManager.getActiveView(),
			getSettings: () => settings.getSettings(),
			getDisplayIndex: (masterId: string) => {
				invariant(masterId, "masterId must not be null");
				const groupCount = viewManager.indexOfMasterId(masterId);
				// logger.debug("groupCount", groupCount);
				return groupCount === -1 ? 0 : groupCount + 1;
			},
			isLastHotView: (id: string) => viewManager.isLastHotView(id),
			deleteFromAll: (id: string) => this.get("dbManager").deleteFromAll(id),
		});
	}

	private registerEditorSyncManagerFactory(): void {
		this.factories.set("editorSyncManager", () => {
			const views = this.get("viewManager");
			const cache = this.get("cacheManager");

			return new EditorSyncManager({
				emitter: this.emitter,
				getAllHotSandboxViews: () => views.getAllViews(),
				getAllSandboxes: () => cache.getAllSandboxes(),
				registerNewSandbox: (note) => cache.registerNewSandbox(note),
				getSandboxContent: (noteId) => cache.getSandboxContent(noteId),
				getActiveView: () => views.getActiveView(),
				workspace: this.plugin.app.workspace as never,
				getSettings: this.getSettings.bind(this),
			});
		});
	}

	private registerCodeMirrorExtensionManagerFactory(): void {
		this.factories.set("cmExtensionManager", () => {
			return new CodeMirrorExtensionManager({
				emitter: this.emitter,
				plugin: this.plugin,
			});
		});
	}

	private registerPluginEventManagerFactory(): void {
		this.factories.set("pluginEventManager", () => {
			const db = this.get("dbManager");
			const views = this.get("viewManager");
			const cache = this.get("cacheManager");
			const settings = this.get("settingsManager");
			const cmExtension = this.get("cmExtensionManager");

			return new PluginEventManager({
				cache,
				emitter: this.emitter,
				settings,
				connectEditorPluginToView: (leaf) =>
					cmExtension.connectEditorPluginToView(leaf),
				saveSandbox: (...args) => db.debouncedSaveSandboxes(...args),
				immediateSave: (masterId: string, content: string) =>
					db.immediateSave(masterId, content),
				clearOldDeadSandboxes: () => db.clearOldDeadSandboxes(),
				getAllViews: () => views.getAllViews(),
				isLastHotView: (masterId: string) => views.isLastHotView(masterId),
				deleteFromAll: (masterId: string | null) => db.deleteFromAll(masterId),
				togglLoggersBy: this.plugin.togglLoggersBy.bind(this.plugin),
			});
		});
	}

	private registerObsidianEventManagerFactory(): void {
		this.factories.set("obsidianEventManager", () => {
			const views = this.get("viewManager");
			return new ObsidianEventManager(
				{
					getActiveView: () => views.getActiveView(),
					workspaceEvents: this.plugin.app.workspace,
				},
				this.emitter,
			);
		});
	}

	private registerURIManagerFactory(): void {
		this.factories.set("uriManager", () => {
			const views = this.get("viewManager");
			return new URIManager({
				registerObsidianProtocolHandler:
					this.plugin.registerObsidianProtocolHandler.bind(this.plugin),
				createAndOpenSandbox: (content) => views.createAndOpenSandbox(content),
			});
		});
	}

	private registerViewPatchManagerFactory(): void {
		this.factories.set("viewPatchManager", () => {
			return new ViewPatchManager({
				emitter: this.emitter,
				register: this.plugin.register.bind(this.plugin),
				getActiveView: () => this.get("viewManager").getActiveView(),
				findCommand: this.plugin.app.commands.findCommand.bind(
					this.plugin.app.commands,
				),
				getSettings: () => this.get("settingsManager").getSettings(),
			});
		});
	}

	async load(): Promise<void> {
		for (const name of MANAGER_NAMES) {
			const manager = this.get(name);
			invariant(manager?.load, `Manager ${name} must have a load method`);
			await manager.load();
		}
		logger.debug("AppOrchestrator: All managers loaded successfully");
	}

	unload(): void {
		// Unload in reverse order (considering dependencies)
		const reversedNames = [...MANAGER_NAMES].reverse();
		for (const name of reversedNames) {
			const manager = this.instances.get(name);
			if (manager) {
				invariant(manager.unload, `Manager ${name} must have an unload method`);
				manager.unload();
			}
		}
		this.instances.clear();
		logger.debug("AppOrchestrator: All managers unloaded successfully");
	}

	// --- Public API: Delegated Methods ---

	getActiveView() {
		return this.get("viewManager").getActiveView();
	}

	activateView() {
		return this.get("viewManager").activateView();
	}

	getSettings() {
		return this.get("settingsManager").getSettings();
	}

	async updateSettings(
		settings: Parameters<SettingsManager["updateSettingsAndSave"]>[0],
	) {
		await this.get("settingsManager").updateSettingsAndSave(settings);
	}
}
