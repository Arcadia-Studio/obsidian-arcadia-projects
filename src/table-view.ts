import { App } from "obsidian";
import { ProjectDataManager } from "./data";
import { SortState, ArcadiaProjectsSettings } from "./types";

export class TableView {
	private app: App;
	private containerEl: HTMLElement;
	private dataManager: ProjectDataManager;
	private settings: ArcadiaProjectsSettings;
	private sortState: SortState | null = null;
	private filterQuery = "";
	private filterInputEl: HTMLInputElement | null = null;

	constructor(
		app: App,
		containerEl: HTMLElement,
		dataManager: ProjectDataManager,
		settings: ArcadiaProjectsSettings
	) {
		this.app = app;
		this.containerEl = containerEl;
		this.dataManager = dataManager;
		this.settings = settings;
	}

	render(): void {
		this.containerEl.empty();
		this.containerEl.addClass("arcadia-projects-table-container");

		// Filter bar
		const filterBar = this.containerEl.createDiv({ cls: "arcadia-projects-filter-bar" });
		this.filterInputEl = filterBar.createEl("input", {
			cls: "arcadia-projects-filter-input",
			attr: { type: "text", placeholder: "Filter notes..." },
		});
		this.filterInputEl.value = this.filterQuery;
		this.filterInputEl.addEventListener("input", () => {
			this.filterQuery = this.filterInputEl!.value;
			this.renderTable();
		});

		// Table wrapper (for horizontal scroll)
		this.containerEl.createDiv({ cls: "arcadia-projects-table-wrapper" });

		this.renderTable();
	}

	private renderTable(): void {
		const wrapper = this.containerEl.querySelector(".arcadia-projects-table-wrapper");
		if (!wrapper) return;
		wrapper.innerHTML = "";

		let notes = this.dataManager.getFilteredNotes(this.filterQuery);
		notes = this.dataManager.getSortedNotes(notes, this.sortState);

		if (notes.length === 0) {
			const empty = wrapper.createDiv({ cls: "arcadia-projects-empty" });
			empty.setText(
				this.dataManager.getNotes().length === 0
					? "No notes found. Check your project folder setting."
					: "No notes match the current filter."
			);
			return;
		}

		// Determine columns: title + all unique property keys
		const allKeys = this.dataManager.getAllPropertyKeys();
		const columns = ["title", ...allKeys];

		const table = wrapper.createEl("table", { cls: "arcadia-projects-table" });

		// Header
		const thead = table.createEl("thead");
		const headerRow = thead.createEl("tr");
		for (const col of columns) {
			const th = headerRow.createEl("th", { cls: "arcadia-projects-th" });
			const headerContent = th.createDiv({ cls: "arcadia-projects-th-content" });
			headerContent.createSpan({ text: this.formatColumnName(col) });

			// Sort indicator
			if (this.sortState && this.sortState.column === col) {
				const sortIcon = headerContent.createSpan({ cls: "arcadia-projects-sort-icon" });
				sortIcon.setText(this.sortState.direction === "asc" ? " \u25B2" : " \u25BC");
			}

			th.addEventListener("click", () => {
				this.toggleSort(col);
			});
		}

		// Body
		const tbody = table.createEl("tbody");
		for (const note of notes) {
			const row = tbody.createEl("tr", { cls: "arcadia-projects-row" });

			for (const col of columns) {
				const td = row.createEl("td", { cls: "arcadia-projects-td" });

				if (col === "title") {
					const link = td.createEl("a", {
						cls: "arcadia-projects-note-link",
						text: note.title,
					});
					link.addEventListener("click", (e) => {
						e.preventDefault();
						void this.app.workspace.openLinkText(note.file.path, "", false);
					});
				} else {
					const val = note.properties[col];
					td.setText(this.formatCellValue(val));

					// Add status class for styling
					if (col === this.settings.statusProperty && val != null) {
						const statusStr = typeof val === "object" ? JSON.stringify(val) : String(val as string | number | boolean);
						td.addClass(`arcadia-projects-status-${statusStr.toLowerCase().replace(/\s+/g, "-")}`);
					}
				}
			}
		}
	}

	private toggleSort(column: string): void {
		if (this.sortState && this.sortState.column === column) {
			if (this.sortState.direction === "asc") {
				this.sortState.direction = "desc";
			} else {
				this.sortState = null; // Third click clears sort
			}
		} else {
			this.sortState = { column, direction: "asc" };
		}
		this.renderTable();
	}

	private formatColumnName(key: string): string {
		if (key === "title") return "Title";
		// Capitalize first letter and replace hyphens/underscores with spaces
		return key
			.replace(/[-_]/g, " ")
			.replace(/\b\w/g, (c) => c.toUpperCase());
	}

	private formatCellValue(val: unknown): string {
		if (val == null) return "";
		if (Array.isArray(val)) return val.join(", ");
		if (typeof val === "object") return JSON.stringify(val);
		return String(val as string | number | boolean);
	}

	destroy(): void {
		this.containerEl.empty();
	}
}
