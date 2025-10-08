import chalk from "chalk";
import log from "loglevel";
import prefix from "loglevel-plugin-prefix";
import { Notice } from "obsidian"; // ObsidianのAPIからNoticeクラスをインポート
import { t } from "../i18n";

const originalFactory = log.methodFactory;

const obsidianNoticeMethodFactory: log.MethodFactory = (
	methodName,
	logLevel,
	loggerName,
) => {
	const rawMethod = originalFactory(methodName, logLevel, loggerName);

	return (...args) => {
		if (logLevel === log.levels.ERROR) {
			const errorMessage = args[0]?.toString() || t("notices.unknownError");
			new Notice(errorMessage);
		}
		rawMethod.apply(null, args);
	};
};

export function overwriteLogLevel() {
	log.methodFactory = obsidianNoticeMethodFactory;
}

// 色の設定
const colors = {
	TRACE: chalk.magenta,
	DEBUG: chalk.cyan,
	INFO: chalk.blue,
	WARN: chalk.yellow,
	ERROR: chalk.red,
};

// prefix プラグインを適用
prefix.reg(log);

prefix.apply(log, {
	format(level, name, timestamp) {
		const color =
			colors[level.toUpperCase() as keyof typeof colors] || chalk.white;
		const nameStr = name ? `[${name}]` : "";
		return `${chalk.gray(`[${timestamp}]`)} ${color(level)} ${chalk.green(
			nameStr,
		)}`;
	},
});
