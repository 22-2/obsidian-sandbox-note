// E:\Desktop\coding\pub\obsidian-sandbox-note\e2e\specs\setup\example.spec.ts
import { VIEW_TYPE_HOT_SANDBOX } from "src/utils/constants";
import "../setup/log-setup";
// ===================================================================
// Example Test (example.test.mts)
// ===================================================================

import { expect, test } from "../base";
import {
	DEFAULT_TEST_CONFIG,
	PLUGIN_ID,
	SANDBOX_VAULT_NAME,
} from "../constants";
import { HotSandboxPage } from "../specs/HotSandboxPage";

test.use({
	vaultOptions: { ...DEFAULT_TEST_CONFIG, useSandbox: true },
});

test("sandbox test: plugin activation and view creation via command", async ({
	vault,
}) => {
	// Instantiate HotSandboxPage
	const hsPage = new HotSandboxPage(vault.window, vault.pluginHandleMap);

	// 1. Initial setup verification
	// Verify Vault name
	const vaultName = await vault.window.evaluate(() => app.vault.getName());
	expect(vaultName).toBe(SANDBOX_VAULT_NAME);

	// Verify plugin activation
	expect(
		await vault.window.evaluate(
			(pluginId) => app.plugins.getPlugin(pluginId),
			PLUGIN_ID
		)
	).toBeTruthy();

	// 2. Create a new sandbox view (via command)
	// Use HotSandboxPage method
	await hsPage.createNewSandboxNote();

	// 3. Verify the view opened correctly
	await hsPage.expectSandboxViewCount(1);
	await hsPage.expectActiveTabType(VIEW_TYPE_HOT_SANDBOX);
});
