// src/utils/constants.ts

export const DEBUG_MODE =
	(typeof process !== "undefined" && process.env.NODE_ENV === "development") ||
	process.env.CI;

console.log("ENABLE_LOGGER", DEBUG_MODE);

export const APP_NAME = "HotSandboxNote";
export const VIEW_TYPE_HOT_SANDBOX = "hot-sandbox-note-view";
export const HOT_SANDBOX_NOTE_ICON = "package";

export const HOT_SANDBOX_ID_PREFIX = "hsbox-";

export const SAVE_DEBOUNCE_MS = 500;
