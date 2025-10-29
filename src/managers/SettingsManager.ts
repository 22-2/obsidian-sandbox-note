import type { Plugin, Vault } from "obsidian";
import type { AppEvents } from "src/events/AppEvents";
import type { PluginSettings } from "src/settings";
import { DEFAULT_SETTINGS } from "src/settings";
import type { EventEmitter } from "src/utils/EventEmitter";
import { injectable } from "tsyringe";
import type { IManager } from "./IManager";

type Context = {
	emitter: EventEmitter<AppEvents>;
	loadData: Plugin["loadData"];
	saveData: Plugin["saveData"];
			// @ts-expect-error
	getObsidianConfig: Vault["getConfig"];
};

@injectable()
export class SettingsManager implements IManager {
	private settings: PluginSettings = DEFAULT_SETTINGS;
	constructor(private context: Context) {}

	getSettings(): PluginSettings {
		return this.settings;
	}

	async load() {
		// const newFileFolderPath = this.context.getObsidianConfig(
		// 	"newFileFolderPath"
		// ) as string;
		const loadedData = await this.context.loadData();
		this.settings = {
			...this.settings,
			...loadedData,
		};
	}

	unload(): void {}

	async updateSettingsAndSave(settings: PluginSettings): Promise<void> {
		this.settings = settings;
		await this.context.saveData({
			...this.settings,
		});
		this.context.emitter.emit("settings-changed", {
			newSettings: this.settings,
		});
	}
}
