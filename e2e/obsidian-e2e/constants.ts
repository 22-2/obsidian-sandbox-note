import { existsSync, readFileSync } from "fs";
import path from "path";
import { VIEW_TYPE_HOT_SANDBOX } from "src/utils/constants";
import invariant from "tiny-invariant";
import { fileURLToPath } from "url";
import type { ObsidianE2EConfig, ResolvedPaths } from "./config";
import { resolveConfig } from "./config";

// --- Project Structure Detection ---
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

/**
 * Default configuration for backward compatibility
 * This assumes the traditional e2e folder structure
 */
function getDefaultConfig(): ObsidianE2EConfig {
	// Try to load paths.json for backward compatibility
	const pathsJsonPath = path.join(__dirname, "..", "paths.json");
	let pathsJson: any = {
		vaultName: "vault",
		pluginSourceDir: "..",
		obsidianUnpackedDir: ".obsidian-unpacked",
		e2eAssetsDir: "assets",
		distDir: "dist",
		appMainFile: "main.cjs",
	};

	if (existsSync(pathsJsonPath)) {
		pathsJson = JSON.parse(readFileSync(pathsJsonPath, "utf-8"));
		console.log("pathsJson loaded from", pathsJsonPath);
	}

	const E2E_ROOT_DIR = path.dirname(__dirname);
	const PROJECT_ROOT_DIR = path.resolve(
		E2E_ROOT_DIR,
		pathsJson.pluginSourceDir
	);

	// Try to load manifest.json for backward compatibility
	const manifestPath = path.join(PROJECT_ROOT_DIR, "manifest.json");
	let manifest: any = undefined;

	if (existsSync(manifestPath)) {
		manifest = JSON.parse(readFileSync(manifestPath, "utf-8"));
		console.log("manifest loaded from", manifestPath);
	}

	return {
		pluginDir: PROJECT_ROOT_DIR,
		distDir: path.join(PROJECT_ROOT_DIR, pathsJson.distDir),
		assetsDir: path.join(__dirname, pathsJson.e2eAssetsDir || "assets"),
		obsidianUnpackedDir: path.join(
			E2E_ROOT_DIR,
			pathsJson.obsidianUnpackedDir
		),
		appMainFile: pathsJson.appMainFile,
		vaultName: pathsJson.vaultName,
		manifest,
	};
}

// Resolve paths using default configuration
let RESOLVED_PATHS: ResolvedPaths;

try {
	const defaultConfig = getDefaultConfig();
	RESOLVED_PATHS = resolveConfig(defaultConfig);

	console.log("PROJECT_ROOT_DIR", RESOLVED_PATHS.pluginDir);
	console.log("DIST_DIR", RESOLVED_PATHS.distDir);
	console.log("E2E_ROOT_DIR", __dirname);
	console.log("APP_MAIN_JS_PATH", RESOLVED_PATHS.appMainJsPath);

	// --- Pre-flight checks ---
	invariant(existsSync(__dirname), `E2E root not found at: ${__dirname}.`);
	invariant(
		existsSync(RESOLVED_PATHS.appMainJsPath),
		`Obsidian app not found at: ${RESOLVED_PATHS.appMainJsPath}. Did you run 'pnpm build:e2e' and 'e2e-setup' script?`
	);
} catch (error) {
	console.warn(
		"Warning: Could not resolve default paths. This is normal if you're using the library as a module.",
		error
	);
	// Create a minimal placeholder - will be overridden when used as a module
	throw error;
	// RESOLVED_PATHS = {
	// 	pluginDir: process.cwd(),
	// 	distDir: path.join(process.cwd(), "dist"),
	// 	assetsDir: path.join(__dirname, "assets"),
	// 	obsidianUnpackedDir: path.join(__dirname, "..", ".obsidian-unpacked"),
	// 	appMainFile: "main.cjs",
	// 	appMainJsPath: path.join(
	// 		__dirname,
	// 		"..",
	// 		".obsidian-unpacked",
	// 		"main.cjs"
	// 	),
	// 	vaultName: "vault",
	// 	pluginId: "unknown",
	// 	manifest: {
	// 		id: "unknown",
	// 		name: "Unknown Plugin",
	// 		version: "0.0.0",
	// 	},
	// };
}

// Export resolved paths for backward compatibility
export const E2E_ROOT_DIR = __dirname;
export const PROJECT_ROOT_DIR = RESOLVED_PATHS.pluginDir;
export const DIST_DIR = RESOLVED_PATHS.distDir;
export const PLUGIN_ID = RESOLVED_PATHS.pluginId;
export const TEST_VAULT_NAME = RESOLVED_PATHS.vaultName;
export const SANDBOX_VAULT_NAME = "Obsidian Sandbox";
export const APP_MAIN_JS_PATH = RESOLVED_PATHS.appMainJsPath;

export const LAUNCH_OPTIONS = {
	args: [
		APP_MAIN_JS_PATH,
		"--no-sandbox",
		"--disable-setuid-sandbox",
		"--unsafely-disable-devtools-self-xss-warnings",
	],
	env: {
		...process.env,
		NODE_ENV: "development",
	},
};

// Test constants for Hot Sandbox specs
export const CMD_ID_CLOSE_TAB = "workspace:close";
export const CMD_ID_CONVERT_TO_FILE = "sandbox-note:convert-to-file";
export const CMD_ID_NEW_HOT_SANDBOX = "sandbox-note:open-hot-sandbox-note-view";
export const CMD_ID_OPEN_HOT_SANDBOX =
	"sandbox-note:open-hot-sandbox-note-view";
export const CMD_ID_TOGGLE_SOURCE = "editor:toggle-source";
export const CMD_ID_UNDO_CLOSE_TAB = "workspace:undo-close-pane";

export const DATAT_TYPE_MARKDOWN = "markdown";
export const DATA_TYPE_EMPTY = "empty";
export const DATA_TYPE_HOT_SANDBOX = VIEW_TYPE_HOT_SANDBOX;

/**
 * Default test configuration for reuse
 */
export const DEFAULT_TEST_CONFIG = {
	useSandbox: false,
	showLoggerOnNode: true,
	plugins: [
		{
			path: DIST_DIR,
			pluginId: PLUGIN_ID,
		},
	],
};

export const HOT_RELOAD_PLUGIN = {
	path: path.join(E2E_ROOT_DIR, "assets", "hot-reload"),
	pluginId: "hot-reload",
	useSymlink: true,
};

/**
 * Get the resolved paths (useful when you want to access the configuration)
 */
export function getResolvedPaths(): ResolvedPaths {
	return RESOLVED_PATHS;
}

/**
 * Override the resolved paths (useful for testing or custom configurations)
 */
export function setResolvedPaths(paths: ResolvedPaths): void {
	RESOLVED_PATHS = paths;
}
