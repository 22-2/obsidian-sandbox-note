import type { JSHandle, Page } from "playwright";
import type { Plugin } from "./types";

export async function getPluginHandleMap(
	page: Page,
	plugins: { pluginId: string; path: string }[]
): Promise<JSHandle<Map<string, Plugin>>> {
	// Wait for plugins to be loaded
	await page.waitForFunction(
		(pluginIds) => {
			const app = (globalThis as any).app;
			if (!app?.plugins) return false;
			return pluginIds.every((id: string) => app.plugins.getPlugin(id));
		},
		plugins.map((p) => p.pluginId),
		{ timeout: 10000 }
	);

	return page.evaluateHandle((plugins) => {
		const map = new Map<string, Plugin>();
		plugins.forEach((p) => {
			const plugin = (globalThis as any).app?.plugins.getPlugin(
				p.pluginId
			);
			if (plugin) {
				map.set(p.pluginId, plugin);
			}
		});
		return map;
	}, plugins);
}
