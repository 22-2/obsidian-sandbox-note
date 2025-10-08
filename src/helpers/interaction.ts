import {
	AbstractInputSuggest,
	App,
	Modal,
	Notice,
	Setting,
	TAbstractFile,
	TFolder,
} from "obsidian";
import { t } from "../i18n";

/**
 * Generic confirmation modal utility
 */
export function showConfirmModal(
	app: App,
	title: string,
	message: string,
): Promise<boolean> {
	return new Promise((resolve) => {
		new ConfirmModal(app, title, message, resolve).open();
	});
}

/**
 * Confirmation modal implementation
 */
export class ConfirmModal extends Modal {
	constructor(
		app: App,
		private title: string,
		private message: string,
		private callback: (result: boolean) => void,
	) {
		super(app);
	}

	onOpen(): void {
		const { contentEl } = this;
		contentEl.createEl("h2", { text: this.title });
		contentEl.createEl("p", { text: this.message });

		new Setting(contentEl)
			.addButton((btn) =>
				btn
					.setButtonText(t("modals.confirmSaveLocation.buttons.yes"))
					.setCta()
					.onClick(() => {
						this.callback(true);
						this.close();
					}),
			)
			.addButton((btn) =>
				btn
					.setButtonText(t("modals.confirmSaveLocation.buttons.no"))
					.onClick(() => {
						this.callback(false);
						this.close();
					}),
			);
	}

	onClose(): void {
		this.contentEl.empty();
	}
}

/**
 * Base class for path suggestion utilities
 */
abstract class PathSuggest<
	T extends TAbstractFile,
> extends AbstractInputSuggest<T> {
	constructor(
		app: App,
		protected inputEl: HTMLInputElement,
	) {
		super(app, inputEl);
	}

	protected normalizeQuery(query: string): string {
		return query.toLowerCase().replace(/^\//, "").replace(/\/$/, "");
	}

	protected formatPath(path: string, isRoot?: boolean): string {
		return path === "" || isRoot ? t("folderSuggest.vaultRoot") : path;
	}

	selectSuggestion(item: T): void {
		const selectedPath = this.formatSelectedPath(item.path);
		this.inputEl.value = selectedPath;
		this.inputEl.trigger("input");
		this.inputEl.trigger("change");
		this.close();
	}

	protected abstract formatSelectedPath(path: string): string;
}

/**
 * Suggests existing folder paths within the vault
 */
export class FolderSuggest extends PathSuggest<TFolder> {
	getSuggestions(query: string): TFolder[] {
		// @ts-expect-error - Creating root folder instance
		const allFolders: TFolder[] = [new TFolder(this.app.vault, "/")].concat(
			this.app.vault.getAllFolders(),
		);

		const normalizedQuery = this.normalizeQuery(query);

		return allFolders.filter((folder) => {
			const displayPath = this.formatPath(folder.path);
			return displayPath.toLowerCase().includes(normalizedQuery);
		});
	}

	renderSuggestion(folder: TFolder, el: HTMLElement): void {
		const pathText = this.formatPath(folder.path);
		el.createEl("div", { text: pathText });
		el.addClass("mod-folder");
	}

	protected formatSelectedPath(path: string): string {
		// Empty string for root, otherwise ensure trailing slash
		return path ? (path.endsWith("/") ? path : `${path}/`) : "";
	}
}

/**
 * Suggests existing file paths within the vault
 */
// export class FileSuggest extends PathSuggest<TFile> {
// 	constructor(
// 		app: App,
// 		inputEl: HTMLInputElement,
// 		private fileExtension?: string
// 	) {
// 		super(app, inputEl);
// 	}

// 	getSuggestions(query: string): TFile[] {
// 		const allFiles = this.app.vault.getFiles();
// 		const normalizedQuery = this.normalizeQuery(query);

// 		return allFiles.filter((file) => {
// 			// Filter by extension if specified
// 			if (this.fileExtension && !file.path.endsWith(this.fileExtension)) {
// 				return false;
// 			}

// 			return file.path.toLowerCase().includes(normalizedQuery);
// 		});
// 	}

// 	renderSuggestion(file: TFile, el: HTMLElement): void {
// 		el.createEl("div", { text: file.path });
// 		el.addClass("mod-file");
// 	}

// 	protected formatSelectedPath(path: string): string {
// 		return path; // Files don't need trailing slash
// 	}
// }

/**
 * Combined folder and file suggestion utility
 */
// export class FileChooserSuggest extends AbstractInputSuggest<TAbstractFile> {
// 	constructor(
// 		app: App,
// 		protected inputEl: HTMLInputElement,
// 		private options: {
// 			showFolders?: boolean;
// 			showFiles?: boolean;
// 			fileExtension?: string;
// 		} = {}
// 	) {
// 		super(app, inputEl);
// 		this.options = {
// 			showFolders: true,
// 			showFiles: true,
// 			...options,
// 		};
// 	}

// 	getSuggestions(query: string): TAbstractFile[] {
// 		const items: TAbstractFile[] = [];
// 		const normalizedQuery = query
// 			.toLowerCase()
// 			.replace(/^\//, "")
// 			.replace(/\/$/, "");

// 		// Add folders if enabled
// 		if (this.options.showFolders) {
// 			const folders: TFolder[] = [
// 				// @ts-expect-error - Creating root folder instance
// 				new TFolder(this.app.vault, "/"),
// 			].concat(this.app.vault.getAllFolders());

// 			items.push(
// 				...folders.filter((f) => {
// 					const displayPath = f.path === "" ? "Vault Root /" : f.path;
// 					return displayPath.toLowerCase().includes(normalizedQuery);
// 				})
// 			);
// 		}

// 		// Add files if enabled
// 		if (this.options.showFiles) {
// 			const files = this.app.vault.getFiles().filter((file) => {
// 				// Filter by extension if specified
// 				if (
// 					this.options.fileExtension &&
// 					!file.path.endsWith(this.options.fileExtension)
// 				) {
// 					return false;
// 				}

// 				return file.path.toLowerCase().includes(normalizedQuery);
// 			});

// 			items.push(...files);
// 		}

// 		// Sort: folders first, then files
// 		return items.sort((a, b) => {
// 			if (a instanceof TFolder && b instanceof TFile) return -1;
// 			if (a instanceof TFile && b instanceof TFolder) return 1;
// 			return a.path.localeCompare(b.path);
// 		});
// 	}

// 	renderSuggestion(item: TAbstractFile, el: HTMLElement): void {
// 		if (item instanceof TFolder) {
// 			const pathText = item.path === "" ? "Vault Root /" : item.path;
// 			el.createEl("div", { text: pathText });
// 			el.addClass("mod-folder");
// 		} else if (item instanceof TFile) {
// 			el.createEl("div", { text: item.path });
// 			el.addClass("mod-file");
// 		}
// 	}

// 	selectSuggestion(item: TAbstractFile): void {
// 		let selectedPath: string;

// 		if (item instanceof TFolder) {
// 			// Folders: ensure trailing slash (empty for root)
// 			selectedPath = item.path
// 				? item.path.endsWith("/")
// 					? item.path
// 					: `${item.path}/`
// 				: "";
// 		} else {
// 			// Files: no trailing slash
// 			selectedPath = item.path;
// 		}

// 		this.inputEl.value = selectedPath;
// 		this.inputEl.trigger("input");
// 		this.inputEl.trigger("change");
// 		this.close();
// 	}
// }

type FilePathPromptModalOptions = {
	baseFileName: string;
	initialPath?: string;
};

type FilePathPromptModalResult = {
	fullPath: string | null;
	baseFileName: string | null;
	resolved: boolean;
};

class FilePathPromptModal extends Modal {
	private folderPath: string; // Destination folder path (without leading/trailing slashes)
	private fileName: string; // File name without extension
	private baseFileName: string; // Original note name for display
	private resolve: (result: FilePathPromptModalResult) => void = () => {};
	private isResolved: boolean = false; // Prevents double resolution

	constructor(
		app: App,
		{ baseFileName, initialPath = "/" }: FilePathPromptModalOptions,
	) {
		super(app);
		this.baseFileName = baseFileName;

		// Parse initial path into folder and filename
		const { folder, file } = this.parseFullPath(initialPath);
		this.folderPath = folder;
		this.fileName = file;
	}

	/**
	 * Splits a full path into folder and filename components
	 * Examples:
	 *   "folder/subfolder/file" -> { folder: "folder/subfolder", file: "file" }
	 *   "file" -> { folder: "", file: "file" }
	 *   "/folder/file" -> { folder: "folder", file: "file" }
	 */
	private parseFullPath(path: string): { folder: string; file: string } {
		const normalized = path.replace(/^\/+|\/+$/g, ""); // Remove leading/trailing slashes
		const lastSlashIndex = normalized.lastIndexOf("/");

		if (lastSlashIndex === -1) {
			return { folder: "", file: normalized };
		}

		return {
			folder: normalized.substring(0, lastSlashIndex),
			file: normalized.substring(lastSlashIndex + 1),
		};
	}

	/**
	 * Combines folder path and filename into a full path
	 * Handles empty folder paths correctly
	 */
	private buildFullPath(): string {
		const cleanFolder = this.folderPath.replace(/^\/+|\/+$/g, "");
		const cleanFile = this.fileName.trim();

		if (!cleanFolder) {
			return cleanFile;
		}

		return `${cleanFolder}/${cleanFile}`;
	}

	/**
	 * Validates and submits the form
	 */
	private submit(): void {
		if (!this.fileName.trim()) {
			new Notice(t("notices.fileNameCannotBeEmpty"));
			return;
		}

		this.resolveAndClose({
			fullPath: this.buildFullPath(),
			baseFileName: this.baseFileName,
			resolved: true,
		});
	}

	/**
	 * Resolves the promise and closes the modal
	 * Ensures resolution happens only once
	 */
	private resolveAndClose(result: FilePathPromptModalResult): void {
		if (!this.isResolved) {
			this.isResolved = true;
			this.resolve(result);
			this.close();
		}
	}

	/**
	 * Handles keyboard shortcuts
	 */
	private onKeydown(e: KeyboardEvent): void {
		if (e.key === "Enter") {
			this.submit();
		} else if (e.key === "Escape") {
			this.resolveAndClose({
				fullPath: null,
				baseFileName: null,
				resolved: false,
			});
		}
	}

	onOpen(): void {
		const { contentEl, titleEl } = this;
		titleEl.setText(t("modals.confirmSaveLocation.title"));

		contentEl.createEl("p", {
			text: t("modals.confirmSaveLocation.convertingNote", {
				title: this.baseFileName,
			}),
		});

		// File name input
		new Setting(contentEl)
			.setName(t("modals.confirmSaveLocation.fileName.name"))
			.setDesc(t("modals.confirmSaveLocation.fileName.desc"))
			.addText((text) => {
				text
					.setPlaceholder(t("modals.confirmSaveLocation.fileName.placeholder"))
					.setValue(this.fileName)
					.onChange((value) => {
						this.fileName = value;
					});
				text.inputEl.addEventListener("keydown", (e) => this.onKeydown(e));
			});

		// Folder path input with autocomplete
		new Setting(contentEl)
			.setName(t("modals.confirmSaveLocation.folderPath.name"))
			.setDesc(t("modals.confirmSaveLocation.folderPath.desc"))
			.addSearch((search) => {
				search
					.setPlaceholder(
						t("modals.confirmSaveLocation.folderPath.placeholder"),
					)
					.setValue(this.folderPath)
					.onChange((value) => {
						this.folderPath = value;
					});
				search.inputEl.addEventListener("keydown", (e) => this.onKeydown(e));
				new FolderSuggest(this.app, search.inputEl);
			});

		// Action buttons
		new Setting(contentEl)
			.addButton((btn) =>
				btn
					.setButtonText(t("modals.confirmSaveLocation.buttons.save"))
					.setCta()
					.onClick(() => this.submit()),
			)
			.addButton((btn) =>
				btn
					.setButtonText(t("modals.confirmSaveLocation.buttons.cancel"))
					.onClick(() =>
						this.resolveAndClose({
							fullPath: null,
							baseFileName: null,
							resolved: false,
						}),
					),
			);
	}

	onClose(): void {
		this.contentEl.empty();

		// Handle cancellation if not already resolved
		if (!this.isResolved) {
			this.isResolved = true;
			this.resolve({
				fullPath: null,
				baseFileName: null,
				resolved: false,
			});
		}
	}

	/**
	 * Opens the modal and returns a promise that resolves with the user's input
	 */
	public async waitForResult(): Promise<FilePathPromptModalResult> {
		return new Promise((resolve) => {
			this.resolve = resolve;
			this.open();
		});
	}
}

export async function showFilePathPrompt(
	app: App,
	options: FilePathPromptModalOptions,
): Promise<FilePathPromptModalResult> {
	return new FilePathPromptModal(app, options).waitForResult();
}

export function setDisabled(el: HTMLElement, disabled: boolean) {
	el.toggleClass("is-disabled", disabled);
	el.setAttr("aria-disabled", disabled ? "true" : "false");
}
