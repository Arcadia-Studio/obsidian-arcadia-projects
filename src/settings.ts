import { App, ButtonComponent, Notice, PluginSettingTab, Setting } from "obsidian";
import type ArcadiaProjectsPlugin from "./main";
import { toStoredStatus, validateLicense } from "./license";

export class ArcadiaProjectsSettingTab extends PluginSettingTab {
	plugin: ArcadiaProjectsPlugin;

	constructor(app: App, plugin: ArcadiaProjectsPlugin) {
		super(app, plugin);
		this.plugin = plugin;
	}

	display(): void {
		const { containerEl } = this;
		containerEl.empty();

		new Setting(containerEl)
			.setName("Project folder")
			.setDesc("Path to the folder containing your project notes (e.g. Projects/).")
			.addText((text) =>
				text
					.setPlaceholder("Projects/")
					.setValue(this.plugin.settings.projectFolder)
					.onChange((value) => {
						this.plugin.settings.projectFolder = value.trim();
						void this.plugin.saveSettings();
					})
			);

		new Setting(containerEl)
			.setName("Status property")
			.setDesc("Frontmatter property used for status (used as kanban columns).")
			.addText((text) =>
				text
					.setPlaceholder("Status")
					.setValue(this.plugin.settings.statusProperty)
					.onChange((value) => {
						this.plugin.settings.statusProperty = value.trim();
						void this.plugin.saveSettings();
					})
			);

		new Setting(containerEl)
			.setName("Status values")
			.setDesc("Comma-separated list of status values (defines kanban column order).")
			.addText((text) =>
				text
					.setPlaceholder("Todo, in-progress, done")
					.setValue(this.plugin.settings.statusValues.join(", "))
					.onChange((value) => {
						this.plugin.settings.statusValues = value
							.split(",")
							.map((s) => s.trim())
							.filter((s) => s.length > 0);
						void this.plugin.saveSettings();
					})
			);

		new Setting(containerEl)
			.setName("Date property")
			.setDesc("Frontmatter property used for due dates.")
			.addText((text) =>
				text
					.setPlaceholder("Due")
					.setValue(this.plugin.settings.dateProperty)
					.onChange((value) => {
						this.plugin.settings.dateProperty = value.trim();
						void this.plugin.saveSettings();
					})
			);

		new Setting(containerEl)
			.setName("Default view")
			.setDesc("Which view to show when opening the project panel.")
			.addDropdown((dropdown) =>
				dropdown
					.addOption("table", "Table")
					.addOption("kanban", "Kanban")
					.setValue(this.plugin.settings.defaultView)
					.onChange((value) => {
						this.plugin.settings.defaultView = value as "table" | "kanban";
						void this.plugin.saveSettings();
					})
			);

		new Setting(containerEl)
			.setName("Card display fields")
			.setDesc("Comma-separated list of frontmatter properties to show on kanban cards.")
			.addText((text) =>
				text
					.setPlaceholder("Status, due, tags")
					.setValue(this.plugin.settings.cardFields.join(", "))
					.onChange((value) => {
						this.plugin.settings.cardFields = value
							.split(",")
							.map((s) => s.trim())
							.filter((s) => s.length > 0);
						void this.plugin.saveSettings();
					})
			);

		new Setting(containerEl).setName("License").setHeading();

		const licenseStatus = this.plugin.settings.licenseStatus;
		const isPro = this.plugin.settings.isPro && licenseStatus?.valid;
		const statusDesc = isPro
			? `Active${licenseStatus?.customerEmail ? ` (${licenseStatus.customerEmail})` : ""}${licenseStatus?.expiresAt ? `, expires ${licenseStatus.expiresAt}` : ""}`
			: "No active license. Enter your license key and click Validate.";

		containerEl.createEl("p", {
			text: `License status: ${statusDesc}`,
			cls: isPro ? "mod-success" : "mod-warning",
		});

		new Setting(containerEl)
			.setName("License key")
			.setDesc("Enter your license key.")
			.addText((text) =>
				text
					.setPlaceholder("Xxxx-xxxx-xxxx-xxxx")
					.setValue(this.plugin.settings.licenseKey)
					.onChange((value) => {
						this.plugin.settings.licenseKey = value.trim();
						void this.plugin.saveSettings();
					})
			)
			.addButton((btn) =>
				btn
					.setButtonText("Validate")
					.setCta()
					.onClick(() => { void this.validateAndRefresh(btn); })
			);

		new Setting(containerEl)
			.addButton((btn) =>
				btn
					.setButtonText("Get premium")
					.onClick(() => {
						window.open("https://arcadia-studio.lemonsqueezy.com", "_blank");
					})
			);
	}

	private async validateAndRefresh(btn: ButtonComponent): Promise<void> {
		const key = this.plugin.settings.licenseKey.trim();
		if (!key) {
			new Notice("Enter a license key first.");
			return;
		}

		btn.setButtonText("Checking...").setDisabled(true);
		const result = await validateLicense(key);

		if (result.offline) {
			// Never downgrade a cached license on a network failure
			new Notice("Could not reach the license server. Check your connection and try again. A previously activated license stays active.");
			btn.setButtonText("Validate").setDisabled(false);
			return;
		}

		this.plugin.settings.licenseStatus = toStoredStatus(result);
		this.plugin.settings.isPro = result.valid;
		await this.plugin.saveSettings();

		new Notice(
			result.valid
				? "License activated. Premium features are unlocked."
				: "The license key is invalid or expired. Check the key and try again."
		);
		this.display();
	}
}
