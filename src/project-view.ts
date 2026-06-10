import { ItemView, WorkspaceLeaf, setIcon } from "obsidian";
import { VIEW_TYPE_ARCADIA_PROJECTS, ViewMode, ArcadiaProjectsSettings } from "./types";
import { ProjectDataManager } from "./data";
import { TableView } from "./table-view";
import { KanbanView } from "./kanban-view";

export class ProjectView extends ItemView {
	private settings: ArcadiaProjectsSettings;
	private dataManager: ProjectDataManager;
	private currentMode: ViewMode;
	private tableView: TableView | null = null;
	private kanbanView: KanbanView | null = null;
	private contentContainerEl: HTMLElement | null = null;
	private dataChangedHandler: () => void;

	constructor(
		leaf: WorkspaceLeaf,
		settings: ArcadiaProjectsSettings,
		dataManager: ProjectDataManager
	) {
		super(leaf);
		this.settings = settings;
		this.dataManager = dataManager;
		this.currentMode = settings.defaultView;
		this.dataChangedHandler = () => this.renderCurrentView();
	}

	getViewType(): string {
		return VIEW_TYPE_ARCADIA_PROJECTS;
	}

	getDisplayText(): string {
		return "Arcadia Projects";
	}

	getIcon(): string {
		return "layout-dashboard";
	}

	async onOpen(): Promise<void> {
		await Promise.resolve();
		const container = this.containerEl.children[1] as HTMLElement;
		container.empty();
		container.addClass("arcadia-projects-root");

		// Toolbar
		const toolbar = container.createDiv({ cls: "arcadia-projects-toolbar" });

		// View mode tabs
		const tabs = toolbar.createDiv({ cls: "arcadia-projects-tabs" });

		const tableTab = tabs.createDiv({ cls: "arcadia-projects-tab" });
		setIcon(tableTab.createSpan({ cls: "arcadia-projects-tab-icon" }), "table");
		tableTab.createSpan({ text: "Table" });
		this.registerDomEvent(tableTab, "click", () => this.switchView("table"));

		const kanbanTab = tabs.createDiv({ cls: "arcadia-projects-tab" });
		setIcon(kanbanTab.createSpan({ cls: "arcadia-projects-tab-icon" }), "columns");
		kanbanTab.createSpan({ text: "Kanban" });
		this.registerDomEvent(kanbanTab, "click", () => this.switchView("kanban"));

		// Refresh button
		const refreshBtn = toolbar.createDiv({ cls: "arcadia-projects-refresh-btn" });
		setIcon(refreshBtn, "refresh-cw");
		refreshBtn.setAttribute("aria-label", "Refresh");
		this.registerDomEvent(refreshBtn, "click", () => {
			this.dataManager.refresh();
		});

		// Content container
		this.contentContainerEl = container.createDiv({ cls: "arcadia-projects-content" });

		// Listen for data changes (cleaned up automatically on view unload)
		this.registerEvent(this.dataManager.on("data-changed", this.dataChangedHandler));

		// Initial data load
		this.dataManager.refresh();

		// Update tab active states
		this.updateTabStates();
	}

	async onClose(): Promise<void> {
		await Promise.resolve();
		this.destroyViews();
	}

	switchView(mode: ViewMode): void {
		this.currentMode = mode;
		this.updateTabStates();
		this.renderCurrentView();
	}

	updateSettings(settings: ArcadiaProjectsSettings): void {
		this.settings = settings;
		// Recreate the sub-views so they pick up the new settings
		this.destroyViews();
		this.dataManager.updateSettings(settings);
		this.dataManager.refresh();
	}

	private updateTabStates(): void {
		const tabs = this.containerEl.querySelectorAll(".arcadia-projects-tab");
		tabs.forEach((tab, index) => {
			if (
				(index === 0 && this.currentMode === "table") ||
				(index === 1 && this.currentMode === "kanban")
			) {
				tab.addClass("arcadia-projects-tab-active");
			} else {
				tab.removeClass("arcadia-projects-tab-active");
			}
		});
	}

	private renderCurrentView(): void {
		if (!this.contentContainerEl) return;

		// Reuse the active sub-view on data refreshes so filter and sort
		// state survive vault changes; only recreate on mode switch.
		if (this.currentMode === "table") {
			if (this.kanbanView) {
				this.kanbanView.destroy();
				this.kanbanView = null;
			}
			if (!this.tableView) {
				this.tableView = new TableView(
					this.app,
					this.contentContainerEl,
					this.dataManager,
					this.settings
				);
			}
			this.tableView.render();
		} else {
			if (this.tableView) {
				this.tableView.destroy();
				this.tableView = null;
			}
			if (!this.kanbanView) {
				this.kanbanView = new KanbanView(
					this.app,
					this.contentContainerEl,
					this.dataManager,
					this.settings
				);
			}
			this.kanbanView.render();
		}
	}

	private destroyViews(): void {
		if (this.tableView) {
			this.tableView.destroy();
			this.tableView = null;
		}
		if (this.kanbanView) {
			this.kanbanView.destroy();
			this.kanbanView = null;
		}
	}
}
