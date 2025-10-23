// ===================================================================
// ipc-bridge.mts - IPCの簡素化と統合
// ===================================================================

export class IPCBridge {
	constructor(private setup: { ensureSingleWindow: () => Promise<any>; waitForVaultReady: (page: any) => Promise<void> }) {}

	private async send<T>(channel: string, ...args: unknown[]): Promise<T> {
		await this.ensurePageLoaded();
		return (await this.setup.ensureSingleWindow()).evaluate(
			([ch, ...restArgs]: [string, ...unknown[]]) => {
				return (window as any).electron.ipcRenderer.sendSync(ch, ...restArgs);
			},
			[channel, ...args]
		);
	}

	private async ensurePageLoaded(): Promise<void> {
		const page = await this.setup.ensureSingleWindow();
		await page.waitForLoadState("domcontentloaded");

		// スターターページでない場合はappオブジェクトを待つ
		const isStarter = page.url().includes("starter");
		if (!isStarter) {
			return this.setup.waitForVaultReady(page);
		}
	}

	async openVault(vaultPath: string, forceNew = false): Promise<true | string> {
		return this.send<true | string>("vault-open", vaultPath, forceNew);
	}

	async openSandbox(): Promise<void> {
		return void this.send<string>("sandbox");
	}

	async getSandboxPath(): Promise<string> {
		return this.send<string>("get-sandbox-vault-path");
	}

	async openStarter(): Promise<void> {
		await this.send("starter");
	}

	async getVaultList(): Promise<{ vault: Record<string, { path: string }> }> {
		return this.send("vault-list");
	}

	async removeVault(vaultPath: string): Promise<void> {
		await this.send("vault-remove", vaultPath);
	}
}