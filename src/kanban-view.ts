import { App, Menu, Notice, Modal, Setting } from "obsidian";
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
			empty.setText(
				this.settings.projectFolder.trim()
					? `No notes found in "${this.settings.projectFolder}". Add notes to that folder or update the project folder setting.`
					: "Set a project folder in the Arcadia Projects settings to get started."
			);
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

		// Drop zone events (the uncategorized column is not a drop target)
		const isDropTarget = statusVal !== "__uncategorized__";

		column.addEventListener("dragover", (e) => {
			if (!isDropTarget) return;
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
			e.preventDefault();
			column.removeClass("arcadia-projects-kanban-column-dragover");

			const note = this.draggedNote;
			this.draggedNote = null;
			if (note && isDropTarget) {
				void this.moveNote(note, statusVal);
			}
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

		// Context menu fallback for moving cards (right-click on desktop,
		// long-press on mobile, where drag and drop is not available)
		card.addEventListener("contextmenu", (e) => {
			e.preventDefault();
			this.showMoveMenu(note, e);
		});
	}

	/** Write the new status to the note's frontmatter, skipping no-op moves */
	private async moveNote(note: ProjectNote, statusVal: string): Promise<void> {
		const current = note.properties[this.settings.statusProperty];
		if (current != null && String(current).trim() === statusVal) return;

		try {
			await this.dataManager.updateNoteProperty(
				note.file,
				this.settings.statusProperty,
				statusVal
			);
			// Data manager will emit data-changed, which triggers re-render
		} catch (err) {
			new Notice(
				`Could not move "${note.title}": ${err instanceof Error ? err.message : String(err)}`
			);
		}
	}

	/** Menu listing the configured columns so a card can be moved without dragging */
	private showMoveMenu(note: ProjectNote, e: MouseEvent): void {
		const menu = new Menu();
		const current = note.properties[this.settings.statusProperty];
		const currentVal = current != null ? String(current).trim() : "";

		for (const statusVal of this.settings.statusValues) {
			menu.addItem((item) => {
				item.setTitle(`Move to ${this.formatStatusName(statusVal)}`)
					.setIcon("arrow-right")
					.setDisabled(statusVal === currentVal)
					.onClick(() => { void this.moveNote(note, statusVal); });
			});
		}

		menu.showAtMouseEvent(e);
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
		return String(val as string | number | boolean);
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
	private creating = false;

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
			window.setTimeout(() => text.inputEl.focus(), 50);

			// Enter key to create (ignore IME composition)
			text.inputEl.addEventListener("keydown", (e) => {
				if (e.key === "Enter" && !e.isComposing) {
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
			new Notice("Enter a note title first.");
			return;
		}
		if (this.creating) return;
		this.creating = true;

		try {
			const properties: Record<string, string> = {
				[this.settings.statusProperty]: this.statusVal,
			};
			const file = await this.dataManager.createNote(this.noteTitle, properties);
			new Notice(`Created "${file.basename}"`);
			this.close();
		} catch (err) {
			new Notice(`Could not create the note: ${err instanceof Error ? err.message : String(err)}`);
		} finally {
			this.creating = false;
		}
	}

	onClose(): void {
		this.contentEl.empty();
	}
}

