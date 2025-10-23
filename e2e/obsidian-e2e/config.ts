import { existsSync, readFileSync } from "fs";
import path from "path";
import { fileURLToPath } from "url";

// Get __dirname equivalent in ES modules
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

/**
 * Configuration for Obsidian E2E test setup
 */
export interface ObsidianE2EConfig {
	/**
	 * Path to the plugin's root directory (where manifest.json is located)
	 */
	pluginDir: string;

	/**
	 * Path to the plugin's build output directory (default: "dist")
	 */
	distDir?: string;

	/**
	 * Path to the directory containing Obsidian assets (app.asar, obsidian.asar, etc.)
	 */
	assetsDir?: string;

	/**
	 * Path to the unpacked Obsidian directory (default: ".obsidian-unpacked")
	 */
	obsidianUnpackedDir?: string;

	/**
	 * Name of the main app file after unpacking (default: "main.cjs")
	 */
	appMainFile?: string;

	/**
	 * Name of the test vault (default: "vault")
	 */
	vaultName?: string;

	/**
	 * Plugin ID (if not provided, will be read from manifest.json)
	 */
	pluginId?: string;

	/**
	 * Plugin manifest data (if not provided, will be read from pluginDir/manifest.json)
	 */
	manifest?: {
		id: string;
		name: string;
		version: string;
		[key: string]: any;
	};
}

/**
 * Resolved paths for Obsidian E2E testing
 */
export interface ResolvedPaths {
	pluginDir: string;
	distDir: string;
	assetsDir: string;
	obsidianUnpackedDir: string;
	appMainFile: string;
	appMainJsPath: string;
	vaultName: string;
	pluginId: string;
	manifest: {
		id: string;
		name: string;
		version: string;
		[key: string]: any;
	};
}

/**
 * Resolves and validates all paths for Obsidian E2E testing
 */
export function resolveConfig(config: ObsidianE2EConfig): ResolvedPaths {
	const pluginDir = path.resolve(config.pluginDir);

	if (!existsSync(pluginDir)) {
		throw new Error(`Plugin directory not found: ${pluginDir}`);
	}

	const manifestPath = path.join(pluginDir, "manifest.json");
	let manifest: any;

	if (config.manifest) {
		manifest = config.manifest;
	} else if (existsSync(manifestPath)) {
		manifest = JSON.parse(readFileSync(manifestPath, "utf-8"));
	} else {
		throw new Error(
			`manifest.json not found at ${manifestPath}. Please provide pluginDir or manifest in config.`
		);
	}

	const pluginId = config.pluginId || manifest.id;

	if (!pluginId) {
		throw new Error(
			"Plugin ID not found. Please provide pluginId in config or ensure manifest.json contains an 'id' field."
		);
	}

	const distDir = config.distDir
		? path.resolve(config.distDir)
		: path.join(pluginDir, "dist");

	// Default to looking for assets in the obsidian-e2e directory
	const defaultAssetsDir = path.join(__dirname, "assets");
	const assetsDir = config.assetsDir
		? path.resolve(config.assetsDir)
		: defaultAssetsDir;

	const defaultObsidianUnpackedDir = path.join(
		__dirname,
		".obsidian-unpacked"
	);
	const obsidianUnpackedDir = config.obsidianUnpackedDir
		? path.resolve(config.obsidianUnpackedDir)
		: defaultObsidianUnpackedDir;

	const appMainFile = config.appMainFile || "main.cjs";
	const appMainJsPath = path.join(obsidianUnpackedDir, appMainFile);

	const vaultName = config.vaultName || "vault";

	return {
		pluginDir,
		distDir,
		assetsDir,
		obsidianUnpackedDir,
		appMainFile,
		appMainJsPath,
		vaultName,
		pluginId,
		manifest,
	};
}

/**
 * Creates launch options for Playwright/Electron based on resolved paths
 */
export function createLaunchOptions(paths: ResolvedPaths) {
	if (!existsSync(paths.appMainJsPath)) {
		throw new Error(
			`Obsidian app not found at: ${paths.appMainJsPath}. ` +
				`Please run the setup script to unpack Obsidian assets.`
		);
	}

	return {
		args: [
			paths.appMainJsPath,
			"--no-sandbox",
			"--disable-setuid-sandbox",
			"--unsafely-disable-devtools-self-xss-warnings",
		],
		env: {
			...process.env,
			NODE_ENV: "development",
		},
	};
}