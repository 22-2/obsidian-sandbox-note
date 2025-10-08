// E:\Desktop\coding\pub\obsidian-sandbox-note\src\views\helpers\EditorWrapper.ts
import log from "loglevel";
import { MarkdownView, WorkspaceLeaf, type ViewStateResult } from "obsidian";
import type { AppEvents } from "src/events/AppEvents";
import { noop } from "src/utils";
import type { EventEmitter } from "src/utils/EventEmitter";
import type { AbstractNoteView } from "./AbstractNoteView";
// import { VirtualMarkdownView } from "./VirtualMarkdownView";
import type { AbstractNoteViewState } from "./types";

const logger = log.getLogger("MagicalEditorWrapper");

interface VirtualMarkdownView extends MarkdownView {
	__setViewData__: MarkdownView["setViewData"];
}

type Context = {
	getActiveView: () => AbstractNoteView | null;
	workspace: {
		_activeEditor: never;
	};
	parentView: AbstractNoteView;
	emitter: EventEmitter<AppEvents>;
};

/** Manages inline MarkdownView without physical file. */
export class MagicalEditorWrapper {
	public magicalEditor!: VirtualMarkdownView;
	containerEl!: HTMLDivElement;
	public targetEl: HTMLElement | null = null;
	private content = "";

	constructor(private context: Context) {
		this.context.emitter.on(
			"obsidian-active-leaf-changed",
			this.syncActiveEditorState.bind(this),
		);
		this.context.emitter.on(
			"obsidian-layout-changed",
			this.syncActiveEditorState.bind(this),
		);
		this.context.emitter.on(
			"obsidian-layout-ready",
			this.syncActiveEditorState.bind(this),
		);
	}

	/** Initialize the editor and load content. */
	async initialize(
		target: HTMLElement,
		initialState: AbstractNoteViewState | null,
	) {
		await this.onload(); // Create virtual editor
		const editorContainer = target.createEl("div", {
			cls: "sandbox-note-container",
		});
		this.load(editorContainer); // Attach to DOM and focus

		const initialContent =
			initialState?.content ?? (await this.context.parentView.getContent());
		this.content = initialContent;
		this.context.parentView.setContent(initialContent);

		if (initialState) {
			await this.magicalEditor.setState(initialState, {
				history: false,
			});
		}
		this.syncActiveEditorState();
	}

	getContent() {
		return this.magicalEditor.editor.getValue();
	}

	setContent(content: string) {
		this.magicalEditor.__setViewData__(content, true);
	}

	load(target: HTMLElement) {
		this.setContent(this.content);
		target.append(this.containerEl);
		setTimeout(() => this.focus());
		this.targetEl = target;
		// this.context.parentView.plugin.registerDomEvent(
		// 	this.targetEl,
		// 	"focusin",
		// 	this.handleFocusIn
		// );
		// this.targetEl.addEventListener("focusin", this.setActiveEditor);
		// this.setActiveEditor();
	}

	focus() {
		this.magicalEditor.editor.focus();
	}

	// private setActiveEditor = () => {
	// 	// @ts-ignore
	// 	this.context.parentView.plugin.app.workspace._activeEditor = this.virtualEditor;
	// 	log.debug("this.virtualEditor", this.virtualEditor);
	// 	log.debug(
	// 		"this.context.parentView.plugin.app.workspace._activeEditor",
	// 		// @ts-expect-error
	// 		this.context.parentView.plugin.app.workspace._activeEditor
	// 	);
	// };

	unload() {
		// this.content = this.getContent();

		this.context.emitter.off(
			"obsidian-active-leaf-changed",
			this.syncActiveEditorState.bind(this),
		);
		this.context.emitter.off(
			"obsidian-layout-changed",
			this.syncActiveEditorState.bind(this),
		);
		this.context.emitter.off(
			"obsidian-layout-ready",
			this.syncActiveEditorState.bind(this),
		);
		if (this.targetEl) {
			this.targetEl.empty();
			// this.targetEl.removeEventListener("focusin", this.setActiveEditor);
			this.targetEl = null;
		}
	}

	async onload() {
		this.containerEl = document.createElement("div");
		this.containerEl.addClasses(["sandbox-inline-editor"]);

		this.magicalEditor = new MarkdownView(
			this.createFakeLeaf(),
		) as VirtualMarkdownView;
		// this.virtualEditor.file = createVirtualFile(this.context.parentView.app);
		this.magicalEditor.leaf.working = false;
		this.disableSaveOperations();
		// await this.ensureSourceMode();
	}

	private disableSaveOperations() {
		this.magicalEditor.save = noop;
		this.magicalEditor.saveTitle = noop;
		this.magicalEditor.requestSave = noop;
		this.magicalEditor.__setViewData__ = this.magicalEditor.setViewData;
		this.magicalEditor.setViewData = noop;
	}

	// private async ensureSourceMode() {
	// 	if (this.virtualEditor.getMode() === "preview") {
	// 		await this.virtualEditor.setState(
	// 			{ mode: "source" },
	// 			{ history: false }
	// 		);
	// 	}
	// }

	private createFakeLeaf() {
		// --- The Magic ---
		// We create a "fake" leaf object to trick the MarkdownView constructor.
		// The goal is to make it render inside our `containerEl` instead of the
		// leaf's main container. This avoids modifying the real leaf,
		// preventing crashes and instability.
		const fakeLeaf = {
			...this.context.parentView.leaf,
			containerEl: this.containerEl,
			// getState: () => {
			// 	const state = this.context.parentView.getState();
			// 	logger.debug("getState", state);
			// 	return state;
			// },
			setViewState: async (state: any, result: ViewStateResult) => {
				if (state.type === "markdown") {
					state.type = this.context.parentView.getViewType();
				}
				this.context.parentView.leaf.setViewState(
					state,
					result || { history: false },
				);
			},
			__FAKE_LEAF__: true,
		} as unknown as WorkspaceLeaf;
		return fakeLeaf;
	}

	/**
	 * Syncs Obsidian's internal active editor state with our virtual editor.
	 * This ensures that commands and other editor features work correctly.
	 */
	private syncActiveEditorState = (): void => {
		const activeView = this.context.getActiveView();
		const workspace = this.context.workspace;
		logger.debug("syncActiveEditorState", activeView?.constructor.name);

		if (activeView?.editor) {
			logger.debug("active view editr true");
			// @ts-expect-error
			workspace._activeEditor = activeView.wrapper.magicalEditor;
		} else if (
			// @ts-expect-error
			workspace._activeEditor?.leaf?.__FAKE_LEAF__
		) {
			logger.debug("active view editr false");
			// @ts-expect-error
			workspace._activeEditor = null;
		}
	};
}
