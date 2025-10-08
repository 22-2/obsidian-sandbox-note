import { PluginSettingTab, Setting } from "obsidian";
import { FolderSuggest } from "./helpers/interaction";
import { t } from "./i18n";
import type SandboxNotePlugin from "./main";
import { DEBUG_MODE } from "./utils/constants";

export interface SandboxNotePluginData {
	settings: PluginSettings;
}

export interface PluginSettings {
	"advanced.enableLogger": boolean;
	"appearance.firstLineAsTitle": boolean;
	"fileOperation.confirmBeforeSaving": boolean;
	"fileOperation.defaultSavePath": string;
	"fileOperation.saveToVaultOnCommandExecuted": boolean;
	"fileOperation.useObsidianDefaultLocation": boolean;
}

export const DEFAULT_SETTINGS: PluginSettings = {
	"advanced.enableLogger": DEBUG_MODE,
	"appearance.firstLineAsTitle": false,
	"fileOperation.confirmBeforeSaving": true,
	"fileOperation.defaultSavePath": "",
	"fileOperation.saveToVaultOnCommandExecuted": false,
	"fileOperation.useObsidianDefaultLocation": false,
};

export class SandboxNoteSettingTab extends PluginSettingTab {
	// Store a reference to the DOM element for the custom default save path setting
	private defaultSavePathSettingEl!: HTMLElement;

	constructor(public plugin: SandboxNotePlugin) {
		super(plugin.app, plugin);
	}

	display(): void {
		const { containerEl } = this;
		containerEl.empty();

		this.addAppearanceSection();
		this.addFileOperationSection();
		this.addDebugLoggingSetting();
	}

	private addDebugLoggingSetting(): void {
		const settings = this.plugin.orchestrator.getSettings();
		new Setting(this.containerEl)
			.setHeading()
			.setName(t("settings.sections.advanced"));

		new Setting(this.containerEl)
			.setName(t("settings.advanced.showDebugMessages.name"))
			.setDesc(t("settings.advanced.showDebugMessages.desc"))
			.addToggle((toggle) => {
				toggle
					.setValue(settings["advanced.enableLogger"])
					.onChange(async (enabled) => {
						await this.plugin.orchestrator.updateSettings({
							...settings,
							"advanced.enableLogger": enabled,
						});
					});
			});
	}

	private addAppearanceSection(): void {
		new Setting(this.containerEl)
			.setHeading()
			.setName(t("settings.sections.appearance"));

		this.addFirstLineAsTitleSetting();
	}

	/**
	 * Groups all settings related to file saving, location, and conversion behavior.
	 */
	private addFileOperationSection(): void {
		new Setting(this.containerEl)
			.setHeading()
			.setName(t("settings.sections.fileOperation"));

		this.addUseObsidianDefaultLocationSetting();
		this.addDefaultSavePathSetting();
		this.addConfirmBeforeSavingSetting();
		this.addSaveToVaultSetting();
	}

	/**
	 * Toggles the visibility of the Custom Default Save Path setting based on
	 * whether 'Use Obsidian Default Location' is enabled.
	 */
	private toggleDefaultSavePathVisibility(useObsidianDefault: boolean): void {
		if (this.defaultSavePathSettingEl) {
			// Setting items usually use flex display
			this.defaultSavePathSettingEl.setCssProps({
				display: useObsidianDefault ? "none" : "flex",
			});
		}
	}

	private addUseObsidianDefaultLocationSetting(): void {
		const settings = this.plugin.orchestrator.getSettings();

		new Setting(this.containerEl)
			.setName(t("settings.fileOperation.useObsidianDefaultLocation.name"))
			.setDesc(t("settings.fileOperation.useObsidianDefaultLocation.desc"))
			.addToggle((toggle) => {
				toggle
					.setValue(settings["fileOperation.useObsidianDefaultLocation"])
					.onChange(async (value) => {
						const newSettings: PluginSettings = {
							...settings,
							"fileOperation.useObsidianDefaultLocation": value,
						};
						await this.plugin.orchestrator.updateSettings(newSettings);
						this.toggleDefaultSavePathVisibility(value);
					});
			});
	}

	private addDefaultSavePathSetting(): void {
		const settings = this.plugin.orchestrator.getSettings();

		const settingItem = new Setting(this.containerEl)
			.setName(t("settings.fileOperation.customDefaultSaveLocation.name"))
			.setDesc(t("settings.fileOperation.customDefaultSaveLocation.desc"))
			.addSearch((search) => {
				search
					.setValue(settings["fileOperation.defaultSavePath"])
					.setPlaceholder(
						t("settings.fileOperation.customDefaultSaveLocation.placeholder"),
					)
					.onChange(async (value) => {
						const normalizedValue =
							value && !value.endsWith("/") ? `${value}/` : value;

						await this.plugin.orchestrator.updateSettings({
							...settings,
							"fileOperation.defaultSavePath": normalizedValue,
						});
					});

				new FolderSuggest(this.app, search.inputEl);
			});

		// Store the reference to the created setting element for toggling visibility
		this.defaultSavePathSettingEl = settingItem.settingEl;

		// Initial state check
		this.toggleDefaultSavePathVisibility(
			settings["fileOperation.useObsidianDefaultLocation"],
		);
	}

	private addConfirmBeforeSavingSetting(): void {
		const settings = this.plugin.orchestrator.getSettings();

		new Setting(this.containerEl)
			.setName(t("settings.fileOperation.confirmBeforeSaving.name"))
			.setDesc(t("settings.fileOperation.confirmBeforeSaving.desc"))
			.addToggle((toggle) => {
				toggle
					.setValue(settings["fileOperation.confirmBeforeSaving"])
					.onChange(async (value) => {
						await this.plugin.orchestrator.updateSettings({
							...settings,
							"fileOperation.confirmBeforeSaving": value,
						});
					});
			});
	}

	private addFirstLineAsTitleSetting(): void {
		const settings = this.plugin.orchestrator.getSettings();

		new Setting(this.containerEl)
			.setName(t("settings.appearance.firstLineAsTitle.name"))
			.setDesc(t("settings.appearance.firstLineAsTitle.desc"))
			.addToggle((toggle) => {
				toggle
					.setValue(settings["appearance.firstLineAsTitle"])
					.onChange(async (value) => {
						await this.plugin.orchestrator.updateSettings({
							...settings,
							"appearance.firstLineAsTitle": value,
						});
					});
			});
	}

	private addSaveToVaultSetting(): void {
		const settings = this.plugin.orchestrator.getSettings();

		new Setting(this.containerEl)
			.setName(t("settings.fileOperation.saveToVaultOnCommand.name"))
			.setDesc(t("settings.fileOperation.saveToVaultOnCommand.desc"))
			.addToggle((toggle) => {
				toggle
					.setValue(settings["fileOperation.saveToVaultOnCommandExecuted"])
					.onChange(async (value) => {
						await this.plugin.orchestrator.updateSettings({
							...settings,
							"fileOperation.saveToVaultOnCommandExecuted": value,
						});
					});
			});
	}
}
