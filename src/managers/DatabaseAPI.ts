import { clear, createStore, del, get, keys, set } from "idb-keyval";
import log from "loglevel";
import type { HotSandboxNoteData } from "src/types";

const logger = log.getLogger("DatabaseAPI");

const SANDBOX_STORE_NAME = "sandboxes";
const DB_NAME = "SandboxNoteDatabase";

export class DatabaseAPI {
	private store = createStore(DB_NAME, SANDBOX_STORE_NAME);

	async getSandbox(id: string): Promise<HotSandboxNoteData | undefined> {
		const data = await get<HotSandboxNoteData>(id, this.store);

		if (data && !this.validateSandboxData(data)) {
			logger.debug(
				`Invalid sandbox data detected for id: ${id}, skipping...`
			);
			return undefined;
		}

		return data;
	}

	async saveSandbox(note: HotSandboxNoteData): Promise<string> {
		await set(note.id, note, this.store);
		return note.id;
	}

	async deleteSandbox(id: string): Promise<void> {
		await del(id, this.store);
	}

	async getAllSandboxes(): Promise<HotSandboxNoteData[]> {
		const allKeys = await keys(this.store);
		const sandboxes: HotSandboxNoteData[] = [];

		for (const key of allKeys) {
			const sandbox = await get<HotSandboxNoteData>(key, this.store);
			if (sandbox) {
				sandboxes.push(sandbox);
			}
		}

		return sandboxes;
	}

	async clearAllSandboxes(): Promise<void> {
		await clear(this.store);
	}

	async countSandboxes(): Promise<number> {
		const allKeys = await keys(this.store);
		return allKeys.length;
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

	/**
	 * Close method for compatibility with previous Dexie implementation
	 * idb-keyval doesn't require explicit closing
	 */
	close(): void {
		// No-op: idb-keyval doesn't require explicit closing
	}
}
