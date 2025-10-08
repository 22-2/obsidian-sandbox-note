// src/views/HotSandboxNoteView.ts
import log from "loglevel";
import { WorkspaceLeaf } from "obsidian";
import type { AppEvents } from "src/events/AppEvents";
import { setDisabled, showConfirmModal } from "src/helpers/interaction";
import type { DatabaseManager } from "src/managers/DatabaseManager";
import {
	HOT_SANDBOX_NOTE_ICON,
	VIEW_TYPE_HOT_SANDBOX,
} from "src/utils/constants";
import {
	AbstractNoteView,
	type AbstractNoteViewContext,
} from "./internal/AbstractNoteView";
import { extractToFileInteraction, splitMd } from "./internal/utils";

const logger = log.getLogger("HotSandboxNoteView");

type Context = AbstractNoteViewContext & {
	getDisplayIndex(masterId: string): number;
	deleteFromAll: DatabaseManager["deleteFromAll"];
};

export class HotSandboxNoteView extends AbstractNoteView {
	private saveActionButtonEl: HTMLElement | null = null;
	constructor(
		leaf: WorkspaceLeaf,
		protected context: Context,
	) {
		super(leaf, context);

		this.saveActionButtonEl = this.addAction("save", "save to vault", () => {
			this.handleSaveRequest({
				allowEmpty: true,
			});
		});
		this.context.emitter.on(
			"settings-changed",
			this.onSettingsChanged.bind(this),
		);
		this.context.emitter.on(
			"editor-content-changed",
			this.onContentChanged.bind(this),
		);
		this.onSettingsChanged({ newSettings: this.context.getSettings() });
		this.onContentChanged();
	}

	onContentChanged() {
		this.saveActionButtonEl &&
			setDisabled(this.saveActionButtonEl, !this.hasUnsavedChanges);
	}

	onSettingsChanged({ newSettings }: AppEvents["settings-changed"]) {
		const saveEl = this.saveActionButtonEl;
		if (!saveEl) return;
		setDisabled(
			saveEl,
			!newSettings["fileOperation.saveToVaultOnCommandExecuted"],
		);
	}

	getViewType(): string {
		return VIEW_TYPE_HOT_SANDBOX;
	}

	getBaseTitle(): string {
		const defaultTitle = `Hot Sandbox-${this.context.getDisplayIndex(
			this.masterId!,
		)}`;

		if (!this.context.getSettings()["appearance.firstLineAsTitle"]) {
			return defaultTitle;
		}

		const content = this.getContent();

		// Get the first line of content and trim whitespace.
		const firstLine = splitMd(content).content.split("\n")[0].trim();

		// Return the first line as the title if it contains content.
		if (firstLine.length > 0) {
			return firstLine;
		}

		return defaultTitle;
	}

	getIcon(): string {
		return HOT_SANDBOX_NOTE_ICON;
	}

	getContent(): string {
		return this.editor?.getValue() ?? "";
	}

	/**
	 * Handle close request (Ctrl+W)
	 */
	async shouldClose(): Promise<boolean> {
		if (!this.masterId) {
			logger.error(
				"Invalid masterId. Aborting HotSandboxNoteView closing process.",
			);
			return false;
		}

		const hasChanges = this.hasUnsavedChanges;
		const isLast = this.context.isLastHotView(this.masterId);

		logger.debug(
			`shouldClose: hasUnsavedChanges=${hasChanges}, isLastHotView=${isLast}, masterId=${this.masterId}`,
		);

		if (!hasChanges || !isLast) {
			logger.debug("Allowing close without confirmation");
			return true;
		}

		logger.debug(
			"Showing confirmation dialog for last tab with unsaved changes",
		);

		const confirmed = await showConfirmModal(
			this.app,
			"Delete Sandbox",
			"This sandbox has unsaved changes. Are you sure you want to permanently delete it?",
		);

		logger.debug(`Confirmation dialog result: ${confirmed}`);

		if (confirmed) {
			this.context.emitter.emit("delete-requested", { view: this });
			logger.debug(
				`Hot sandbox content deletion requested (Group: ${this.masterId})`,
			);
			this.setContent("");
			return true;
		}
		logger.debug(
			`User cancelled deletion (Group: ${this.masterId}). Data will be retained.`,
		);
		return false;
	}

	/**
	 * Handle save request (Ctrl+S)
	 */
	async handleSaveRequest({
		allowEmpty = false,
	}: {
		allowEmpty?: boolean;
	}): Promise<void> {
		// Only save if this view has focus
		const activeView = this.context.getActiveView();
		if (activeView?.leaf.id !== this.leaf.id || !this.leaf.isVisible()) {
			return;
		}

		if (!this.hasUnsavedChanges && !allowEmpty) {
			logger.debug("No changes to save. Aborting save operation.");
			return;
		}

		if (await extractToFileInteraction(this)) {
			this.context.deleteFromAll(this.masterId);
		}
	}
}
