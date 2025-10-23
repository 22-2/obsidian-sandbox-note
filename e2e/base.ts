import { test as base } from "@playwright/test";
import log from "loglevel";
import type { TestFixtures, WorkerFixtures } from "./helpers/types";
import { ObsidianTestSetup } from "./setup/ObsidianTestSetup";

const logger = log.getLogger("obsidianSetup");

// ===================================================================
// Console Logging Helpers
// ===================================================================

function setupBrowserConsoleLogging(window: any): void {
	window.on("console", (msg: any) => {
		const type = msg.type();
		const text = msg.text();

		if (text.length > 500) {
			console.log(`🖥️ BROWSER [${type.toUpperCase()}]: [長文のため省略: ${text.length}文字]`);
			return;
		}

		console.log(`🖥️ BROWSER [${type.toUpperCase()}]: ${text.substring(0, 100)}`);

		const location = msg.location();
		if (location.url && location.url !== "about:blank") {
			console.log(`   📍 Location: ${location.url}:${location.lineNumber}:${location.columnNumber}`);
		}
	});

	window.on("pageerror", (error: Error) => {
		console.log(`🖥️ PAGE ERROR: ${error.message}`);
		if (error.stack) {
			console.log(`   📚 Stack: ${error.stack}`);
		}
	});

	window.on("requestfailed", (request: any) => {
		console.log(`🖥️ REQUEST FAILED: ${request.url()}`);
		const failure = request.failure();
		if (failure) {
			console.log(`   ❌ Failure: ${failure.errorText}`);
		}
	});

	window.on("response", (response: any) => {
		if (!response.ok()) {
			console.log(`🖥️ HTTP ERROR: ${response.status()} ${response.statusText()} - ${response.url()}`);
		}
	});
}

// ===================================================================
// Test Error Handling
// ===================================================================

function handleTestError(testInfo: any): void {
	const status = testInfo.status;

	if (status === "passed" || status === "skipped") {
		logger.debug(`Test finished with status: ${status}.`);
		return;
	}

	logger.error(`Test finished with status: ${status}. Pausing for debug.`);

	if (testInfo.error) {
		const separator = "=".repeat(20);
		console.error(`\n${separator} TEST FAILED ${separator}`);
		console.error(testInfo.error.message);

		if (testInfo.error.stack) {
			const firstNewlineIndex = testInfo.error.stack.indexOf("\n");
			const stackWithoutMessage = testInfo.error.stack.substring(firstNewlineIndex + 1);
			console.error(stackWithoutMessage);
		}

		console.error("=".repeat(53) + "\n");
	}

	if (!process.env.CI) {
		logger.debug(testInfo.errors);
	}
}

// ===================================================================
// Vault Setup Helpers
// ===================================================================

async function setupVault(obsidianSetup: ObsidianTestSetup, vaultOptions: any): Promise<any> {
	logger.debug("vaultOptions", vaultOptions);

	const context = vaultOptions.useSandbox
		? await obsidianSetup.openSandbox(vaultOptions)
		: await obsidianSetup.openVault(vaultOptions);

	if (vaultOptions.showLoggerOnNode) {
		logger.debug("enable browser console");
		setupBrowserConsoleLogging(context.window);
	}

	// Remove all notices
	const notices = await context.window.locator(".notice-container .notice").all();
	logger.debug("remove all notices");
	await Promise.all(notices.map((notice: any) => notice.click()));

	return context;
}

// ===================================================================
// Playwright Test Fixtures
// ===================================================================

export const test = base.extend<TestFixtures, WorkerFixtures>({
	vaultOptions: async ({}, use) => {
		await use({
			useSandbox: false,
			showLoggerOnNode: true,
			plugins: [],
		});
	},

	obsidianSetup: async ({}, use, testInfo) => {
		const setup = new ObsidianTestSetup();

		try {
			logger.debug("launch");
			await setup.launch();
			logger.debug("done");
			logger.debug("enter tests");

			await use(setup);

			handleTestError(testInfo);
		} catch (err: any) {
			logger.error(`Error during fixture setup: ${err.message || err}`);
			if (!process.env.CI) {
				// await setup.getCurrentPage()?.pause();
			}
			throw err;
		} finally {
			logger.debug("clean up app");
			await setup.cleanup();
			logger.debug("ok");
		}
	},

	vault: async ({ obsidianSetup, vaultOptions }, use) => {
		const context = await setupVault(obsidianSetup, vaultOptions);

		logger.debug("enter test");
		await use(context);
		logger.debug("done");
	},
});

export { expect } from "@playwright/test";