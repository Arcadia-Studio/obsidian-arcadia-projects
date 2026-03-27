import { App, PluginSettingTab, Setting } from "obsidian";
import type ArcadiaProjectsPlugin from "./main";
import { ArcadiaProjectsSettings } from "./types";

export class ArcadiaProjectsSettingTab extends PluginSettingTab {
	plugin: ArcadiaProjectsPlugin;

	constructor(app: App, plugin: ArcadiaProjectsPlugin) {
		super(app, plugin);
		this.plugin = plugin;
	}

	display(): void {
		const { containerEl } = this;
		containerEl.empty();

		containerEl.createEl("h2", { text: "Arcadia Projects Settings" });

		new Setting(containerEl)
			.setName("Project folder")
			.setDesc("Path to the folder containing your project notes (e.g. Projects/)")
			.addText((text) =>
				text
					.setPlaceholder("Projects/")
					.setValue(this.plugin.settings.projectFolder)
					.onChange(async (value) => {
						this.plugin.settings.projectFolder = value.trim();
						await this.plugin.saveSettings();
					})
			);

		new Setting(containerEl)
			.setName("Status property")
			.setDesc("Frontmatter property used for status (used as Kanban columns)")
			.addText((text) =>
				text
					.setPlaceholder("status")
					.setValue(this.plugin.settings.statusProperty)
					.onChange(async (value) => {
						this.plugin.settings.statusProperty = value.trim();
						await this.plugin.saveSettings();
					})
			);

		new Setting(containerEl)
			.setName("Status values")
			.setDesc("Comma-separated list of status values (defines Kanban column order)")
			.addText((text) =>
				text
					.setPlaceholder("todo, in-progress, done")
					.setValue(this.plugin.settings.statusValues.join(", "))
					.onChange(async (value) => {
						this.plugin.settings.statusValues = value
							.split(",")
							.map((s) => s.trim())
							.filter((s) => s.length > 0);
						await this.plugin.saveSettings();
					})
			);

		new Setting(containerEl)
			.setName("Date property")
			.setDesc("Frontmatter property used for due dates")
			.addText((text) =>
				text
					.setPlaceholder("due")
					.setValue(this.plugin.settings.dateProperty)
					.onChange(async (value) => {
						this.plugin.settings.dateProperty = value.trim();
						await this.plugin.saveSettings();
					})
			);

		new Setting(containerEl)
			.setName("Default view")
			.setDesc("Which view to show when opening the project panel")
			.addDropdown((dropdown) =>
				dropdown
					.addOption("table", "Table")
					.addOption("kanban", "Kanban")
					.setValue(this.plugin.settings.defaultView)
					.onChange(async (value) => {
						this.plugin.settings.defaultView = value as "table" | "kanban";
						await this.plugin.saveSettings();
					})
			);

		new Setting(containerEl)
			.setName("Card display fields")
			.setDesc("Comma-separated list of frontmatter properties to show on Kanban cards")
			.addText((text) =>
				text
					.setPlaceholder("status, due, tags")
					.setValue(this.plugin.settings.cardFields.join(", "))
					.onChange(async (value) => {
						this.plugin.settings.cardFields = value
							.split(",")
							.map((s) => s.trim())
							.filter((s) => s.length > 0);
						await this.plugin.saveSettings();
					})
			);

		containerEl.createEl("h3", { text: "License" });

		new Setting(containerEl)
			.setName("License key")
			.setDesc("Enter your Arcadia Pro license key (optional)")
			.addText((text) =>
				text
					.setPlaceholder("Enter license key")
					.setValue(this.plugin.settings.licenseKey)
					.onChange(async (value) => {
						this.plugin.settings.licenseKey = value.trim();
						await this.plugin.saveSettings();
					})
			);
	}
}
