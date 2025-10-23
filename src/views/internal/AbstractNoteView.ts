// src/views/internal/AbstractNoteView.ts (シンプル版)

import log from "loglevel";
import { nanoid } from "nanoid";
import type { Editor } from "obsidian";
import {
	ItemView,
	Menu,
	Scope,
	type ViewStateResult,
	WorkspaceLeaf,
} from "obsidian";
import type { AppEvents } from "src/events/AppEvents";
import { handleClick, handleContextMenu } from "src/helpers/clickHandler";
import type { SettingsManager } from "src/managers/SettingsManager";
import type { ViewManager } from "src/managers/ViewManager";
import type { PluginSettings } from "src/settings";
import type { EventEmitter } from "src/utils/EventEmitter";
import { HOT_SANDBOX_ID_PREFIX } from "src/utils/constants";
import { MagicalEditorWrapper } from "./MagicalEditorWrapper";
import type { AbstractNoteViewState, ObsidianViewState } from "./types";
import { extractToFileInteraction } from "./utils";

const logger = log.getLogger("AbstractNoteView");

export type Context = {
	getSettings: SettingsManager["getSettings"];
	getActiveView: ViewManager["getActiveView"];
	isLastHotView: ViewManager["isLastHotView"];
	emitter: EventEmitter<AppEvents>;
};

/** ノートビューの基底クラス（インラインエディタ付き） */
export abstract class AbstractNoteView extends ItemView {
	public masterId: string;
	public scope: Scope;
	public wrapper: MagicalEditorWrapper;
	public navigation = true; // リネームプロンプトを防ぐ

	// プライベート状態
	private savingPromise: Promise<void> | null = null;
	private needsContentRestoration = false;

	public get pluginSettings(): PluginSettings {
		return this.context.getSettings();
	}

	public get editor(): Editor | undefined {
		return this.wrapper.magicalEditor?.editor;
	}

	protected get hasUnsavedChanges(): boolean {
		return this.getContent() !== "";
	}

	public get saving(): Promise<void> | null {
		return this.savingPromise;
	}

	// サブクラスで実装すべき抽象メソッド
	public abstract getBaseTitle(): string;
	public abstract getContent(): string;
	public abstract getIcon(): string;
	public abstract getViewType(): string;

	constructor(leaf: WorkspaceLeaf, protected context: Context) {
		super(leaf);
		this.masterId = `${HOT_SANDBOX_ID_PREFIX}-${nanoid()}`;
		this.wrapper = new MagicalEditorWrapper({
			emitter: this.context.emitter,
			getActiveView: this.context.getActiveView,
			parentView: this,
			workspace: this.app.workspace as never,
		});
		this.scope = new Scope(this.app.scope);
	}

	// ========================================
	// ライフサイクルメソッド
	// ========================================

	public override async onOpen() {
		logger.debug("onOpen", { masterId: this.masterId });

		try {
			// エディタを初期化
			await this.wrapper.initialize(this.contentEl, null);

			// イベントハンドラをセットアップ
			this.setupEventHandlers();

			// コンテンツの復元が必要な場合
			if (this.needsContentRestoration) {
				logger.debug(`コンテンツを復元します: ${this.masterId}`);
				this.context.emitter.emit("request-content-restoration", {
					view: this,
					masterId: this.masterId,
				});
				this.needsContentRestoration = false;
			}

			// 開いたことを通知
			this.context.emitter.emit("connect-editor-plugin", { view: this });
			this.context.emitter.emit("view-opened", { view: this });
		} catch (error) {
			this.showError(error);
		}
	}

	public override async onClose() {
		const content = this.getContent();

		// 閉じることを通知（コンテンツを渡す）
		this.context.emitter.emit("view-closed", {
			view: this,
			content: content,
		});

		this.wrapper.unload();
		this.contentEl.empty();
	}

	// ========================================
	// 状態管理
	// ========================================

	public override getState(): AbstractNoteViewState {
		const editorState =
			this.wrapper.magicalEditor?.getState() as ObsidianViewState;

		// コンテンツを除外して、モードとソースだけを保存
		return {
			...editorState,
			type: this.getViewType(),
			state: {
				masterId: this.masterId,
				content: this.getContent(),
			},
		};
	}

	public override async setState(
		state: AbstractNoteViewState = {} as never,
		result: ViewStateResult
	): Promise<void> {
		const newMasterId = state?.state?.masterId;
		const isWorkspaceRestore = newMasterId && newMasterId !== this.masterId;

		logger.debug("setState", {
			currentMasterId: this.masterId,
			newMasterId: newMasterId,
			isRestore: isWorkspaceRestore,
		});

		// 1. masterIdを復元
		if (newMasterId) {
			this.masterId = newMasterId;
		}

		// 2. ソースモードを切り替え
		// @ts-expect-error
		const editMode = this.wrapper.magicalEditor?.editMode;
		if (
			typeof state.source === "boolean" &&
			editMode?.sourceMode !== state.source
		) {
			editMode.toggleSource();
			state.layout = true;
		}

		// 3. contentを除外した状態で親クラスのsetStateを呼ぶ
		const { content, ...stateWithoutContent } = state as any;
		await super.setState(stateWithoutContent, result);

		// 4. ワークスペース復元時はIndexedDBからコンテンツを復元
		if (isWorkspaceRestore || !this.editor) {
			logger.debug(`コンテンツ復元をリクエスト: ${this.masterId}`);
			if (this.editor) {
				// エディタが準備済みなら即座に復元
				this.context.emitter.emit("request-content-restoration", {
					view: this,
					masterId: this.masterId,
				});
			} else {
				// エディタがまだない場合はフラグを立てる
				this.needsContentRestoration = true;
			}
		}
	}

	// ========================================
	// 保存処理
	// ========================================

	async save(): Promise<void> {
		// すでに保存中なら既存のPromiseを返す
		if (this.savingPromise) {
			logger.debug("保存処理は既に実行中です");
			return this.savingPromise;
		}

		const { promise, resolve, reject } = Promise.withResolvers<void>();
		this.savingPromise = promise;

		// 保存をリクエスト
		this.context.emitter.emit("save-requested", { view: this });

		// 保存結果を待つ
		this.context.emitter.once("save-result", (payload) => {
			if (payload.view === this) {
				logger.debug("保存完了", this.masterId);
				if (payload.success) {
					resolve();
				} else {
					reject();
				}
				this.savingPromise = null;
			}
		});

		return promise;
	}

	// ========================================
	// UI関連
	// ========================================

	public override getDisplayText(): string {
		const baseTitle = this.getBaseTitle();
		return this.hasUnsavedChanges ? `*${baseTitle}` : baseTitle;
	}

	public override onPaneMenu(menu: Menu, source: string) {
		// ファイルに変換
		menu.addItem((item) =>
			item
				.setTitle("Convert to file")
				.setIcon("file-pen-line")
				.onClick(async () => {
					await extractToFileInteraction(this);
				})
		);

		// コンテンツをクリア
		menu.addItem((item) =>
			item
				.setTitle("Clear content")
				.setIcon("trash")
				.setWarning(true)
				.onClick(() => {
					this.setContent("");
				})
		);

		super.onPaneMenu(menu, source);
	}

	public setContent(content: string) {
		if (this.editor && this.editor.getValue() !== content) {
			this.editor.setValue(content);
		}
	}

	// ========================================
	// イベントハンドラ
	// ========================================

	protected setupEventHandlers() {
		if (!this.editor) {
			logger.error("エディタが見つかりません");
			return;
		}

		// リーフがアクティブになったらエディタにフォーカス
		const leafHandler = (payload: any) => {
			// @ts-expect-error
			if (payload?.view?.leaf?.id === this.leaf.id) {
				this.editor?.focus();
			}
		};
		this.context.emitter.on("obsidian-active-leaf-changed", leafHandler);
		this.register(() => {
			this.context.emitter.off(
				"obsidian-active-leaf-changed",
				leafHandler
			);
		});

		// マウスイベント
		this.registerDomEvent(this.contentEl, "mousedown", (e) =>
			handleClick(e as PointerEvent, this.editor!)
		);

		this.registerDomEvent(this.contentEl, "contextmenu", (e) => {
			// @ts-expect-error
			const editMode = this.wrapper.magicalEditor?.editMode;
			if (editMode) {
				handleContextMenu(e as PointerEvent, editMode);
			}
		});
	}

	// ========================================
	// エラーハンドリング
	// ========================================

	private showError(error: unknown) {
		logger.error("エディタの初期化に失敗しました", error);
		this.contentEl.empty();
		this.contentEl.createEl("div", {
			text: "Error: Could not initialize editor. This might be due to an Obsidian update.",
			cls: "sandbox-error-message",
		});
	}
}

export type { Context as AbstractNoteViewContext };
