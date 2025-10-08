import en from "./en.json";

const translations: Record<string, any> = {
	en,
};

let currentLanguage = "en";

export function setLanguage(lang: string) {
	currentLanguage = lang;
}

/**
 * Get translation by key path with optional parameter substitution
 * @param keyPath - Dot-separated path to translation key (e.g., "settings.appearance.firstLineAsTitle.name")
 * @param params - Optional parameters for string interpolation
 */
export function t(
	keyPath: string,
	params?: Record<string, string | number>,
): string {
	const lang = translations[currentLanguage] || translations.en;
	const value = getNestedValue(lang, keyPath);

	if (value && typeof value === "string") {
		return interpolateParams(value, params);
	}

	// Fallback to English if not found in current language
	if (currentLanguage !== "en") {
		const fallbackValue = getNestedValue(translations.en, keyPath);
		if (fallbackValue && typeof fallbackValue === "string") {
			return interpolateParams(fallbackValue, params);
		}
	}

	// Return the key path if no translation found
	return keyPath;
}

/**
 * Get nested value from object using dot notation
 */
function getNestedValue(obj: any, path: string): any {
	return path.split(".").reduce((current, key) => {
		return current && current[key] !== undefined ? current[key] : undefined;
	}, obj);
}

/**
 * Replace {{param}} placeholders with actual values
 */
function interpolateParams(
	text: string,
	params?: Record<string, string | number>,
): string {
	if (!params) return text;

	return text.replace(/\{\{(\w+)\}\}/g, (match, key) => {
		return params[key] !== undefined ? String(params[key]) : match;
	});
}
