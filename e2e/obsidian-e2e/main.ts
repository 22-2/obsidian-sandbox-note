/**
 * Main entry point for obsidian-e2e testing library
 *
 * This module can be used as a standalone package for Obsidian plugin E2E testing.
 *
 * @example
 * ```typescript
 * import { createTestSetup, resolveConfig } from 'obsidian-e2e';
 *
 * const paths = resolveConfig({
 *   pluginDir: '/path/to/your/plugin',
 * });
 *
 * const setup = createTestSetup(paths);
 * await setup.launch();
 * ```
 */

import { ObsidianTestSetup } from "./ObsidianTestSetup";

export {
	type TestContext,
	type TestFixtures,
	type TestPlugin,
	type VaultOptions,
	type VaultPageTextContext,
	type WorkerFixtures,
} from "./helpers/types";

export { IPCBridge } from "./helpers/IPCBridge";

export * from "./helpers/utils";

export {
	createLaunchOptions,
	resolveConfig,
	type ObsidianE2EConfig,
	type ResolvedPaths,
} from "./config";
export { ObsidianTestSetup };

/**
 * Creates a new ObsidianTestSetup instance with the provided configuration
 *
 * @param config - Configuration object with plugin directory and optional settings
 * @returns Configured ObsidianTestSetup instance ready to launch
 *
 * @example
 * ```typescript
 * import { createTestSetup } from 'obsidian-e2e';
 *
 * const setup = createTestSetup({
 *   pluginDir: process.cwd(),
 *   distDir: 'dist',
 * });
 *
 * await setup.launch();
 * const vault = await setup.openVault({
 *   plugins: [{
 *     path: setup.getPaths().distDir,
 *     pluginId: setup.getPaths().pluginId,
 *   }],
 * });
 * ```
 */

import { resolveConfig } from "./config";

export function createTestSetup(
	config: import("./config").ObsidianE2EConfig
): ObsidianTestSetup {
	const paths = resolveConfig(config);
	return new ObsidianTestSetup(paths);
}
