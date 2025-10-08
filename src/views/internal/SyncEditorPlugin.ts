import { ViewPlugin, ViewUpdate, type PluginValue } from "@codemirror/view";
import type { AppEvents } from "src/events/AppEvents";
import type { EventEmitter } from "src/utils/EventEmitter";
import type SandboxNotePlugin from "../../main";
import { AbstractNoteView } from "./AbstractNoteView";

/** CodeMirror plugin for syncing content across views. */
export class SyncEditorPlugin implements PluginValue {
	private connectedPlugin: SandboxNotePlugin | null = null;
	private connectedView: AbstractNoteView | null = null;
	private emitter: EventEmitter<AppEvents> | null = null;

	/** Handle editor updates and propagate changes. */
	update(update: ViewUpdate): void {
		// Only proceed if plugin and view are connected
		if (!this.emitter || !this.connectedView) {
			return;
		}

		// Only process actual document changes
		if (update.docChanged) {
			const updatedContent = update.state.doc.toString();

			this.emitter.emit("editor-content-changed", {
				content: updatedContent,
				sourceView: this.connectedView,
			});
		}
	}

	/** Connect to main plugin and view. */
	connectToPlugin(
		plugin: SandboxNotePlugin,
		view: AbstractNoteView,
		emitter: EventEmitter<AppEvents>,
	): void {
		this.connectedPlugin = plugin;
		this.connectedView = view;
		this.emitter = emitter;
	}

	/** Cleanup on destroy. */
	destroy(): void {
		this.connectedPlugin = null;
		this.connectedView = null;
		this.emitter = null;
	}
}

/** CodeMirror ViewPlugin for watching changes. */
export const syncEditorPlugin = ViewPlugin.fromClass(SyncEditorPlugin);
