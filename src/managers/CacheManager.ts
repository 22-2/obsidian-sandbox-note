import log from "loglevel";
import type { AppEvents } from "src/events/AppEvents";
import type { HotSandboxNoteData } from "src/types";
import type { EventEmitter } from "src/utils/EventEmitter";
import { injectable } from "tsyringe";
import type { IManager } from "./IManager";

const logger = log.getLogger("HotSandboxManager");

type Context = {
	emitter: EventEmitter<AppEvents>;
	getAllSandboxes: () => Promise<HotSandboxNoteData[]>;
};

@injectable()
export class CacheManager implements IManager {
	private sandboxes = new Map<string, HotSandboxNoteData>();

	constructor(private context: Context) {}

	async load(): Promise<void> {
		const allSandboxes = await this.context.getAllSandboxes();

		logger.debug(
			`📦 Loading sandboxes from IndexedDB, total: ${allSandboxes.length}`
		);

		let loadedCount = 0;
		let skippedCount = 0;

		allSandboxes.forEach((note) => {
			// Validate sandbox data before loading into cache
			if (this.validateSandboxData(note)) {
				this.sandboxes.set(note.id, note);
				logger.debug(
					`  ✅ Loaded: ${note.id}, content length: ${note.content.length}`
				);
				loadedCount++;
			} else {
				logger.warn(`  ❌ Skipping corrupted sandbox data: ${note.id}`);
				skippedCount++;
			}
		});

		logger.debug(
			`📦 Loaded ${loadedCount} hot sandbox notes into memory${
				skippedCount > 0 ? `, skipped ${skippedCount} corrupted` : ""
			}.`
		);
		// this.emitter.emit("notes-loaded", { count: allNotes.length });
	}

	/**
	 * Validates the structure and integrity of sandbox data
	 * @param note - The sandbox note data to validate
	 * @returns true if the data is valid, false otherwise
	 */
	private validateSandboxData(note: HotSandboxNoteData): boolean {
		return (
			typeof note.id === "string" &&
			note.id.length > 0 &&
			typeof note.content === "string" &&
			typeof note.mtime === "number" &&
			note.mtime > 0
		);
	}

	getAllSandboxes(): HotSandboxNoteData[] {
		return Array.from(this.sandboxes.values());
	}

	getSandboxContent(masterId: string): string | undefined {
		const sandbox = this.sandboxes.get(masterId);
		logger.debug(
			`🔍 getSandboxContent(${masterId}): ${
				sandbox
					? `found, length: ${sandbox.content.length}`
					: "not found"
			}`
		);
		return sandbox?.content;
	}

	get(masterId: string): HotSandboxNoteData | undefined {
		return this.sandboxes.get(masterId);
	}

	registerNewSandbox(masterId: string): void {
		if (!this.sandboxes.has(masterId)) {
			const newNote: HotSandboxNoteData = {
				id: masterId,
				content: "",
				mtime: Date.now(),
			};
			this.sandboxes.set(masterId, newNote);
			logger.debug(`Registered new note: ${masterId}`);
			// this.emitter.emit("sandbox-note-registered", { noteId: masterId });
		}
	}

	delete(masterId: string): void {
		this.sandboxes.delete(masterId);
		logger.debug(`Deleted note: ${masterId}`);
	}

	set(masterId: string, content: string): void {
		const note = this.sandboxes.get(masterId);
		if (note) {
			note.content = content;
			note.mtime = Date.now();
			// this.emitter.emit("sandbox-note-content-updated", {
			// 	noteId: masterId,
			// 	content,
			// });
		}
	}

	unload(): void {
		this.sandboxes.clear();
	}
}
