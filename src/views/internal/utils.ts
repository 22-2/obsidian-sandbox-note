import log from "loglevel";
import { App, Notice } from "obsidian";
import { showFilePathPrompt } from "src/helpers/interaction";
import { t } from "src/i18n";
import type { PluginSettings } from "src/settings";
import type { AbstractNoteView } from "./AbstractNoteView";

const logger = log.getLogger("Utils");

// --- Main Conversion Utility ---
export async function extractToFileInteraction<T extends AbstractNoteView>(
	view: T,
) {
	const settings: PluginSettings = view.pluginSettings;

	try {
		// Get content and base title.
		const content = view.getContent();
		let baseTitle = t("defaults.untitled");

		// Use first line as title if the setting is enabled
		if (settings["appearance.firstLineAsTitle"]) {
			const firstLine = splitMd(content).content.split("\n")[0].trim();
			if (firstLine.length > 0) {
				baseTitle = firstLine;
			}
		}

		// Sanitize filenames
		const sanitizedBasename = sanitizeFilename(baseTitle);

		// Determine save path.
		const defaultLocation = settings["fileOperation.useObsidianDefaultLocation"]
			? (view.app.vault.getConfig("newFileFolderPath") as string)
			: settings["fileOperation.defaultSavePath"];

		const suggestedPath = buildSuggestedPath(
			defaultLocation,
			sanitizedBasename,
		);

		// Resolve the final file path.
		const finalFilePath = await resolveFinalPath(
			view.app,
			settings,
			suggestedPath,
			sanitizedBasename,
		);

		// If canceled
		if (!finalFilePath) {
			new Notice(t("notices.conversionCancelled"));
			return;
		}

		// Clear content and create a new file.
		await createAndOpenFile(view, finalFilePath, content, baseTitle);

		return true;
	} catch (error: any) {
		handleConversionError(error);
		return false;
	}
}

function sanitizeFilename(filename: string): string {
	return (
		filename.replace(/[\\/:"*?<>|]+/g, "").trim() || t("defaults.untitled")
	);
}

function buildSuggestedPath(savePath: string, basename: string): string {
	const normalizedPath =
		savePath && !savePath.endsWith("/") ? `${savePath}/` : savePath;
	return `${normalizedPath}${basename}`;
}

async function resolveFinalPath(
	app: App,
	settings: PluginSettings,
	suggestedPath: string,
	basename: string,
): Promise<string | null> {
	if (settings["fileOperation.confirmBeforeSaving"]) {
		const result = await showFilePathPrompt(app, {
			baseFileName: basename,
			initialPath: suggestedPath,
		});
		return result.fullPath || null;
	}
	return suggestedPath;
}

type Path = { path: { basename: (path: string) => string } };

async function createAndOpenFile<T extends AbstractNoteView>(
	view: T,
	filePath: string,
	content: string,
	baseTitle: string,
): Promise<void> {
	const availablePath = view.app.vault.getAvailablePath(filePath, "md");
	view.app.workspace.activeEditor?.editor?.setValue(content);
	const newFile = await view.app.vault.create(availablePath, content);
	view.setContent("");
	await view.leaf.openFile(newFile);
	new Notice(
		t("notices.convertedToFile", { title: baseTitle, path: availablePath }),
	);
}

function handleConversionError(error: Error): void {
	if (error.message.includes("ENOENT")) {
		new Notice(t("notices.failedToConvertNoFile"));
		throw error;
	}

	new Notice(t("notices.failedToConvertGeneral"), 5000);
	throw error;
}

export function getSandboxVaultPath() {
	try {
		return require("electron").ipcRenderer.sendSync("get-sandbox-vault-path");
	} catch {
		return undefined;
	}
}

export interface ParsedMarkdown {
	frontmatter: string;
	content: string;
}
/**
 * A function to separate the frontmatter and content of a Markdown file.
 * @param markdown - The Markdown string to be parsed.
 * @returns An object containing the separated frontmatter and content.
 */

export function splitMd(markdown: string | null | undefined): ParsedMarkdown {
	// Regular expression to isolate the frontmatter block
	const frontmatterRegex = /^---\n([\s\S]*?)\n---/;

	// Treat null or undefined input as an empty string
	const safeMarkdown = markdown ?? "";

	const match = safeMarkdown.match(frontmatterRegex);

	let frontmatter = "";
	let content = safeMarkdown;

	if (match && match[1]) {
		// If a frontmatter block is found
		frontmatter = match[1].trim(); // Extract the content within the delimiters
		content = safeMarkdown.slice(match[0].length); // Extract the rest of the string as content
	}

	return { frontmatter, content };
}
