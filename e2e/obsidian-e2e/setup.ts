import log from "loglevel";
import prefix from "loglevel-plugin-prefix";
import chalk from "chalk";

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
			nameStr
		)}`;
	},
});

// デフォルトレベルを設定
log.setDefaultLevel("trace");

console.log("✅ Log level set to 'trace' with prefix plugin.");
