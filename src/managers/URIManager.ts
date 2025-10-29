import type { Plugin } from "obsidian";
import { injectable } from "tsyringe";
import type { IManager } from "./IManager";
import type { ViewManager } from "./ViewManager";

type Context = {
	registerObsidianProtocolHandler: Plugin["registerObsidianProtocolHandler"];
	createAndOpenSandbox: ViewManager["createAndOpenSandbox"];
};

@injectable()
export class URIManager implements IManager {
	constructor(private context: Context) {}

	load(): void {
		this.context.registerObsidianProtocolHandler(
			"create-hot-sandbox",
			(params) => {
				this.context.createAndOpenSandbox(params.content);
			},
		);
	}
	unload(): void {}
}
