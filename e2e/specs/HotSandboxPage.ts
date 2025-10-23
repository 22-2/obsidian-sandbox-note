import {
	CMD_ID_CONVERT_TO_FILE,
	CMD_ID_NEW_HOT_SANDBOX,
	DATAT_TYPE_MARKDOWN,
	DATA_TYPE_HOT_SANDBOX,
	PLUGIN_ID,
} from "e2e/obsidian-e2e/constants";
import { CustomViewPageObject } from "e2e/obsidian-e2e/helpers/ObsidianPageObject";
import type { VaultPageTextContext } from "e2e/obsidian-e2e/helpers/types";
import type { Page } from "playwright";
import { expect } from "playwright/test";
import type SandboxNotePlugin from "src/main";
import { VIEW_TYPE_HOT_SANDBOX } from "../../src/utils/constants";

/**
 * Hot Sandbox専用のPage Object
 */
export class HotSandboxPage extends CustomViewPageObject {
	// Hot Sandbox固有のセレクタ
	get activeSandboxView() {
		return this.getViewByType(VIEW_TYPE_HOT_SANDBOX);
	}

	get activeSandboxTitle() {
		return this.getTitleByType(VIEW_TYPE_HOT_SANDBOX);
	}

	get allSandboxViews() {
		return this.getAllViewsByType(VIEW_TYPE_HOT_SANDBOX);
	}

	constructor(
		page: Page,
		pluginHandleMap?: VaultPageTextContext["pluginHandleMap"]
	) {
		super(page, VIEW_TYPE_HOT_SANDBOX, pluginHandleMap);
	}

	// ===== Hot Sandbox固有のアクション =====

	async getActiveEditorContent(): Promise<string> {
		const pluginHandle = await this.getPlugin<SandboxNotePlugin>(PLUGIN_ID);
		return pluginHandle.evaluate((plugin) => {
			const activeView = plugin.orchestrator.getActiveView();
			if (!activeView) throw new Error("No active editor found");
			return activeView.getContent();
		});
	}

	async createNewSandboxNote(content?: string): Promise<void> {
		await this.runCommand(CMD_ID_NEW_HOT_SANDBOX);
		await expect(this.activeSandboxView.last()).toBeVisible();

		if (content) {
			await this.setActiveEditorContent(content);
		}
	}

	async convertToFile(fileName: string, folderPath?: string): Promise<void> {
		// ファイル変換のコマンドを実行
		await this.runCommand(CMD_ID_CONVERT_TO_FILE);

		// ファイル名入力のモーダルが表示されるのを待つ
		const modal = this.page.locator(".modal");
		await expect(modal).toBeVisible();

		// ファイル名を入力
		const fileNameInput = modal.locator(
			'input[placeholder="e.g., My Scratchpad"]'
		);
		await fileNameInput.fill(fileName);

		// フォルダパスが指定されている場合は入力
		if (folderPath) {
			const folderInput = modal.locator(
				'input[placeholder*="e.g., Notes/Daily"]'
			);
			await folderInput.fill(folderPath);
			await folderInput.press("Enter");
			await expect(this.page.locator(".suggestion")).not.toBeVisible();
		}

		// 確定ボタンをクリック
		await modal.getByText("Save", { exact: true }).click();
		await expect(modal).not.toBeVisible();
	}

	async closeTab(): Promise<void> {
		await this.closeActiveTab();
	}

	async waitForSaved() {
		const pluginHandle = await this.getPlugin<SandboxNotePlugin>(PLUGIN_ID);
		return pluginHandle.evaluate(
			(plugin) =>
				new Promise((resolve, reject) => {
					plugin.emitter.on("save-result", (data) => {
						if (data.success) {
							resolve(true);
						} else {
							reject(false);
						}
					});
				})
		);
	}

	// ===== Hot Sandbox固有のアサーション =====

	async expectSandboxViewCount(count: number): Promise<void> {
		await this.expectViewCount(VIEW_TYPE_HOT_SANDBOX, count);
	}

	async expectActiveSandboxTitle(title: string): Promise<void> {
		await expect(this.activeSandboxTitle).toHaveText(title);
	}

	async expectActiveSandboxTitleToContain(text: string): Promise<void> {
		await expect(this.activeSandboxTitle).toContainText(text);
	}

	async expectSourceMode(isLivePreview: boolean): Promise<void> {
		const editor = this.page.locator(
			`${this.getDatatype(DATA_TYPE_HOT_SANDBOX)} ${this.getDatatype(
				DATAT_TYPE_MARKDOWN
			)} .markdown-source-view`
		);
		if (isLivePreview) {
			// Live Preview mode - should have .is-live-preview class
			await expect(editor).toHaveClass(/is-live-preview/);
		} else {
			// Source mode - should not have .is-live-preview class
			await expect(editor).not.toHaveClass(/is-live-preview/);
		}
	}
}
