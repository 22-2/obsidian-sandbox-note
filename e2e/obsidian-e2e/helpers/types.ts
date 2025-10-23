import type { ObsidianTestSetup } from "e2e/obsidian-e2e/ObsidianTestSetup";
import type { ResolvedPaths } from "e2e/obsidian-e2e/config";
import type { ElectronApplication, JSHandle, Page } from "playwright";

// Minimal Plugin interface to avoid importing from obsidian package
export interface Plugin {
	[key: string]: any;
}

export interface TestContext {
	electronApp: ElectronApplication;
	window: Page;
	vaultName?: string;
}

export interface VaultPageTextContext extends TestContext {
	pluginHandleMap: JSHandle<Map<string, Plugin>>;
	paths: ResolvedPaths;
}

export interface VaultOptions {
	name?: string;
	vaultPath?: string;
	forceNewVault?: boolean;
	useSandbox?: boolean;
	showLoggerOnNode?: boolean;
	plugins?: TestPlugin[];
}

export interface TestPlugin {
	path: string;
	pluginId: string;
	useSymlink?: boolean;
}

export type TestFixtures = {
	obsidianSetup: ObsidianTestSetup;
	vault: VaultPageTextContext;
	vaultOptions: VaultOptions;
};

export type WorkerFixtures = object;
