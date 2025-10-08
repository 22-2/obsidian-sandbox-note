import Dexie, { type Table } from "dexie";
import log from "loglevel";
import type { HotSandboxNoteData } from "src/types";

const logger = log.getLogger("DatabaseAPI");

export class DatabaseAPI extends Dexie {
	// 'notes' is typed with schema of our note object.
	sandboxes!: Table<HotSandboxNoteData>;

	constructor() {
		super("SandboxNoteDatabase");
		this.version(1).stores({
			sandboxes: "&id, content, mtime", // Primary key and indexed props
		});
	}

	async getSandbox(id: string): Promise<HotSandboxNoteData | undefined> {
		const data = await this.sandboxes.get(id);

		if (data && !this.validateSandboxData(data)) {
			logger.debug(`Invalid sandbox data detected for id: ${id}, skipping...`);
			return undefined;
		}

		return data;
	}

	async saveSandbox(note: HotSandboxNoteData): Promise<string> {
		await this.sandboxes.put(note);
		return note.id;
	}

	async deleteSandbox(id: string): Promise<void> {
		await this.sandboxes.delete(id);
	}

	async getAllSandboxes(): Promise<HotSandboxNoteData[]> {
		return this.sandboxes.toArray();
	}

	async clearAllSandboxes(): Promise<void> {
		await this.sandboxes.clear();
	}
	countSandboxes(): Promise<number> {
		return this.sandboxes.count();
	}

	/**
	 * Validates the structure and integrity of sandbox data
	 * @param note - The sandbox note data to validate
	 * @returns true if the data is valid, false otherwise
	 */
	validateSandboxData(note: HotSandboxNoteData): boolean {
		return (
			typeof note.id === "string" &&
			note.id.length > 0 &&
			typeof note.content === "string" &&
			typeof note.mtime === "number" &&
			note.mtime > 0
		);
	}

	/**
	 * Checks if a sandbox note is older than the specified number of days
	 * @param note - The sandbox note data to check
	 * @param days - The number of days to compare against
	 * @returns true if the note is older than the specified days, false otherwise
	 */
	isOlderThanDays(note: HotSandboxNoteData, days: number): boolean {
		const ageInMs = Date.now() - note.mtime;
		const daysInMs = days * 24 * 60 * 60 * 1000;
		return ageInMs > daysInMs;
	}
}
