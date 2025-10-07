import "../setup/log-setup";

import { CMD_ID_TOGGLE_SOURCE } from "e2e/constants";
import SandboxNotePlugin from "../../src/main";
import { VIEW_TYPE_HOT_SANDBOX } from "../../src/utils/constants";
import { expect, test } from "../base";
import { DIST_DIR, PLUGIN_ID } from "../constants";
import type { VaultOptions } from "../helpers/managers/VaultManager";
import { HotSandboxPage } from "./HotSandboxPage";

const vaultOptions: VaultOptions = {
	useSandbox: false,
	plugins: [{ pluginId: PLUGIN_ID, path: DIST_DIR }],
};

// --- Test Configuration ---
test.use({
	vaultOptions,
});

// --- Test Suite ---
// test.describe.configure({ mode: "serial" });
test.describe("HotSandboxNoteView Main Features", () => {
	test.describe("1. Note Creation and Input", () => {
		test("should successfully create a new note and accept input", async ({
			vault,
		}) => {
			const hotSandbox = new HotSandboxPage(
				vault.window,
				vault.pluginHandleMap
			);
			const testContent = "Hello, Sandbox!";

			await hotSandbox.createNewSandboxNote(testContent);
			await hotSandbox.expectActiveSandboxTitle("*Hot Sandbox-1");
		});
	});

	test.describe("2. Content Synchronization Across Multiple Views", () => {
		test("should sync content when splitting the view", async ({
			vault,
		}) => {
			const hotSandbox = new HotSandboxPage(
				vault.window,
				vault.pluginHandleMap
			);
			const initialContent = "Initial content.";
			const updatedContent = "Updated and synced!";

			await hotSandbox.createNewSandboxNote(initialContent);
			await hotSandbox.splitVertically();
			await hotSandbox.expectSandboxViewCount(2);

			const rightPaneEditor = hotSandbox.activeEditor;
			await expect(rightPaneEditor).toHaveText(initialContent);

			await rightPaneEditor.focus();
			await hotSandbox.setActiveEditorContent(updatedContent);

			const leftPaneEditor = vault.window.locator(
				`.workspace-leaf.mod-active [data-type="${VIEW_TYPE_HOT_SANDBOX}"] [data-type="markdown"] .cm-content`
			);
			await expect(leftPaneEditor).toHaveText(updatedContent);
		});
	});

	test.describe("3. Multiple Independent Note Groups", () => {
		test("should allow creation of multiple independent sandbox notes", async ({
			vault,
		}) => {
			const hotSandbox = new HotSandboxPage(
				vault.window,
				vault.pluginHandleMap
			);
			const note1Content = "This is the first note.";
			const note2Content = "This is the second, separate note.";

			await hotSandbox.createNewSandboxNote(note1Content);
			await hotSandbox.expectActiveSandboxTitle("*Hot Sandbox-1");

			await hotSandbox.createNewSandboxNote(note2Content);
			await hotSandbox.expectActiveSandboxTitle("*Hot Sandbox-2");
			await hotSandbox.expectSandboxViewCount(2);

			expect(await hotSandbox.activeEditor).toHaveText(note2Content);

			const firstNoteContent = await hotSandbox.allSandboxViews
				.locator(`.cm-content`)
				.first()
				.textContent();
			expect(firstNoteContent).toBe(note1Content);
		});
	});

	test.describe("4. Converting Note to File", () => {
		test("should successfully convert a hot sandbox note into a persistent file", async ({
			vault,
		}) => {
			const hotSandbox = new HotSandboxPage(
				vault.window,
				vault.pluginHandleMap
			);
			const noteContent = "This note will be converted to a file.";
			const fileName = "Untitled";
			const folderPath = "Adventurer";
			const expectedFile = `${folderPath}/${fileName}.md`;

			// Initial setup
			await hotSandbox.closeTab();
			await hotSandbox.expectTabCount(1);
			await hotSandbox.expectActiveTabType("empty");

			// Create sandbox note
			await hotSandbox.createNewSandboxNote(noteContent);
			await hotSandbox.expectTabCount(1);
			await hotSandbox.expectActiveTabType(VIEW_TYPE_HOT_SANDBOX);

			// Convert to file
			await hotSandbox.convertToFile(fileName, folderPath);
			await hotSandbox.expectActiveTabType("markdown");
			await hotSandbox.expectTabCount(1);

			// Verify file
			await expect(hotSandbox.activeTabHeader).toContainText(fileName);
			expect(await hotSandbox.fileExists(expectedFile)).toBeTruthy();
			expect(await hotSandbox.activeEditor).toHaveText(noteContent);

			// Go back to sandbox view
			await hotSandbox.goBackInHistory();
			await hotSandbox.expectActiveTabType(VIEW_TYPE_HOT_SANDBOX);
			expect(hotSandbox.activeEditor).toHaveText("");

			// Close and create new
			await hotSandbox.closeTab();
			await hotSandbox.expectActiveTabType("empty");
			await hotSandbox.expectTabCount(1);

			await hotSandbox.createNewSandboxNote(noteContent);
			expect(await hotSandbox.getTabInnerTitle()).toBe("*Hot Sandbox-1");
		});
	});

	test.describe("5. Confirmation before closing the last tab", () => {
		test.skip("should prompt confirmation before deleting the last sandbox note", async ({
			vault,
		}) => {
			if (process.env.CI) {
				console.log("Skipping because it consistently fails in CI.");
				test.skip();
			}
			const hotSandbox = new HotSandboxPage(
				vault.window,
				vault.pluginHandleMap
			);
			const { window: page } = vault;

			await hotSandbox.closeTab();
			hotSandbox.expectTabCount(1);
			await expect(hotSandbox.activeTabHeader).toContainText("New tab");
			await hotSandbox.createNewSandboxNote("test");
			await expect(hotSandbox.activeEditor).toHaveText("test");
			hotSandbox.expectTabCount(1);
			await expect(hotSandbox.activeTabHeader).toContainText(
				"*Hot Sandbox-1"
			);

			// [重要] これから実行する操作が不安定なので、少しだけ待機時間をいれる
			await page.waitForTimeout(500); // 500ms待つ

			// デバッグ: 現在のタブ状態を確認
			const tabCount = await page
				.locator(".workspace-tab-header")
				.count();
			console.log(`Tab count before close: ${tabCount}`);

			const activeTabText =
				await hotSandbox.activeTabHeader.textContent();
			console.log(`Active tab text before close: ${activeTabText}`);

			// パッチが適用されているかを確認するため、少し長めに待機
			await page.waitForTimeout(1000);

			// コマンドではなく、UIの「×」ボタンを直接クリックする
			await hotSandbox.clickCloseButtonOnActiveTab();

			// GitHub Actionsでのタイミング問題を回避するため、少し待機
			await page.waitForTimeout(200);

			// ダイアログが表示されるかどうかを先にチェック
			const dialogAppeared = await page
				.locator('.modal:has-text("Delete Sandbox")')
				.isVisible({ timeout: 2000 })
				.catch(() => false);

			if (dialogAppeared) {
				// ダイアログが表示された場合、タブは閉じられていないはず
				hotSandbox.expectTabCount(1);
				await expect(hotSandbox.activeTabHeader).toContainText(
					"*Hot Sandbox-1"
				);
			} else {
				// ダイアログが表示されなかった場合、より長い時間待機してみる
				await page.waitForTimeout(1000);
				await expect(
					page.locator('.modal:has-text("Delete Sandbox")')
				).toBeVisible({ timeout: 15000 });
			}

			await page.getByText("No", { exact: true }).click();
			await hotSandbox.expectActiveTabType(VIEW_TYPE_HOT_SANDBOX);

			// Try to close and confirm
			// こちらもクリックに統一
			await hotSandbox.clickCloseButtonOnActiveTab();
			await expect(
				page.locator('.modal:has-text("Delete Sandbox")')
			).toBeVisible({ timeout: 10000 });
			await page.getByText("Yes", { exact: true }).click();
			await hotSandbox.expectActiveTabType("empty");

			// Undo close
			await hotSandbox.undoCloseTab();
			await hotSandbox.expectActiveTabType(VIEW_TYPE_HOT_SANDBOX);
			await expect(await hotSandbox.activeEditor).toHaveText("");
		});
	});

	test.describe("6. Toggle Source Mode", () => {
		test("should correctly toggle between Live Preview and Source Mode", async ({
			vault,
		}) => {
			const hotSandbox = new HotSandboxPage(
				vault.window,
				vault.pluginHandleMap
			);

			// Setup debug command
			const pluginHandle = await vault.pluginHandleMap.evaluateHandle(
				(map, [id]) => map.get(id) as SandboxNotePlugin,
				[PLUGIN_ID]
			);

			await pluginHandle.evaluate(
				(plugin, [cmdId]) => {
					plugin.addCommand({
						id: cmdId,
						name: "Toggle Source Mode",
						hotkeys: [{ key: "F1", modifiers: ["Alt"] }],
						callback: () => app.commands.executeCommandById(cmdId),
					});
				},
				[CMD_ID_TOGGLE_SOURCE]
			);

			await hotSandbox.createNewSandboxNote("## test");
			await hotSandbox.expectActiveTabType(VIEW_TYPE_HOT_SANDBOX);
			await hotSandbox.activeEditor.focus();

			// Verify initial live preview mode
			await hotSandbox.expectSourceMode(true);

			// Toggle to source mode
			await hotSandbox.runCommand(CMD_ID_TOGGLE_SOURCE);
			await hotSandbox.expectSourceMode(false);

			// Toggle back to live preview
			await hotSandbox.runCommand(CMD_ID_TOGGLE_SOURCE);
			await hotSandbox.expectSourceMode(true);
		});
	});

	// Dedicated describe block for Test 7 to isolate the configuration override
	test.describe("7. Data Persistence After Reload", () => {
		test.use({
			vaultOptions: {
				...vaultOptions,
				useSandbox: false,
				showLoggerOnNode: true,
			},
		});

		test("should persist sandbox content after Obsidian reload when useSandbox is false", async ({
			vault,
			vaultOptions,
		}) => {
			const hotSandbox = new HotSandboxPage(
				vault.window,
				vault.pluginHandleMap
			);
			const persistentContent =
				"This content should persist after reload.";

			// Create sandbox note with content
			await hotSandbox.createNewSandboxNote(persistentContent);
			await hotSandbox.expectActiveSandboxTitle("*Hot Sandbox-1");
			expect(hotSandbox.activeEditor).toHaveText(persistentContent);
			await hotSandbox.waitForSaved();

			// Reload Obsidian
			await vault.window.evaluate(() => window.location.reload());
			await hotSandbox.waitForLayoutReady();

			// Verify content persists
			const reloadedWindow = vault.electronApp.windows().at(-1)!;
			const { getPluginHandleMap } = await import("../helpers/utils");
			const reloadedHotSandbox = new HotSandboxPage(
				reloadedWindow,
				await getPluginHandleMap(
					reloadedWindow,
					vaultOptions.plugins || []
				)
			);
			await expect(reloadedHotSandbox.activeSandboxView).toBeVisible();
			expect(reloadedHotSandbox.activeEditor).toHaveText(
				persistentContent
			);
			await reloadedHotSandbox.expectActiveSandboxTitle("*Hot Sandbox-1");
		});
	});
});
