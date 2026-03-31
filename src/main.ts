import { Plugin, WorkspaceLeaf } from "obsidian";
import { ArcadiaProjectsSettings, DEFAULT_SETTINGS, VIEW_TYPE_ARCADIA_PROJECTS } from "./types";
import { ArcadiaProjectsSettingTab } from "./settings";
import { ProjectDataManager } from "./data";
import { ProjectView } from "./project-view";

export default class ArcadiaProjectsPlugin extends Plugin {
	settings: ArcadiaProjectsSettings = DEFAULT_SETTINGS;
	dataManager: ProjectDataManager | null = null;

	async onload(): Promise<void> {
		await this.loadSettings();

		this.dataManager = new ProjectDataManager(this.app, this.settings);

		// Register the project view
		this.registerView(VIEW_TYPE_ARCADIA_PROJECTS, (leaf) => {
			return new ProjectView(leaf, this.settings, this.dataManager!);
		});

		// Ribbon icon
		this.addRibbonIcon("layout-dashboard", "Open Arcadia Projects", () => {
			void this.activateView();
		});

		// Commands
		this.addCommand({
			id: "open-project-view",
			name: "Open Project View",
			callback: () => { void this.activateView(); },
		});

		this.addCommand({
			id: "switch-to-table",
			name: "Switch to Table View",
			callback: () => { this.switchView("table"); },
		});

		this.addCommand({
			id: "switch-to-kanban",
			name: "Switch to Kanban View",
			callback: () => { this.switchView("kanban"); },
		});

		// Settings tab
		this.addSettingTab(new ArcadiaProjectsSettingTab(this.app, this));

		// Start data listening after layout is ready
		this.app.workspace.onLayoutReady(() => {
			this.dataManager?.startListening();
		});
	}

	onunload(): void {
		this.dataManager?.stopListening();
	}

	async loadSettings(): Promise<void> {
		this.settings = Object.assign({}, DEFAULT_SETTINGS, await this.loadData());
	}

	async saveSettings(): Promise<void> {
		await this.saveData(this.settings);
		// Propagate settings changes to existing views
		if (this.dataManager) {
			this.dataManager.updateSettings(this.settings);
		}
		this.app.workspace.getLeavesOfType(VIEW_TYPE_ARCADIA_PROJECTS).forEach((leaf) => {
			if (leaf.view instanceof ProjectView) {
				leaf.view.updateSettings(this.settings);
			}
		});
	}

	async activateView(): Promise<void> {
		const existing = this.app.workspace.getLeavesOfType(VIEW_TYPE_ARCADIA_PROJECTS);
		if (existing.length > 0) {
			this.app.workspace.revealLeaf(existing[0]);
			return;
		}

		const leaf = this.app.workspace.getRightLeaf(false);
		if (leaf) {
			await leaf.setViewState({
				type: VIEW_TYPE_ARCADIA_PROJECTS,
				active: true,
			});
			this.app.workspace.revealLeaf(leaf);
		}
	}

	private switchView(mode: "table" | "kanban"): void {
		const leaves = this.app.workspace.getLeavesOfType(VIEW_TYPE_ARCADIA_PROJECTS);
		if (leaves.length > 0 && leaves[0].view instanceof ProjectView) {
			leaves[0].view.switchView(mode);
			this.app.workspace.revealLeaf(leaves[0]);
		} else {
			// Open the view first, then switch
			void this.activateView().then(() => {
				const newLeaves = this.app.workspace.getLeavesOfType(VIEW_TYPE_ARCADIA_PROJECTS);
				if (newLeaves.length > 0 && newLeaves[0].view instanceof ProjectView) {
					newLeaves[0].view.switchView(mode);
				}
			});
		}
	}
}
