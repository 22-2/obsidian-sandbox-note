import { existsSync } from "fs";
import path from "path";
import { VIEW_TYPE_HOT_SANDBOX } from "src/utils/constants";
import invariant from "tiny-invariant";
import { fileURLToPath } from "url";
import manifest from "../manifest.json" with { type: "json" };
import type { TestPlugin } from "./obsidian-e2e/helpers/types";
import paths from "./paths.json" with { type: "json" };

// --- Project Structure ---
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

export const E2E_ROOT_DIR = __dirname;
const PROJECT_ROOT_DIR = path.resolve(E2E_ROOT_DIR, paths.pluginSourceDir);
export const DIST_DIR = path.join(PROJECT_ROOT_DIR, paths.distDir);

console.log("PROJECT_ROOT_DIR", PROJECT_ROOT_DIR);
console.log("DIST_DIR", DIST_DIR);

// --- Plugin Information ---
export const PLUGIN_ID = manifest.id;

// --- Vault & App Paths ---
export const TEST_VAULT_NAME = paths.vaultName;
export const SANDBOX_VAULT_NAME = "Obsidian Sandbox";
export const APP_MAIN_JS_PATH = path.join(
	E2E_ROOT_DIR,
	paths.obsidianUnpackedDir,
	paths.appMainFile
);

console.log("E2E_ROOT_DIR", E2E_ROOT_DIR);
console.log("APP_MAIN_JS_PATH", APP_MAIN_JS_PATH);

// --- Pre-flight checks ---
invariant(
	existsSync(E2E_ROOT_DIR),
	`E2E root not found at: ${E2E_ROOT_DIR}.`
);
invariant(
	existsSync(APP_MAIN_JS_PATH),
	`Obsidian app not found at: ${APP_MAIN_JS_PATH}. Did you run 'pnpm build:e2e' and 'e2e-setup' script?`
);

export const LAUNCH_OPTIONS = {
	args: [APP_MAIN_JS_PATH, "--no-sandbox", "--disable-setuid-sandbox", "--unsafely-disable-devtools-self-xss-warnings"],
	env: {
		...process.env,
		NODE_ENV: "development",
	},
};
// Test constants for Hot Sandbox specs
export const CMD_ID_CLOSE_TAB = "workspace:close";
export const CMD_ID_CONVERT_TO_FILE = "sandbox-note:convert-to-file";
export const CMD_ID_NEW_HOT_SANDBOX = "sandbox-note:open-hot-sandbox-note-view";
export const CMD_ID_OPEN_HOT_SANDBOX = "sandbox-note:open-hot-sandbox-note-view";
export const CMD_ID_TOGGLE_SOURCE = "editor:toggle-source";
export const CMD_ID_UNDO_CLOSE_TAB = "workspace:undo-close-pane";

export const DATAT_TYPE_MARKDOWN = "markdown";
export const DATA_TYPE_EMPTY = "empty";
export const DATA_TYPE_HOT_SANDBOX = VIEW_TYPE_HOT_SANDBOX;
/**
 * Default test configuration for reuse
 */

export const DEFAULT_TEST_CONFIG = {
	vaultOptions: {
		useSandbox: false,
		showLoggerOnNode: true,
		plugins: [
			{
				path: DIST_DIR,
				pluginId: PLUGIN_ID,
			},
		],
	},
};

export const HOT_RELOAD_PLUGIN: TestPlugin = {
	path: path.join(E2E_ROOT_DIR, "assets", "hot-reload"),
	pluginId: "hot-reload",
	useSymlink: true,
};
