// src/views/internal/AbstractNoteView.ts (修正版)

import log from "loglevel";
import { nanoid } from "nanoid";
import type { Editor, MarkdownEditView } from "obsidian";
import {
	ItemView,
	Menu,
	Scope,
	type ViewStateResult,
	WorkspaceLeaf,
} from "obsidian";
import type { AppEvents } from "src/events/AppEvents";
import { handleClick, handleContextMenu } from "src/helpers/clickHandler";
import type { SettingsManager } from "src/managers/SettingsManager";
import type { ViewManager } from "src/managers/ViewManager";
import type { PluginSettings } from "src/settings";
import type { EventEmitter } from "src/utils/EventEmitter";
import { HOT_SANDBOX_ID_PREFIX } from "src/utils/constants";
import { MagicalEditorWrapper } from "./MagicalEditorWrapper";
import type { AbstractNoteViewState, ObsidianViewState } from "./types";
import { extractToFileInteraction } from "./utils";

const logger = log.getLogger("AbstractNoteView");

export type Context = {
	getSettings: SettingsManager["getSettings"];
	getActiveView: ViewManager["getActiveView"];
	isLastHotView: ViewManager["isLastHotView"];
	emitter: EventEmitter<AppEvents>;
};

/** Abstract base class for note views with an inline editor. */
export abstract class AbstractNoteView extends ItemView {
	public masterId: string;
	public scope: Scope;
	public wrapper: MagicalEditorWrapper;

	// Prevent renaming prompts
	// public navigation = true;

	private stateManager: ViewStateManager;
	private saveManager: SaveManager;
	private eventHandler: ViewEventHandler;

	public get pluginSettings(): PluginSettings {
		return this.context.getSettings();
	}

	constructor(
		leaf: WorkspaceLeaf,
		protected context: Context,
	) {
		super(leaf);
		// Ensure masterId is initialized.
		this.masterId = `${HOT_SANDBOX_ID_PREFIX}-${nanoid()}`;
		this.wrapper = new MagicalEditorWrapper({
			emitter: this.context.emitter,
			getActiveView: this.context.getActiveView,
			parentView: this,
			workspace: this.app.workspace as never,
		});
		this.scope = new Scope(this.app.scope);

		this.stateManager = new ViewStateManager();
		this.saveManager = new SaveManager(this.context.emitter, () => this);
		this.eventHandler = new ViewEventHandler(
			this.context.emitter,
			() => this.editor,
			() => this.wrapper.magicalEditor?.editMode,
		);
	}

	public get editor() {
		return this.wrapper.magicalEditor?.editor;
	}

	protected get hasUnsavedChanges(): boolean {
		return this.getContent() !== "";
	}

	public get saving(): Promise<void> | null {
		return this.saveManager.saving;
	}

	public abstract getBaseTitle(): string;
	public abstract getContent(): string;
	public abstract getIcon(): string;
	public abstract getViewType(): string;

	save(): Promise<void> {
		return this.saveManager.save(this.masterId);
	}

	public override getDisplayText(): string {
		const baseTitle = this.getBaseTitle();
		const shouldShowUnsaved = this.hasUnsavedChanges;
		return shouldShowUnsaved ? `*${baseTitle}` : baseTitle;
	}

	public override getState(): AbstractNoteViewState {
		const baseState =
			this.wrapper.magicalEditor.getState() as ObsidianViewState;

		// Extract only necessary properties to avoid saving content in the workspace.
		const minimalState: Partial<ObsidianViewState> = {
			mode: baseState.mode,
			source: baseState.source,
		};

		// Prevent stateManager.buildState from receiving the bloated baseState.
		return this.stateManager.buildState(
			this.getViewType(),
			this.masterId,
			minimalState, // Pass a minimal state without content.
		);
	}

	public override async onOpen() {
		logger.debug("AbstractNoteView.onOpen", { masterId: this.masterId });
		try {
			await this.initializeEditor();
			this.setupEventHandlers();

			// Check if we need to restore content from IndexedDB after editor initialization
			if (this.stateManager.getNeedsContentRestoration()) {
				logger.debug(
					`Requesting content restoration after editor init: ${this.masterId}`,
				);
				this.context.emitter.emit("request-content-restoration", {
					view: this,
					masterId: this.masterId,
				});
				this.stateManager.clearNeedsContentRestoration();
			}

			this.emitOpenEvents();
		} catch (error) {
			this.handleInitializationError(error);
		}
	}

	public override async onClose() {
		// Get content BEFORE emitting view-closed event and unloading wrapper
		const content = this.getContent();

		this.context.emitter.emit("view-closed", {
			view: this,
			content: content, // Pass content to event handler
		});

		this.wrapper.unload();
		this.contentEl.empty();
	}

	public override async setState(
		{ content, ...stateWithoutContent }: AbstractNoteViewState = {} as never,
		result: ViewStateResult,
	): Promise<void> {
		const newMasterId = stateWithoutContent?.state?.masterId;
		const isWorkspaceRestore = newMasterId && newMasterId !== this.masterId;

		logger.debug("setState called", {
			type: isWorkspaceRestore
				? "workspace-restore"
				: this.editor
					? "state-update"
					: "new-view",
			currentMasterId: this.masterId,
			newMasterId: newMasterId,
		});

		// 1. Restore the masterId from the State.
		if (newMasterId) {
			this.masterId = newMasterId;
		}

		const editMode = this.wrapper.magicalEditor?.editMode;

		// Update source mode if needed
		if (
			typeof stateWithoutContent.source === "boolean" &&
			editMode.sourceMode !== stateWithoutContent.source
		) {
			editMode.toggleSource();
			stateWithoutContent.layout = true;
		}

		// 3. Call the parent's setState method using the clean state.
		// This ensures editor modes (source/preview, etc.) are set correctly,
		// but prevents older content from being written.
		await super.setState(stateWithoutContent, result);

		// 4. If restoring from the workspace, actively retrieve and apply the latest content from IndexedDB.
		if (isWorkspaceRestore || !this.editor) {
			// Attempt restoration even in the case of a new view.
			logger.debug(
				`Requesting content restoration from IndexedDB for masterId: ${this.masterId}`,
			);
			if (this.editor) {
				// If the editor is already ready, restore immediately.
				this.context.emitter.emit("request-content-restoration", {
					view: this,
					masterId: this.masterId,
				});
			} else {
				// If the editor is not yet present (before onOpen), set a flag to trigger restoration when onOpen is called.
				this.stateManager.setNeedsContentRestoration(true);
			}
		}
	}

	public override onPaneMenu(
		menu: Menu,
		source: "more-options" | "tab-header" | string,
	) {
		this.addConvertToFileMenuItem(menu);
		this.addClearContentMenuItem(menu);
		super.onPaneMenu(menu, source);
	}

	public setContent(content: string) {
		if (this.editor && this.editor.getValue() !== content) {
			this.editor.setValue(content);
		}
	}

	private async initializeEditor() {
		const initialState = this.stateManager.getInitialState();
		await this.wrapper.initialize(this.contentEl, initialState);
		this.stateManager.clearInitialState();
	}

	private emitOpenEvents() {
		this.context.emitter.emit("connect-editor-plugin", { view: this });
		this.context.emitter.emit("view-opened", { view: this });
	}

	private handleInitializationError(error: unknown) {
		logger.error("Sandbox Note: Failed to initialize inline editor.", error);
		this.contentEl.empty();
		this.contentEl.createEl("div", {
			text: "Error: Could not initialize editor. This might be due to an Obsidian update.",
			cls: "sandbox-error-message",
		});
	}

	protected setupEventHandlers() {
		if (!this.editor) {
			logger.error("Editor not found");
			return;
		}

		this.eventHandler.setupObsidianLeafListener(this.leaf.id, (cleanup) =>
			this.register(cleanup),
		);

		this.eventHandler.setupDomEventListeners(
			this.contentEl,
			(el, type, callback) =>
				this.registerDomEvent(el, type as keyof HTMLElementEventMap, callback),
		);
	}

	private addConvertToFileMenuItem(menu: Menu) {
		menu.addItem((item) =>
			item
				.setTitle("Convert to file")
				.setIcon("file-pen-line")
				.onClick(async () => {
					await extractToFileInteraction(this);
				}),
		);
	}

	private addClearContentMenuItem(menu: Menu) {
		menu.addItem((item) =>
			item
				.setTitle("Clear content")
				.setIcon("trash")
				.setWarning(true)
				.onClick(() => {
					this.setContent("");
				}),
		);
	}
}

export class ViewStateManager {
	private initialState: AbstractNoteViewState | null = null;
	private needsContentRestoration = false;

	setInitialState(state: AbstractNoteViewState | null) {
		this.initialState = state;
	}

	getInitialState(): AbstractNoteViewState | null {
		return this.initialState;
	}

	clearInitialState() {
		this.initialState = null;
	}

	setNeedsContentRestoration(value: boolean) {
		this.needsContentRestoration = value;
	}

	getNeedsContentRestoration(): boolean {
		return this.needsContentRestoration;
	}

	clearNeedsContentRestoration() {
		this.needsContentRestoration = false;
	}

	buildState(
		viewType: string,
		masterId: string,
		baseState: any,
	): AbstractNoteViewState {
		// Ensure the content property is excluded from baseState.
		const { content, ...restOfStateData } = baseState.state || {};

		const state: AbstractNoteViewState = {
			...baseState, // Basic properties like mode and source are maintained.
			type: viewType,
			state: {
				...restOfStateData, // State properties other than content
				masterId: masterId,
				// Content is intentionally omitted here.
			},
		};
		logger.debug("ViewStateManager.buildState (without content)", state);
		return state;
	}
}

export class SaveManager {
	private savingPromise: Promise<void> | null = null;

	constructor(
		private emitter: EventEmitter<AppEvents>,
		private getView: () => any,
	) {}

	get isSaving(): boolean {
		return this.savingPromise !== null;
	}

	get saving(): Promise<void> | null {
		return this.savingPromise;
	}

	async save(masterId: string): Promise<void> {
		if (this.savingPromise) {
			logger.debug("Save already in progress");
			return this.savingPromise;
		}

		const { promise, resolve, reject } = Promise.withResolvers<void>();
		this.savingPromise = promise;

		const view = this.getView();
		this.emitter.emit("save-requested", { view });

		this.emitter.once("save-result", (payload) => {
			if (payload.view === view) {
				logger.debug("Save completed for view", masterId);
				if (payload.success) {
					resolve();
				} else {
					reject();
				}
				this.savingPromise = null;
			}
		});

		return promise;
	}
}

export class ViewEventHandler {
	constructor(
		private emitter: EventEmitter<AppEvents>,
		private getEditor: () => Editor | undefined,
		private getEditMode: () => MarkdownEditView | undefined,
	) {}

	setupObsidianLeafListener(
		leafId: string,
		registerCallback: (cleanup: () => void) => void,
	) {
		const handler = (payload: any) => {
			if (payload?.view?.leaf?.id === leafId) {
				this.getEditor()?.focus();
			}
		};

		this.emitter.on("obsidian-active-leaf-changed", handler);
		registerCallback(() => {
			this.emitter.off("obsidian-active-leaf-changed", handler);
		});
	}

	setupDomEventListeners(
		contentEl: HTMLElement,
		registerDomEvent: (
			el: HTMLElement,
			type: string,
			callback: (e: Event) => void,
		) => void,
	) {
		const editor = this.getEditor();
		if (!editor) {
			logger.error("Editor not found");
			return;
		}

		registerDomEvent(contentEl, "mousedown", (e) =>
			handleClick(e as PointerEvent, editor),
		);

		registerDomEvent(contentEl, "contextmenu", (e) => {
			const editMode = this.getEditMode();
			if (editMode) {
				handleContextMenu(e as PointerEvent, editMode);
			}
		});
	}
}

export type { Context as AbstractNoteViewContext };
