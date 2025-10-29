import type { Extension } from "@codemirror/state";
import type { ViewPlugin } from "@codemirror/view";
import type { Plugin } from "obsidian";
import type { AppEvents } from "src/events/AppEvents";
import type SandboxNotePlugin from "src/main";
import type { EventEmitter } from "src/utils/EventEmitter";
import { VIEW_TYPE_HOT_SANDBOX } from "src/utils/constants";
import { HotSandboxNoteView } from "src/views/HotSandboxNoteView";
import { AbstractNoteView } from "src/views/internal/AbstractNoteView";
import {
    SyncEditorPlugin,
    syncEditorPlugin,
} from "src/views/internal/SyncEditorPlugin";
import { injectable } from "tsyringe";
import type { IManager } from "./IManager";

type Context = {
	emitter: EventEmitter<AppEvents>;
	plugin: Plugin;
};

/** Manages editor extensions and plugin connections */
@injectable()
export class CodeMirrorExtensionManager implements IManager {
	constructor(private context: Context) {}

	/** Register editor extension and set up event listeners */
	public load() {
		this.context.plugin.registerEditorExtension(syncEditorPlugin as Extension);

		this.context.emitter.on(
			"obsidian-active-leaf-changed",
			this.handleActiveLeafChange,
		);
	}

	/** Unload event listeners. */
	public unload() {
		this.context.emitter.off(
			"obsidian-active-leaf-changed",
			this.handleActiveLeafChange,
		);
	}

	/** Connect watch editor plugin to view */
	connectEditorPluginToView(view: AbstractNoteView) {
		if (!view?.editor) return;

		// FIXME
		const editorPlugin = view.editor.cm.plugin(
			// @ts-expect-error
			syncEditorPlugin as unknown as ViewPlugin<SyncEditorPlugin, any>,
		);
		if (editorPlugin instanceof SyncEditorPlugin) {
			editorPlugin.connectToPlugin(
				this.context.plugin as SandboxNotePlugin,
				view,
				this.context.emitter,
			);
		}
	}

	/** Connects the editor plugin to any existing sandbox views on layout change. */
	private handleLayoutChange = () => {
		this.context.plugin.app.workspace
			.getLeavesOfType(VIEW_TYPE_HOT_SANDBOX)
			.forEach((leaf) => {
				const view = leaf.view;
				if (view instanceof HotSandboxNoteView) {
					this.connectEditorPluginToView(view);
				}
			});
	};

	/** Connects the editor plugin to the newly active view and syncs editor state. */
	private handleActiveLeafChange = (
		payload: AppEvents["obsidian-active-leaf-changed"],
	) => {
		const { view } = payload;
		if (view) {
			this.connectEditorPluginToView(view);
		}
	};
}
