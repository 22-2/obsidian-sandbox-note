import { type VaultOptions } from "e2e/helpers/types";
import fs from "fs/promises";
import log from "loglevel";
import os from "os";
import path from "path";
import type { ElectronApplication, Page } from "playwright";
import { _electron as electron } from "playwright/test";
import { LAUNCH_OPTIONS, SANDBOX_VAULT_NAME } from "../constants";
import type { TestContext, VaultPageTextContext } from "../helpers/types";
import { getPluginHandleMap } from "../helpers/utils";
import { IPCBridge } from "../helpers/IPCBridge";
import { existsSync, rmSync, readdirSync, statSync, mkdirSync, copyFileSync, symlinkSync, writeFileSync } from "fs";
import chalk from "chalk";
import type { WebContents } from "electron";
import { expect } from "@playwright/test";

const logger = log.getLogger("ObsidianTestSetup");

interface LaunchOptions {
	useDefaultFetcher?: boolean;
	useUTF8Encoding?: boolean;
}

export class ObsidianTestSetup {
	private electronApp?: ElectronApplication;
	private tempUserDataDir?: string;
	private ipc?: IPCBridge;

	// ===================================================================
	// Launch & Cleanup
	// ===================================================================

	async launch(options: LaunchOptions = { useUTF8Encoding: true }): Promise<void> {
		this.tempUserDataDir = await fs.mkdtemp(path.join(os.tmpdir(), "obsidian-e2e-"));
		logger.debug(`Using temporary user data dir: ${this.tempUserDataDir}`);

		const launchOptions = {
			...LAUNCH_OPTIONS,
			args: [...LAUNCH_OPTIONS.args, `--user-data-dir=${this.tempUserDataDir}`],
			env: {
				...process.env,
				PLAYWRIGHT: "true",
				USE_DEFAULT_FETCHER: options.useDefaultFetcher ? "true" : "false",
				USE_UTF8_ENCODING: options.useUTF8Encoding ? "true" : "false",
				CI: process.env.CI || "false",
			},
		};

		this.electronApp = await electron.launch(launchOptions);
		let page = await this.electronApp.waitForEvent("window");

		await page.evaluate(() => {
			(window as any).playwright = true;
		});

		logger.debug("enable obsidian debug mode");
		await this.waitForPage(page);
		logger.debug("starter ready");

		// Clear data only once at startup
		await this.clearData();
		await page.reload({ waitUntil: "domcontentloaded" });

		const currentPage = await this.ensureSingleWindow();
		await this.waitForStarterReady(currentPage);
		logger.debug("init start page");

		this.ipc = new IPCBridge(this);
	}

	async cleanup(): Promise<void> {
		if (this.electronApp) {
			await Promise.all(this.electronApp.windows().map((win) => win.close()));
			await this.electronApp.close();
		}
		if (this.tempUserDataDir) {
			logger.debug(`Removing temp user data dir: ${this.tempUserDataDir}`);
			await fs.rm(this.tempUserDataDir, { recursive: true, force: true });
		}
		logger.debug("[ObsidianTestSetup] cleaned All");
	}

	getCurrentPage() {
		return this.electronApp?.windows()[0];
	}

	getElectronApp(): ElectronApplication {
		if (!this.electronApp) {
			throw new Error("ElectronApp not initialized");
		}
		return this.electronApp;
	}

	// ===================================================================
	// Vault Operations
	// ===================================================================

	async openVault(options: VaultOptions = {}): Promise<VaultPageTextContext> {
		if (!this.electronApp || !this.ipc) {
			throw new Error("Setup not initialized. Call launch() first.");
		}

		logger.debug("open vault", options);

		let vaultPath: string;
		let page: Page;

		const shouldUseSandbox = options.useSandbox && !process.env.CI;

		if (shouldUseSandbox) {
			logger.debug(chalk.green("Opening sandbox vault..."));
			page = await this.executeActionAndWaitForNewWindow(
				() => this.ipc!.openSandbox(),
				this.waitForVaultReady
			);
			vaultPath = await this.ipc.getSandboxPath();
			logger.debug(chalk.green("Sandbox vault opened at:", vaultPath));
		} else {
			logger.debug("Opening normal vault...");
			if (options.vaultPath) {
				vaultPath = options.vaultPath;
			} else if (options.name) {
				vaultPath = await this.getVaultPath(options.name);
			} else {
				logger.debug("options.name and options.path not specified, create temp dir");
				vaultPath = await fs.mkdtemp(path.join(os.tmpdir(), "obsidian-e2e-"));
				logger.debug("temp dir created:", vaultPath);
			}

			if (options.forceNewVault && existsSync(vaultPath)) {
				rmSync(vaultPath, { recursive: true });
			}

			page = await this.executeActionAndWaitForNewWindow(
				async () => {
					const result = await this.ipc!.openVault(vaultPath, options.forceNewVault);
					if (result !== true) {
						throw new Error(`Failed to open vault: ${result}`);
					}
				},
				this.waitForVaultReady
			);
			logger.debug("Normal vault opened:", vaultPath);
		}

		// Install and Enable Plugins
		if (options.plugins && options.plugins.length > 0) {
			logger.debug("Installing plugins...");
			await this.installPlugins(vaultPath, options.plugins);
			logger.debug("Plugins installed.");

			logger.debug("Enabling plugins...");
			await this.enablePlugins(page, options.plugins.map((p) => p.pluginId));
			logger.debug("Plugins enabled.");

			logger.debug(chalk.blue("Reloading vault to apply plugin changes..."));
			await page.reload();
			await this.waitForVaultReady(page);
			logger.debug(chalk.blue("Vault reloaded."));
		}

		const vaultName = await page.evaluate(() => app?.vault?.getName());
		const pluginHandleMap = await getPluginHandleMap(page, options.plugins || []);

		return {
			electronApp: this.electronApp,
			window: page,
			pluginHandleMap,
			vaultName,
		};
	}

	async openSandbox(options: VaultOptions = {}): Promise<VaultPageTextContext> {
		return this.openVault({ ...options, useSandbox: true });
	}

	async openStarter(): Promise<TestContext> {
		if (!this.electronApp || !this.ipc) {
			throw new Error("Setup not initialized. Call launch() first.");
		}

		const page = await this.executeActionAndWaitForNewWindow(
			async () => {
				await this.ipc!.openStarter();
			},
			this.waitForStarterReady
		);

		await this.waitForStarterReady(page);
		return {
			electronApp: this.electronApp,
			window: page,
		};
	}

	// ===================================================================
	// Plugin Management
	// ===================================================================

	private async installPlugins(vaultPath: string, plugins: Array<{ path: string; pluginId: string; useSymlink?: boolean }>): Promise<void> {
		const obsidianDir = path.join(vaultPath, ".obsidian");
		const pluginsDir = path.join(obsidianDir, "plugins");

		if (!existsSync(obsidianDir)) {
			mkdirSync(obsidianDir, { recursive: true });
		}

		if (!existsSync(pluginsDir)) {
			mkdirSync(pluginsDir, { recursive: true });
		}

		const installedIds: string[] = [];

		for (const { path: pluginPath, pluginId, useSymlink } of plugins) {
			if (!existsSync(pluginPath)) {
				console.warn(`Plugin path not found: ${pluginPath}`);
				continue;
			}

			if (!existsSync(path.join(pluginPath, "manifest.json"))) {
				console.warn(`manifest.json not found in: ${pluginPath}`);
				continue;
			}

			const destDir = path.join(pluginsDir, pluginId);

			if (useSymlink) {
				if (existsSync(destDir)) {
					logger.debug(`Destination already exists: ${destDir}, skipping symlink`);
				} else {
					try {
						symlinkSync(pluginPath, destDir, "dir");
						logger.debug(`Created symlink: ${pluginPath} -> ${destDir}`);
					} catch (error) {
						console.error(`Failed to create symlink for ${pluginId}:`, error);
						continue;
					}
				}
			} else {
				if (!existsSync(destDir)) {
					mkdirSync(destDir, { recursive: true });
				}

				const filesToCopy = ["manifest.json", "main.js", "styles.css"];
				for (const file of readdirSync(pluginPath)) {
					const srcFile = path.join(pluginPath, file);
					const stat = statSync(srcFile);

					if (stat.isDirectory()) continue;

					if (filesToCopy.includes(file)) {
						const destFile = path.join(destDir, file);
						copyFileSync(srcFile, destFile);
						logger.debug(`Copied: ${file} to ${destDir}`);
					}
				}
			}

			installedIds.push(pluginId);
			logger.debug(`Installed plugin: ${pluginId}`);
		}

		const pluginsJsonPath = path.join(obsidianDir, "community-plugins.json");
		writeFileSync(pluginsJsonPath, JSON.stringify(installedIds));
		logger.debug(`Installed plugins: ${installedIds.join(", ")}`);
	}

	private async enablePlugins(page: Page, pluginIds: string[]): Promise<void> {
		await this.disableRestrictedMode(page);

		const enabledIds = await page.evaluate(async (ids) => {
			const app = (window as any).app;
			const enabled: string[] = [];

			for (const id of ids) {
				await app.plugins.enablePluginAndSave(id);
				enabled.push(id);
			}

			return enabled;
		}, pluginIds);

		logger.debug(`Enabled plugins: ${enabledIds.join(", ")}`);
	}

	private async disableRestrictedMode(page: Page): Promise<void> {
		await page.waitForFunction(
			() => {
				const app = (window as any).app;
				return app?.plugins?.isEnabled !== undefined;
			},
			{ timeout: 10000 }
		);

		const isEnabled = await page.evaluate(() => {
			const app = (window as any).app;
			return app?.plugins?.isEnabled?.() ?? false;
		});

		if (isEnabled) {
			logger.debug("Community plugins are already enabled.");
			return;
		}

		logger.debug("Attempting to enable community plugins...");

		await page.evaluate(() => {
			(window as any).app.setting.open();
			(window as any).app.setting.openTabById("community-plugins");
		});

		const getButtonText = () =>
			page.evaluate(() => {
				const button = (window as any).app.setting.activeTab?.setting?.contentEl?.querySelector("button.mod-cta") as HTMLElement | null;
				return button?.textContent?.trim() || null;
			});

		const clickButton = () =>
			page.evaluate(() => {
				const button = (window as any).app.setting.activeTab?.setting?.contentEl?.querySelector("button.mod-cta") as HTMLElement | null;
				button?.click();
			});

		let buttonText = await getButtonText();

		if (buttonText === "Turn on and reload") {
			logger.debug("Clicking 'Turn on and reload'...");
			await clickButton();
			await page.waitForTimeout(1000);
			buttonText = await getButtonText();
		}

		if (buttonText === "Turn on community plugins") {
			logger.debug("Clicking 'Turn on community plugins'...");
			await clickButton();
			await page.waitForTimeout(1000);
		}

		await page.keyboard.press("Escape");

		const finalCheck = await page.evaluate(() => {
			const app = (window as any).app;
			return app?.plugins?.isEnabled?.() ?? false;
		});

		expect(finalCheck, "Failed to enable community plugins.").toBe(true);
	}

	// ===================================================================
	// Page Management
	// ===================================================================

	async ensureSingleWindow(): Promise<Page> {
		if (!this.electronApp) {
			throw new Error("ElectronApp not initialized");
		}

		logger.debug("ensureSingleWindow");
		const windows = this.electronApp.windows();
		logger.debug(`${windows.length} opened`);

		if (windows.length === 0) {
			const page = await this.electronApp.firstWindow();
			await page.waitForLoadState("domcontentloaded");
			logger.debug("first window");
			return page;
		}

		const page = windows.at(-1)!;
		if (page?.url().includes("starter")) {
			await this.waitForStarterReady(page);
		} else {
			await this.waitForVaultReady(page);
		}

		await this.closeAllExcept(page);
		logger.debug(`closed all except ${await page.title()}`);
		return page;
	}

	async executeActionAndWaitForNewWindow(
		action: () => Promise<void>,
		wait: (page: Page) => Promise<void> = this.waitForPage.bind(this)
	): Promise<Page> {
		if (!this.electronApp) {
			throw new Error("ElectronApp not initialized");
		}

		const currentWindows = this.electronApp.windows();
		const windowPromise = this.electronApp.waitForEvent("window", { timeout: 10000 });

		await action();

		const newPage = await windowPromise;
		await wait(newPage);

		for (const window of currentWindows) {
			if (window !== newPage && !window.isClosed()) {
				logger.debug(chalk.yellow(`Closing old window: ${await window.title()}`));
				await window.close();
			}
		}

		logger.debug(chalk.green("New window is ready:", newPage.url()));
		return newPage;
	}

	private async closeAllExcept(keepPage: Page): Promise<void> {
		if (!this.electronApp) return;

		for (const window of this.electronApp.windows()) {
			if (window !== keepPage && !window.isClosed()) {
				logger.debug(chalk.red(`close ${window.url()}`));
				await window.close();
			}
		}
	}

	async waitForVaultReady(page: Page): Promise<void> {
		await page.waitForLoadState("domcontentloaded");

		await page.waitForFunction(
			async () => {
				if ((window as any).app?.workspace?.onLayoutReady) {
					return await new Promise<void>((resolve) => {
						return app.workspace.onLayoutReady(() => resolve(undefined));
					});
				}
			},
			{ timeout: 10000 }
		);
	}

	async waitForStarterReady(page: Page): Promise<void> {
		await page.waitForSelector(".mod-change-language", { state: "visible" });
	}

	waitForPage(page: Page): Promise<void> {
		if (page.url().includes("starter")) {
			return this.waitForStarterReady(page);
		} else {
			return this.waitForVaultReady(page);
		}
	}

	// ===================================================================
	// Utilities
	// ===================================================================

	private async clearData(): Promise<void> {
		if (!this.electronApp) return;

		const userDataDir = await this.electronApp.evaluate(({ app }) => app.getPath("userData"));

		[path.join(userDataDir, "obsidian.json"), path.join(userDataDir, SANDBOX_VAULT_NAME)].forEach((p) => {
			logger.debug("delete", p);
			rmSync(p, { force: true, recursive: true });
		});

		const win = this.electronApp.windows()[0];
		if (win) {
			logger.log(chalk.magenta("clearing..."));
			const success = await win.evaluate(async () => {
				const webContents = (window as any).electron.remote.BrowserWindow.getFocusedWindow()?.webContents as WebContents;
				if (!webContents) return false;

				webContents.session.flushStorageData();
				await webContents.session.clearStorageData({
					storages: ["indexdb", "localstorage", "websql"],
				});
				await webContents.session.clearCache();
				return true;
			});

			if (success) {
				logger.log(chalk.magenta("localStorage cleared."));
			} else {
				logger.log(chalk.red("failed to clear localStorage"));
			}
		}
	}

	private async getUserDataPath(): Promise<string> {
		const page = await this.ensureSingleWindow();
		const userDataDir = await page.evaluate(() => {
			const app = (window as any).app;
			if (app?.vault?.adapter?.basePath) {
				return app.vault.adapter.basePath;
			}
			throw new Error("failed to get user data path");
		});
		return path.dirname(userDataDir);
	}

	private async getVaultPath(name: string): Promise<string> {
		const userDataDir = await this.getUserDataPath();
		logger.debug("userDataDir", userDataDir);

		if (userDataDir) {
			return path.join(userDataDir, name);
		}

		return path.join(process.env.USERPROFILE || process.env.HOME || "", "ObsidianVaults", name);
	}
}