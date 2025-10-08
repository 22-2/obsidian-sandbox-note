import { CMD_ID_CLOSE_TAB, CMD_ID_UNDO_CLOSE_TAB } from "e2e/constants";
import type { JSHandle, Locator, Page } from "playwright";
import { expect } from "playwright/test";
import type { VaultOptions } from "./managers/VaultManager";
import type { VaultPageTextContext } from "./types";

export interface PageObjectConfig {
	viewType?: string;
	pluginId?: string;
}

/**
 * 汎用的なObsidian Page Objectベースクラス
 */
export class ObsidianPageObject {
	// 共通セレクタ定数
	protected readonly ACTIVE_LEAF = ".workspace-leaf.mod-active";
	protected readonly ACTIVE_TAB_HEADER =
		".workspace-tab-header.mod-active.is-active";
	protected readonly ACTIVE_EDITOR = ".cm-content";
	protected readonly TAB_HEADER_CONTAINER =
		".mod-root .workspace-tab-header-container-inner";

	constructor(
		protected page: Page,
		protected pluginHandleMap?: VaultPageTextContext["pluginHandleMap"],
		protected config: PageObjectConfig = {}
	) {}

	// ===== セレクタヘルパー =====

	protected getDatatype(viewType: string): string {
		return `[data-type="${viewType}"]`;
	}

	protected getActiveView(type: string): string {
		return `${this.ACTIVE_LEAF} > .workspace-leaf-content${this.getDatatype(
			type
		)}`;
	}

	protected getActiveTitle(type: string): string {
		return `${this.ACTIVE_TAB_HEADER}${this.getDatatype(type)}`;
	}

	protected getAllViews(type: string): string {
		return this.getActiveView(type).replace(".mod-active", "");
	}

	// ===== 基本セレクタ =====

	get activeLeaf(): Locator {
		return this.page.locator(this.ACTIVE_LEAF);
	}

	get activeEditor(): Locator {
		return this.page.locator(`${this.ACTIVE_LEAF} ${this.ACTIVE_EDITOR}`);
	}

	get activeTabHeader(): Locator {
		return this.page.locator(this.ACTIVE_TAB_HEADER);
	}

	get allTabs(): Locator {
		return this.page.locator(this.TAB_HEADER_CONTAINER);
	}

	// ===== 動的セレクタ生成 =====

	getViewByType(viewType: string): Locator {
		return this.page.locator(this.getActiveView(viewType));
	}

	getTitleByType(viewType: string): Locator {
		return this.page.locator(this.getActiveTitle(viewType));
	}

	getAllViewsByType(viewType: string): Locator {
		return this.page.locator(this.getAllViews(viewType));
	}

	// ===== 参照の再構築 =====

	async rebuildReferences(
		vaultOptions: VaultOptions,
		getPluginHandleMapFn: (page: Page, plugins: any[]) => Promise<any>
	): Promise<void> {
		this.pluginHandleMap = await getPluginHandleMapFn(
			this.page,
			vaultOptions.plugins || []
		);
	}

	// ===== 基本アクション =====

	async runCommand(commandId: string): Promise<void> {
		const success = await this.page.evaluate(
			(id) => app.commands.executeCommandById(id),
			commandId
		);
		expect(success).toBe(true);
	}

	async clearActiveEditor(): Promise<void> {
		await this.activeEditor.focus();
		await this.page.keyboard.press("Control+A");
		await this.page.keyboard.press("Backspace");
	}

	// ===== ワークスペース操作 =====

	async splitVertically(): Promise<void> {
		await this.page.evaluate(() =>
			app.workspace.duplicateLeaf(app.workspace.activeLeaf!, "vertical")
		);
	}

	async splitHorizontally(): Promise<void> {
		await this.page.evaluate(() =>
			app.workspace.duplicateLeaf(app.workspace.activeLeaf!, "horizontal")
		);
	}

	async closeActiveTab(): Promise<void> {
		await this.activeEditor.focus();
		await this.runCommand(CMD_ID_CLOSE_TAB);
	}

	async clickCloseButtonOnActiveTab(): Promise<void> {
		// アクティブなタブヘッダーの中にある .workspace-tab-header-inner-close-button を探す
		const closeButton = this.page.locator(
			`${this.ACTIVE_TAB_HEADER} .workspace-tab-header-inner-close-button`
		);
		await expect(closeButton).toBeVisible();
		await closeButton.click();
	}

	async undoCloseTab(): Promise<void> {
		await this.runCommand(CMD_ID_UNDO_CLOSE_TAB);
	}

	async goBackInHistory(): Promise<void> {
		await this.page.evaluate(() =>
			app.workspace.activeLeaf?.history.back()
		);
	}

	async goForwardInHistory(): Promise<void> {
		await this.page.evaluate(() =>
			app.workspace.activeLeaf?.history.forward()
		);
	}

	async switchToLeafIndex(index: number): Promise<void> {
		await this.page.evaluate((i) => {
			const leaves = app.workspace.getLeavesOfType("markdown");
			if (leaves[i]) {
				app.workspace.setActiveLeaf(leaves[i], { focus: true });
			}
		}, index);
	}

	// ===== ファイル操作 =====

	async fileExists(path: string): Promise<boolean> {
		return this.page.evaluate((p) => app.vault.adapter.exists(p), path);
	}

	async readFile(path: string): Promise<string> {
		return this.page.evaluate((p) => app.vault.adapter.read(p), path);
	}

	async writeFile(path: string, content: string): Promise<void> {
		await this.page.evaluate(([p, c]) => app.vault.adapter.write(p, c), [
			path,
			content,
		] as const);
	}

	async deleteFile(path: string): Promise<void> {
		await this.page.evaluate((p) => app.vault.adapter.remove(p), path);
	}

	async openFile(path: string): Promise<void> {
		await this.page.evaluate(async (p) => {
			const file = app.vault.getAbstractFileByPath(p);
			if (file) {
				await app.workspace.getLeaf().openFile(file as any);
			}
		}, path);
	}

	// ===== データ取得 =====

	async getActiveFileContent(): Promise<string | undefined> {
		return this.page.evaluate(() =>
			app.workspace.activeEditor?.editor?.getValue()
		);
	}

	async getActiveFilePath(): Promise<string | null> {
		return this.page.evaluate(
			() => app.workspace.getActiveFile()?.path ?? null
		);
	}

	async getTabInnerTitle(): Promise<string | null> {
		return this.page.evaluate(
			() =>
				app.workspace.activeLeaf?.tabHeaderInnerTitleEl.textContent ??
				null
		);
	}

	async getActiveViewType(): Promise<string | null> {
		return this.page.evaluate(
			() => app.workspace.activeLeaf?.view.getViewType() ?? null
		);
	}

	async getOpenFiles(): Promise<string[]> {
		return this.page.evaluate(() =>
			app.workspace
				.getLeavesOfType("markdown")
				.map((leaf: any) => leaf.view.file?.path ?? "")
		);
	}

	// ===== プラグイン操作 =====

	async getPlugin<T = any>(pluginId: string): Promise<JSHandle<T>> {
		if (!this.pluginHandleMap) {
			throw new Error("pluginHandleMap is not initialized");
		}
		return this.pluginHandleMap.evaluateHandle(
			(map, id) => map.get(id) as T,
			pluginId
		);
	}

	async isPluginEnabled(pluginId: string): Promise<boolean> {
		return this.page.evaluate(
			(id) => !!app.plugins.enabledPlugins.has(id),
			pluginId
		);
	}

	// ===== 待機・同期 =====

	async waitForLayoutReady(): Promise<void> {
		await this.page.waitForFunction(
			() => typeof app !== undefined && app.workspace.layoutReady
		);
	}

	async waitForFileCreated(path: string, timeout = 5000): Promise<void> {
		await this.page.waitForFunction(
			(p) => app.vault.adapter.exists(p),
			path,
			{ timeout }
		);
	}

	async waitForViewType(viewType: string, timeout = 5000): Promise<void> {
		await this.page.waitForFunction(
			(type) => app.workspace.activeLeaf?.view.getViewType() === type,
			viewType,
			{ timeout }
		);
	}

	// ===== アサーション =====

	async expectViewCount(viewType: string, count: number): Promise<void> {
		await expect(this.getAllViewsByType(viewType)).toHaveCount(count);
	}

	async expectActiveTitle(viewType: string, title: string): Promise<void> {
		await expect(this.getTitleByType(viewType)).toHaveText(title);
	}

	async expectActiveTitleToContain(
		viewType: string,
		text: string
	): Promise<void> {
		await expect(this.getTitleByType(viewType)).toContainText(text);
	}

	async expectActiveTabType(type: string): Promise<void> {
		await expect(this.activeTabHeader).toHaveAttribute("data-type", type);
	}

	async expectTabCount(count: number): Promise<void> {
		await expect(this.allTabs).toHaveCount(count);
	}

	async expectFileExists(path: string): Promise<void> {
		const exists = await this.fileExists(path);
		expect(exists).toBe(true);
	}

	async expectFileNotExists(path: string): Promise<void> {
		const exists = await this.fileExists(path);
		expect(exists).toBe(false);
	}

	async expectActiveEditorContent(content: string): Promise<void> {
		await expect(this.activeEditor).toHaveText(content);
	}

	async expectActiveEditorToContain(text: string): Promise<void> {
		await expect(this.activeEditor).toContainText(text);
	}
}

/**
 * 使用例: カスタムビュー用のPage Object
 */
export class CustomViewPageObject extends ObsidianPageObject {
	constructor(
		page: Page,
		private customViewType: string,
		pluginHandleMap?: VaultPageTextContext["pluginHandleMap"]
	) {
		super(page, pluginHandleMap, { viewType: customViewType });
	}

	get activeCustomView(): Locator {
		return this.getViewByType(this.customViewType);
	}

	get activeCustomTitle(): Locator {
		return this.getTitleByType(this.customViewType);
	}

	async setActiveEditorContent(content: string): Promise<void> {
		await this.activeEditor.focus();
		await this.activeEditor.fill(content);
	}

	async openCustomView(commandId: string, content?: string): Promise<void> {
		await this.runCommand(commandId);
		await expect(this.activeCustomView.last()).toBeVisible();

		if (content) {
			await this.setActiveEditorContent(content);
		}
	}

	async expectCustomViewCount(count: number): Promise<void> {
		await this.expectViewCount(this.customViewType, count);
	}

	async expectCustomViewTitle(title: string): Promise<void> {
		await this.expectActiveTitle(this.customViewType, title);
	}
}
