import {
	Workspace,
	WorkspaceLeaf,
	WorkspaceParent,
	WorkspaceWindow,
	type App,
	type UViewState,
} from "obsidian";

/** Create virtual TFile-like object. */
// export function createVirtualFile(app: App) {
// 	const now = new Date().getTime();
// 	const file = new TFile(app.vault, `sandbox-note.md`);
// 	// return {
// 	// 	path: `sandbox-note.md`,
// 	// 	name: `Sandbox Note.md`,
// 	// 	basename: `Sandbox Note`,
// 	// 	extension: "md",
// 	// 	vault: app.vault,
// 	// 	// stat is a dummy value
// 	// 	stat: {
// 	// 		ctime: now,
// 	// 		mtime: now,
// 	// 		size: 0,
// 	// 	},
// 	// };
// }
/** Open view in new tab. */
export async function activateView<T = any, U = any>(
	{
		getLeaf,
	}: {
		getLeaf: Workspace["getLeaf"];
	},
	viewState: UViewState,
	eState?: U,
): Promise<T> {
	const leaf: WorkspaceLeaf = getLeaf("tab");

	if (viewState) {
		await leaf.setViewState(viewState);
	}
	if (eState) {
		leaf.setEphemeralState(eState);
	}

	return leaf.view as T;
}

/** Get all workspace leaves. */
export function getAllLeaves(app: App): WorkspaceLeaf[] {
	const leaves: WorkspaceLeaf[] = [];
	app.workspace.iterateAllLeaves((leaf: WorkspaceLeaf) => {
		leaves.push(leaf);
	});
	return leaves;
}

/** Get workspace items of specific type. */
function getWorkspaceItems<T extends WorkspaceWindow | WorkspaceParent>(
	app: App,
	getItem: (leaf: WorkspaceLeaf) => T | null | undefined,
): T[] {
	const itemMap = new Map<string, T>();
	getAllLeaves(app).forEach((leaf) => {
		const item = getItem(leaf);
		if (item && item.id) {
			itemMap.set(item.id, item);
		}
	});
	return Array.from(itemMap.values()) as T[];
}

/** Get all workspace windows. */
export function getAllWorkspaceWindows(app: App): WorkspaceWindow[] {
	return getWorkspaceItems<WorkspaceWindow>(app, (leaf) => leaf.getContainer());
}
