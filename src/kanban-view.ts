import { App, Notice, Modal, Setting } from "obsidian";
import { ProjectDataManager } from "./data";
import { ArcadiaProjectsSettings, ProjectNote } from "./types";

export class KanbanView {
	private app: App;
	private containerEl: HTMLElement;
	private dataManager: ProjectDataManager;
	private settings: ArcadiaProjectsSettings;
	private draggedNote: ProjectNote | null = null;

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
		this.containerEl.addClass("arcadia-projects-kanban-container");

		const grouped = this.dataManager.getGroupedNotes(
			this.settings.statusProperty,
			this.settings.statusValues
		);

		if (this.dataManager.getNotes().length === 0) {
			const empty = this.containerEl.createDiv({ cls: "arcadia-projects-empty" });
			empty.setText("No notes found. Check your project folder setting.");
			return;
		}

		const board = this.containerEl.createDiv({ cls: "arcadia-projects-kanban-board" });

		// Render columns in configured order, then any extra values, then uncategorized
		const orderedKeys: string[] = [...this.settings.statusValues];
		for (const key of grouped.keys()) {
			if (key !== "__uncategorized__" && !orderedKeys.includes(key)) {
				orderedKeys.push(key);
			}
		}
		// Add uncategorized last if it has items
		const uncategorized = grouped.get("__uncategorized__") ?? [];
		if (uncategorized.length > 0) {
			orderedKeys.push("__uncategorized__");
		}

		for (const statusVal of orderedKeys) {
			const notes = grouped.get(statusVal) ?? [];
			this.renderColumn(board, statusVal, notes);
		}
	}

	private renderColumn(board: HTMLElement, statusVal: string, notes: ProjectNote[]): void {
		const displayName = statusVal === "__uncategorized__" ? "Uncategorized" : statusVal;

		const column = board.createDiv({ cls: "arcadia-projects-kanban-column" });
		column.dataset.status = statusVal;

		// Column header
		const header = column.createDiv({ cls: "arcadia-projects-kanban-column-header" });
		header.createSpan({
			cls: "arcadia-projects-kanban-column-title",
			text: this.formatStatusName(displayName),
		});
		header.createSpan({
			cls: "arcadia-projects-kanban-column-count",
			text: `${notes.length}`,
		});

		// Cards container
		const cardsContainer = column.createDiv({ cls: "arcadia-projects-kanban-cards" });

		for (const note of notes) {
			this.renderCard(cardsContainer, note);
		}

		// Drop zone events
		column.addEventListener("dragover", (e) => {
			e.preventDefault();
			column.addClass("arcadia-projects-kanban-column-dragover");
		});

		column.addEventListener("dragleave", (e) => {
			// Only remove highlight if leaving the column entirely
			const related = e.relatedTarget as HTMLElement | null;
			if (!related || !column.contains(related)) {
				column.removeClass("arcadia-projects-kanban-column-dragover");
			}
		});

		column.addEventListener("drop", (e) => {
			void (async () => {
				e.preventDefault();
				column.removeClass("arcadia-projects-kanban-column-dragover");

				if (this.draggedNote && statusVal !== "__uncategorized__") {
					await this.dataManager.updateNoteProperty(
						this.draggedNote.file,
						this.settings.statusProperty,
						statusVal
					);
					this.draggedNote = null;
					// Data manager will emit data-changed, which triggers re-render
				}
			})();
		});

		// Add card button (not for uncategorized)
		if (statusVal !== "__uncategorized__") {
			const addBtn = column.createDiv({ cls: "arcadia-projects-kanban-add-card" });
			addBtn.createSpan({ text: "+ Add card" });
			addBtn.addEventListener("click", () => {
				this.showCreateNoteModal(statusVal);
			});
		}
	}

	private renderCard(container: HTMLElement, note: ProjectNote): void {
		const card = container.createDiv({ cls: "arcadia-projects-kanban-card" });
		card.setAttribute("draggable", "true");

		// Title
		const titleEl = card.createDiv({ cls: "arcadia-projects-kanban-card-title" });
		const link = titleEl.createEl("a", {
			text: note.title,
			cls: "arcadia-projects-note-link",
		});
		link.addEventListener("click", (e) => {
			e.preventDefault();
			void this.app.workspace.openLinkText(note.file.path, "", false);
		});

		// Card fields
		const fieldsContainer = card.createDiv({ cls: "arcadia-projects-kanban-card-fields" });
		for (const field of this.settings.cardFields) {
			// Skip the status field since the column already shows it
			if (field === this.settings.statusProperty) continue;

			const rawFieldVal = note.properties[field];
			if (rawFieldVal == null || rawFieldVal === "") continue;

			const fieldEl = fieldsContainer.createDiv({ cls: "arcadia-projects-kanban-card-field" });
			fieldEl.createSpan({
				cls: "arcadia-projects-kanban-card-field-label",
				text: field + ": ",
			});
			fieldEl.createSpan({
				cls: "arcadia-projects-kanban-card-field-value",
				text: this.formatValue(rawFieldVal),
			});
		}

		// Drag events
		card.addEventListener("dragstart", (e) => {
			this.draggedNote = note;
			card.addClass("arcadia-projects-kanban-card-dragging");
			if (e.dataTransfer) {
				e.dataTransfer.effectAllowed = "move";
				e.dataTransfer.setData("text/plain", note.file.path);
			}
		});

		card.addEventListener("dragend", () => {
			card.removeClass("arcadia-projects-kanban-card-dragging");
			this.draggedNote = null;
			// Remove all dragover highlights
			this.containerEl
				.querySelectorAll(".arcadia-projects-kanban-column-dragover")
				.forEach((el) => el.removeClass("arcadia-projects-kanban-column-dragover"));
		});
	}

	private formatStatusName(status: string): string {
		return status
			.replace(/[-_]/g, " ")
			.replace(/\b\w/g, (c) => c.toUpperCase());
	}

	private formatValue(val: unknown): string {
		if (val == null) return "";
		if (Array.isArray(val)) return val.join(", ");
		if (typeof val === "object") return JSON.stringify(val);
		return String(val);
	}

	private showCreateNoteModal(statusVal: string): void {
		const modal = new CreateNoteModal(this.app, this.dataManager, this.settings, statusVal);
		modal.open();
	}

	destroy(): void {
		this.containerEl.empty();
	}
}

/** Modal for creating a new note from the Kanban board */
class CreateNoteModal extends Modal {
	private dataManager: ProjectDataManager;
	private settings: ArcadiaProjectsSettings;
	private statusVal: string;
	private noteTitle = "";

	constructor(
		app: App,
		dataManager: ProjectDataManager,
		settings: ArcadiaProjectsSettings,
		statusVal: string
	) {
		super(app);
		this.dataManager = dataManager;
		this.settings = settings;
		this.statusVal = statusVal;
	}

	async onOpen(): Promise<void> {
		await Promise.resolve();
		const { contentEl } = this;
		new Setting(contentEl).setName("Create new note").setHeading();

		new Setting(contentEl).setName("Title").addText((text) => {
			text.setPlaceholder("Note title").onChange((value) => {
				this.noteTitle = value.trim();
			});
			// Focus the input
			setTimeout(() => text.inputEl.focus(), 50);

			// Enter key to create
			text.inputEl.addEventListener("keydown", (e) => {
				if (e.key === "Enter") {
					void this.createNote();
				}
			});
		});

		new Setting(contentEl).addButton((btn) => {
			btn.setButtonText("Create")
				.setCta()
				.onClick(() => { void this.createNote(); });
		});
	}

	private async createNote(): Promise<void> {
		if (!this.noteTitle) {
			new Notice("Please enter a note title.");
			return;
		}

		try {
			const properties: Record<string, string> = {
				[this.settings.statusProperty]: this.statusVal,
			};
			await this.dataManager.createNote(this.noteTitle, properties);
			new Notice(`Created "${this.noteTitle}"`);
			this.close();
		} catch (err) {
			new Notice(`Failed to create note: ${err instanceof Error ? err.message : String(err)}`);
		}
	}

	onClose(): void {
		this.contentEl.empty();
	}
}

