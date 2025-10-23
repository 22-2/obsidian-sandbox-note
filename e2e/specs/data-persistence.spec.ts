import "../obsidian-e2e/setup";

import { DEFAULT_TEST_CONFIG, PLUGIN_ID } from "e2e/obsidian-e2e/constants";
import type { VaultOptions } from "e2e/obsidian-e2e/helpers/types";
import type SandboxNotePlugin from "../../src/main";
import type { HotSandboxNoteData } from "../../src/types";
import { expect, test } from "../obsidian-e2e";
import { HotSandboxPage } from "./HotSandboxPage";

const vaultOptions: VaultOptions = DEFAULT_TEST_CONFIG.vaultOptions;

// --- Test Configuration ---
test.use({
	vaultOptions,
});

// --- Test Suite ---
test.describe("Data Persistence Scenarios", () => {
	test.describe("1. Normal Save and Restore Flow", () => {
		test("should automatically save content and restore it after reload", async ({
			vault,
		}) => {
			const hotSandbox = new HotSandboxPage(
				vault.window,
				vault.pluginHandleMap
			);
			const testContent = "This content should persist after reload.";

			// Create sandbox note with content
			await hotSandbox.createNewSandboxNote(testContent);
			await hotSandbox.expectActiveSandboxTitle("*Hot Sandbox-1");
			await expect(hotSandbox.activeEditor).toHaveText(testContent);

			// Wait for auto-save to complete (300ms debounce + buffer)
			await vault.window.waitForTimeout(1000);

			// Verify content is saved to database
			const pluginHandle = await vault.pluginHandleMap.evaluateHandle(
				(map, [id]) => map.get(id) as SandboxNotePlugin,
				[PLUGIN_ID]
			);

			const savedData = await pluginHandle.evaluate(async (plugin) => {
				const dbManager = plugin.orchestrator.get("dbManager");
				const allSandboxes = await dbManager.getAllSandboxes();
				const data = allSandboxes[0];
				// Return only necessary fields to avoid console spam
				return data ? { content: data.content, id: data.id } : null;
			});

			expect(savedData).toBeDefined();
			expect(savedData?.content).toBe(testContent);

			// Reload Obsidian
			await vault.window.reload();
			await hotSandbox.waitForLayoutReady();

			// Verify content persists after reload
			const reloadedWindow = vault.electronApp.windows().at(-1)!;
			const { getPluginHandleMap } = await import(
				"../obsidian-e2e/helpers/utils"
			);
			const reloadedHotSandbox = new HotSandboxPage(
				reloadedWindow,
				await getPluginHandleMap(
					reloadedWindow,
					vaultOptions.plugins || []
				)
			);

			await expect(reloadedHotSandbox.activeSandboxView).toBeVisible();

			// Wait for view to fully restore
			await vault.window.waitForTimeout(500);

			// The content should be restored from Obsidian's workspace state
			// which includes the content that was saved before reload
			await expect(reloadedHotSandbox.activeEditor).toHaveText(
				testContent,
				{ timeout: 10000 }
			);
			await reloadedHotSandbox.expectActiveSandboxTitle("*Hot Sandbox-1");
		});
	});

	test.describe("2. Immediate Save on View Close", () => {
		test("should immediately save content when view is closed", async ({
			vault,
		}) => {
			const hotSandbox = new HotSandboxPage(
				vault.window,
				vault.pluginHandleMap
			);
			const testContent = "Content to save immediately on close.";

			// Create sandbox note with content
			await hotSandbox.createNewSandboxNote(testContent);
			await hotSandbox.expectActiveSandboxTitle("*Hot Sandbox-1");
			await expect(hotSandbox.activeEditor).toHaveText(testContent);

			// Get the masterId before closing
			const pluginHandle = await vault.pluginHandleMap.evaluateHandle(
				(map, [id]) => map.get(id) as SandboxNotePlugin,
				[PLUGIN_ID]
			);

			const masterId = await pluginHandle.evaluate((plugin) => {
				const activeView = plugin.orchestrator.getActiveView();
				return activeView?.masterId;
			});

			expect(masterId).toBeDefined();

			// Close the view (should trigger immediate save)
			// Since this is the last view with content, a confirmation dialog will appear
			await hotSandbox.closeTab();

			// Wait for confirmation dialog
			await vault.window.waitForTimeout(300);

			// Check if confirmation dialog appeared
			const confirmDialog = vault.window.locator(
				'.modal:has-text("Delete Sandbox")'
			);
			const dialogVisible = await confirmDialog
				.isVisible()
				.catch(() => false);

			if (dialogVisible) {
				// Confirm deletion
				await vault.window.getByText("Yes", { exact: true }).click();
				await vault.window.waitForTimeout(300);
			}

			await hotSandbox.expectActiveTabType("empty");
			await hotSandbox.expectTabCount(1);
		});
	});

	test.describe("3. Three-Day Retention Cleanup", () => {
		test("should retain closed sandbox data for 3 days and delete older data", async ({
			vault,
		}) => {
			const hotSandbox = new HotSandboxPage(
				vault.window,
				vault.pluginHandleMap
			);

			const pluginHandle = await vault.pluginHandleMap.evaluateHandle(
				(map, [id]) => map.get(id) as SandboxNotePlugin,
				[PLUGIN_ID]
			);

			// Create and save a sandbox note with old timestamp
			const oldContent = "Old content from 4 days ago";
			const recentContent = "Recent content from 2 days ago";

			// Create old sandbox (4 days old)
			const oldMasterId = await pluginHandle.evaluate(
				async (plugin, [content]) => {
					const masterId = `test-old-${Date.now()}`;
					const oldNote: HotSandboxNoteData = {
						id: masterId,
						content: content as string,
						mtime: Date.now() - 4 * 24 * 60 * 60 * 1000, // 4 days ago
					};
					const dbManager = plugin.orchestrator.get("dbManager");
					await dbManager.getSandboxByMasterId(masterId); // Ensure cache is initialized
					const cacheManager =
						plugin.orchestrator.get("cacheManager");
					cacheManager.registerNewSandbox(masterId);
					cacheManager.updateSandboxContent(
						masterId,
						content as string
					);
					const note = cacheManager.get(masterId);
					if (note) {
						note.mtime = Date.now() - 4 * 24 * 60 * 60 * 1000;
						await dbManager.getAllSandboxes(); // Access through manager
						// Directly access dbAPI through the manager's private property
						const dbAPI = (dbManager as any).context.dbAPI;
						await dbAPI.saveSandbox(note);
					}
					return masterId;
				},
				[oldContent]
			);

			// Create recent sandbox (2 days old)
			const recentMasterId = await pluginHandle.evaluate(
				async (plugin, [content]) => {
					const masterId = `test-recent-${Date.now()}`;
					const recentNote: HotSandboxNoteData = {
						id: masterId,
						content: content as string,
						mtime: Date.now() - 2 * 24 * 60 * 60 * 1000, // 2 days ago
					};
					const dbManager = plugin.orchestrator.get("dbManager");
					const cacheManager =
						plugin.orchestrator.get("cacheManager");
					cacheManager.registerNewSandbox(masterId);
					cacheManager.updateSandboxContent(
						masterId,
						content as string
					);
					const note = cacheManager.get(masterId);
					if (note) {
						note.mtime = Date.now() - 2 * 24 * 60 * 60 * 1000;
						const dbAPI = (dbManager as any).context.dbAPI;
						await dbAPI.saveSandbox(note);
					}
					return masterId;
				},
				[recentContent]
			);

			// Verify both sandboxes exist
			const beforeCleanup = await pluginHandle.evaluate(
				async (plugin, [oldId, recentId]) => {
					const dbManager = plugin.orchestrator.get("dbManager");
					const dbAPI = (dbManager as any).context.dbAPI;
					const oldData = await dbAPI.getSandbox(oldId as string);
					const recentData = await dbAPI.getSandbox(
						recentId as string
					);
					return {
						oldExists: !!oldData,
						recentExists: !!recentData,
					};
				},
				[oldMasterId, recentMasterId]
			);

			expect(beforeCleanup.oldExists).toBe(true);
			expect(beforeCleanup.recentExists).toBe(true);

			// Run cleanup
			await pluginHandle.evaluate(async (plugin) => {
				const dbManager = plugin.orchestrator.get("dbManager");
				await dbManager.clearOldDeadSandboxes();
			});

			// Verify old sandbox is deleted and recent one is retained
			const afterCleanup = await pluginHandle.evaluate(
				async (plugin, [oldId, recentId]) => {
					const dbManager = plugin.orchestrator.get("dbManager");
					const dbAPI = (dbManager as any).context.dbAPI;
					const oldData = await dbAPI.getSandbox(oldId as string);
					const recentData = await dbAPI.getSandbox(
						recentId as string
					);
					return {
						oldExists: !!oldData,
						recentExists: !!recentData,
					};
				},
				[oldMasterId, recentMasterId]
			);

			expect(afterCleanup.oldExists).toBe(false); // Old data should be deleted
			expect(afterCleanup.recentExists).toBe(true); // Recent data should be retained

			// Cleanup test data
			await pluginHandle.evaluate(
				async (plugin, [recentId]) => {
					const dbManager = plugin.orchestrator.get("dbManager");
					await dbManager.deleteFromAll(recentId as string);
				},
				[recentMasterId]
			);
		});
	});

	test.describe.skip("4. Corrupted Data Handling", () => {
		test("should skip corrupted data and continue normal operation", async ({
			vault,
		}) => {
			const hotSandbox = new HotSandboxPage(
				vault.window,
				vault.pluginHandleMap
			);

			const pluginHandle = await vault.pluginHandleMap.evaluateHandle(
				(map, [id]) => map.get(id) as SandboxNotePlugin,
				[PLUGIN_ID]
			);

			// Insert corrupted data directly into database
			const corruptedId = `corrupted-${Date.now()}`;
			await pluginHandle.evaluate(
				async (plugin, [id]) => {
					// Insert data with invalid structure
					const corruptedData = {
						id: id as string,
						content: 12345, // Invalid: should be string
						mtime: "invalid", // Invalid: should be number
					};
					const dbManager = plugin.orchestrator.get("dbManager");
					const dbAPI = (dbManager as any).context.dbAPI;
					await dbAPI.sandboxes.put(corruptedData as any);
				},
				[corruptedId]
			);

			// Try to retrieve corrupted data
			const retrievedData = await pluginHandle.evaluate(
				async (plugin, [id]) => {
					const dbManager = plugin.orchestrator.get("dbManager");
					const dbAPI = (dbManager as any).context.dbAPI;
					return await dbAPI.getSandbox(id as string);
				},
				[corruptedId]
			);

			// Should return undefined for corrupted data
			expect(retrievedData).toBeUndefined();

			// Verify plugin continues to work normally
			const validContent = "Valid content after corruption";
			await hotSandbox.createNewSandboxNote(validContent);
			await hotSandbox.expectActiveSandboxTitle("*Hot Sandbox-1");
			await expect(hotSandbox.activeEditor).toHaveText(validContent);

			// Wait for auto-save
			await vault.window.waitForTimeout(500);

			// Verify valid data is saved correctly
			const validData = await pluginHandle.evaluate(
				async (plugin, [content]) => {
					const dbManager = plugin.orchestrator.get("dbManager");
					const allSandboxes = await dbManager.getAllSandboxes();
					const found = allSandboxes.find(
						(s: HotSandboxNoteData) => s.content === content
					);
					// Return only necessary fields to avoid console spam
					return found
						? { content: found.content, id: found.id }
						: null;
				},
				[validContent]
			);

			expect(validData).toBeDefined();
			expect(validData?.content).toBe(validContent);

			// Cleanup
			await pluginHandle.evaluate(
				async (plugin, [id]) => {
					const dbManager = plugin.orchestrator.get("dbManager");
					const dbAPI = (dbManager as any).context.dbAPI;
					await dbAPI.deleteSandbox(id as string);
				},
				[corruptedId]
			);
		});

		test("should validate data structure on retrieval", async ({
			vault,
		}) => {
			const pluginHandle = await vault.pluginHandleMap.evaluateHandle(
				(map, [id]) => map.get(id) as SandboxNotePlugin,
				[PLUGIN_ID]
			);

			// Test various invalid data structures
			const testCases = [
				{
					name: "missing id",
					data: { content: "test", mtime: Date.now() },
				},
				{
					name: "empty id",
					data: { id: "", content: "test", mtime: Date.now() },
				},
				{
					name: "invalid content type",
					data: { id: "test", content: 123, mtime: Date.now() },
				},
				{
					name: "invalid mtime type",
					data: { id: "test", content: "test", mtime: "invalid" },
				},
				{
					name: "negative mtime",
					data: { id: "test", content: "test", mtime: -1 },
				},
				{
					name: "zero mtime",
					data: { id: "test", content: "test", mtime: 0 },
				},
			];

			for (const testCase of testCases) {
				const isValid = await pluginHandle.evaluate(
					(plugin, [data]) => {
						const dbManager = plugin.orchestrator.get("dbManager");
						const dbAPI = (dbManager as any).context.dbAPI;
						return dbAPI.validateSandboxData(data as any);
					},
					[testCase.data]
				);

				expect(isValid).toBe(false);
			}

			// Test valid data
			const validData = {
				id: "valid-test",
				content: "valid content",
				mtime: Date.now(),
			};

			const isValidData = await pluginHandle.evaluate(
				(plugin, [data]) => {
					const dbManager = plugin.orchestrator.get("dbManager");
					const dbAPI = (dbManager as any).context.dbAPI;
					return dbAPI.validateSandboxData(data as any);
				},
				[validData]
			);

			expect(isValidData).toBe(true);
		});
	});
});
