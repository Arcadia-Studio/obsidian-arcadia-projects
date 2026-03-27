import { App, TFile, TFolder, Events, MetadataCache, Vault } from "obsidian";
import { ArcadiaProjectsSettings, ProjectNote, SortState } from "./types";

export class ProjectDataManager extends Events {
	private app: App;
	private settings: ArcadiaProjectsSettings;
	private notes: ProjectNote[] = [];
	private metadataCacheRef: ReturnType<typeof this.app.metadataCache.on> | null = null;
	private vaultRef: ReturnType<typeof this.app.vault.on> | null = null;
	private vaultDeleteRef: ReturnType<typeof this.app.vault.on> | null = null;

	constructor(app: App, settings: ArcadiaProjectsSettings) {
		super();
		this.app = app;
		this.settings = settings;
	}

	/** Start listening for vault changes */
	startListening(): void {
		this.metadataCacheRef = this.app.metadataCache.on("changed", (file) => {
			if (this.isProjectFile(file)) {
				this.refresh();
			}
		});

		this.vaultRef = this.app.vault.on("create", (file) => {
			if (file instanceof TFile && this.isProjectFile(file)) {
				this.refresh();
			}
		});

		this.vaultDeleteRef = this.app.vault.on("delete", (file) => {
			if (file instanceof TFile && this.isProjectFile(file)) {
				this.refresh();
			}
		});
	}

	/** Stop listening for vault changes */
	stopListening(): void {
		if (this.metadataCacheRef) {
			this.app.metadataCache.offref(this.metadataCacheRef);
			this.metadataCacheRef = null;
		}
		if (this.vaultRef) {
			this.app.vault.offref(this.vaultRef);
			this.vaultRef = null;
		}
		if (this.vaultDeleteRef) {
			this.app.vault.offref(this.vaultDeleteRef);
			this.vaultDeleteRef = null;
		}
	}

	updateSettings(settings: ArcadiaProjectsSettings): void {
		this.settings = settings;
	}

	/** Check if a file belongs to the configured project folder */
	private isProjectFile(file: TFile): boolean {
		if (!this.settings.projectFolder) return false;
		const folderPath = this.normalizePath(this.settings.projectFolder);
		return file.path.startsWith(folderPath) && file.extension === "md";
	}

	private normalizePath(path: string): string {
		// Ensure folder path ends with /
		let p = path.replace(/\\/g, "/");
		if (!p.endsWith("/")) p += "/";
		return p;
	}

	/** Refresh the notes array from vault */
	refresh(): void {
		this.notes = this.loadNotes();
		this.trigger("data-changed");
	}

	/** Load all project notes from the configured folder */
	private loadNotes(): ProjectNote[] {
		const folderPath = this.settings.projectFolder;
		if (!folderPath) return [];

		const normalizedPath = this.normalizePath(folderPath);
		const folder = this.app.vault.getAbstractFileByPath(
			normalizedPath.endsWith("/") ? normalizedPath.slice(0, -1) : normalizedPath
		);

		if (!folder || !(folder instanceof TFolder)) return [];

		const notes: ProjectNote[] = [];
		this.collectMarkdownFiles(folder, notes);
		return notes;
	}

	/** Recursively collect .md files from a folder */
	private collectMarkdownFiles(folder: TFolder, notes: ProjectNote[]): void {
		for (const child of folder.children) {
			if (child instanceof TFile && child.extension === "md") {
				const note = this.buildProjectNote(child);
				notes.push(note);
			} else if (child instanceof TFolder) {
				this.collectMarkdownFiles(child, notes);
			}
		}
	}

	/** Build a ProjectNote from a TFile using MetadataCache */
	private buildProjectNote(file: TFile): ProjectNote {
		const cache = this.app.metadataCache.getFileCache(file);
		const frontmatter = cache?.frontmatter ?? {};

		// Build a clean properties object (exclude position metadata)
		const properties: Record<string, unknown> = {};
		for (const key of Object.keys(frontmatter)) {
			if (key === "position") continue;
			properties[key] = frontmatter[key];
		}

		return {
			file,
			title: file.basename,
			properties,
		};
	}

	/** Get all notes */
	getNotes(): ProjectNote[] {
		return this.notes;
	}

	/** Get notes filtered by a text query across all property values */
	getFilteredNotes(query: string): ProjectNote[] {
		if (!query.trim()) return this.notes;
		const lower = query.toLowerCase();
		return this.notes.filter((note) => {
			if (note.title.toLowerCase().includes(lower)) return true;
			for (const val of Object.values(note.properties)) {
				if (String(val).toLowerCase().includes(lower)) return true;
			}
			return false;
		});
	}

	/** Get notes sorted by a column */
	getSortedNotes(notes: ProjectNote[], sort: SortState | null): ProjectNote[] {
		if (!sort) return notes;
		const sorted = [...notes];
		sorted.sort((a, b) => {
			let aVal = sort.column === "title" ? a.title : a.properties[sort.column];
			let bVal = sort.column === "title" ? b.title : b.properties[sort.column];

			// Handle undefined
			if (aVal == null) aVal = "";
			if (bVal == null) bVal = "";

			const aStr = String(aVal).toLowerCase();
			const bStr = String(bVal).toLowerCase();

			const cmp = aStr.localeCompare(bStr);
			return sort.direction === "asc" ? cmp : -cmp;
		});
		return sorted;
	}

	/** Get notes grouped by a property value (for Kanban) */
	getGroupedNotes(property: string, orderedValues: string[]): Map<string, ProjectNote[]> {
		const groups = new Map<string, ProjectNote[]>();

		// Initialize all configured columns
		for (const val of orderedValues) {
			groups.set(val, []);
		}
		// Add an "Uncategorized" group for notes without the property
		groups.set("__uncategorized__", []);

		for (const note of this.notes) {
			const rawVal = note.properties[property];
			const val = rawVal != null ? String(rawVal).trim() : "";

			if (val && groups.has(val)) {
				groups.get(val)!.push(note);
			} else if (val) {
				// Value exists but isn't in the configured list
				if (!groups.has(val)) {
					groups.set(val, []);
				}
				groups.get(val)!.push(note);
			} else {
				groups.get("__uncategorized__")!.push(note);
			}
		}

		return groups;
	}

	/** Collect all unique frontmatter property keys across all notes */
	getAllPropertyKeys(): string[] {
		const keys = new Set<string>();
		for (const note of this.notes) {
			for (const key of Object.keys(note.properties)) {
				keys.add(key);
			}
		}
		return Array.from(keys).sort();
	}

	/** Update a note's frontmatter property */
	async updateNoteProperty(file: TFile, property: string, value: string): Promise<void> {
		await this.app.fileManager.processFrontMatter(file, (fm) => {
			fm[property] = value;
		});
	}

	/** Create a new note in the project folder with given properties */
	async createNote(title: string, properties: Record<string, string>): Promise<TFile> {
		const folderPath = this.settings.projectFolder.replace(/\/$/, "");
		const filePath = `${folderPath}/${title}.md`;

		// Build YAML frontmatter
		let yaml = "---\n";
		for (const [key, val] of Object.entries(properties)) {
			yaml += `${key}: ${val}\n`;
		}
		yaml += "---\n";

		const file = await this.app.vault.create(filePath, yaml);
		return file;
	}
}
