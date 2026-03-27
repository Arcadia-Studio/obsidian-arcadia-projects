import { TFile } from "obsidian";

export const VIEW_TYPE_ARCADIA_PROJECTS = "arcadia-projects-view";

export type ViewMode = "table" | "kanban";

export interface ArcadiaProjectsSettings {
	projectFolder: string;
	statusProperty: string;
	statusValues: string[];
	dateProperty: string;
	defaultView: ViewMode;
	cardFields: string[];
	licenseKey: string;
	isPro: boolean;
}

export const DEFAULT_SETTINGS: ArcadiaProjectsSettings = {
	projectFolder: "",
	statusProperty: "status",
	statusValues: ["todo", "in-progress", "done"],
	dateProperty: "due",
	defaultView: "table",
	cardFields: ["status", "due", "tags"],
	licenseKey: "",
	isPro: false,
};

export interface ProjectNote {
	file: TFile;
	title: string;
	properties: Record<string, unknown>;
}

export type SortDirection = "asc" | "desc";

export interface SortState {
	column: string;
	direction: SortDirection;
}
