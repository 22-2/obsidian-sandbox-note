import log from "loglevel";
import type { AppEvents } from "src/events/AppEvents";
import type { EventEmitter } from "src/utils/EventEmitter";
import { HotSandboxNoteView } from "src/views/HotSandboxNoteView";
import type { AppOrchestrator } from "./AppOrchestrator";
import type { CacheManager } from "./CacheManager";
import type { IManager } from "./IManager";
import type { ViewManager } from "./ViewManager";

const logger = log.getLogger("EditorSyncManager");

type Context = {
	emitter: EventEmitter<AppEvents>;
	getAllHotSandboxViews: ViewManager["getAllViews"];
	getAllSandboxes: CacheManager["getAllSandboxes"];
	registerNewSandbox: CacheManager["registerNewSandbox"];
	getSandboxContent: CacheManager["getSandboxContent"];
	getActiveView: ViewManager["getActiveView"];
	getSettings: AppOrchestrator["getSettings"];
	workspace: {
		_activeEditor: never;
	};
};

/** Manages shared content synchronization across views */
export class EditorSyncManager implements IManager {
	// --- For new HotSandboxNoteView ---
	private viewMasterIdMap = new WeakMap<HotSandboxNoteView, string>();

	constructor(private context: Context) {}

	public load(): void {
		this.context.emitter.on(
			"editor-content-changed",
			this.handleEditorContentChanged,
		);
		this.context.emitter.on("view-opened", this.handleViewOpened);
		this.context.emitter.on("settings-changed", this.handleSettingsChanged);
		this.context.emitter.on(
			"request-content-restoration",
			this.handleContentRestoration,
		);
		// this.context.emitter.on(
		// 	"obsidian-active-leaf-changed",
		// 	this.syncActiveEditorState
		// );
	}

	public unload(): void {
		this.context.emitter.off(
			"editor-content-changed",
			this.handleEditorContentChanged,
		);
		this.context.emitter.off("view-opened", this.handleViewOpened);
		this.context.emitter.off("settings-changed", this.handleSettingsChanged);
		this.context.emitter.off(
			"request-content-restoration",
			this.handleContentRestoration,
		);
	}

	private handleSettingsChanged = () => {
		this.refreshAllViewTitles();
	};

	private handleViewOpened = (payload: AppEvents["view-opened"]) => {
		const { view } = payload;
		if (view instanceof HotSandboxNoteView && view.masterId) {
			this.context.registerNewSandbox(view.masterId);
			this.viewMasterIdMap.set(view, view.masterId);
			const content = this.getSandboxContent(view.masterId);
			if (content !== undefined) {
				view.setContent(content);
			}
			log.debug(
				`View ${view.leaf.id} associated with masterId ${view.masterId}`,
			);
		}
	};

	private handleContentRestoration = (
		payload: AppEvents["request-content-restoration"],
	) => {
		const { view, masterId } = payload;
		if (view instanceof HotSandboxNoteView) {
			const content = this.getSandboxContent(masterId);
			if (content !== undefined) {
				view.setContent(content);
				logger.debug(
					`✅ Restored content from IndexedDB for masterId: ${masterId}, length: ${content.length}`,
				);
			} else {
				logger.warn(
					`❌ No content found in IndexedDB for masterId: ${masterId}`,
				);
			}
		}
	};

	private handleEditorContentChanged = (
		payload: AppEvents["editor-content-changed"],
	) => {
		const { content, sourceView } = payload;
		logger.debug("handleEditorContentChanged");

		if (sourceView instanceof HotSandboxNoteView && sourceView.masterId) {
			this.syncHotViews(sourceView.masterId, content, sourceView);
		}

		this.refreshAllViewTitles();
	};

	refreshAllViewTitles() {
		logger.debug("refreshAllViewTitles", this.viewMasterIdMap);
		const allViews = this.context.getAllHotSandboxViews();
		for (const view of allViews) {
			logger.debug("Updating header for view", view);
			view.leaf.updateHeader();
		}
		logger.debug("finish");
	}

	public getSandboxContent(masterId: string): string | undefined {
		return this.context.getSandboxContent(masterId);
	}

	public syncHotViews(
		masterId: string,
		content: string,
		sourceView: HotSandboxNoteView,
	) {
		log.debug(`Syncing hot sandbox note content for group: ${masterId}`);

		const allViews = this.context.getAllHotSandboxViews();

		for (const view of allViews) {
			// WeakMapからこのビューのmasterIdを取得
			const currentMasterId = this.viewMasterIdMap.get(view);

			// 同期対象のグループに属しており、かつ、変更元のビューではない場合
			if (currentMasterId === masterId && view !== sourceView) {
				view.setContent(content);
			}
		}
	}
}
