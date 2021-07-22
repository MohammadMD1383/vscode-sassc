import { isAbsolute, join, relative } from "path";
import { ColorThemeKind, commands, ExtensionContext, StatusBarItem, Uri, window, workspace } from "vscode";

export function getFileUri(context: ExtensionContext, path: string): Uri {
	return Uri.file(join(context.extensionPath, path));
}

export function getThemeName() {
	switch (window.activeColorTheme.kind) {
		case ColorThemeKind.Dark:
			return "github-dark";
		case ColorThemeKind.Light:
			return "github";
		case ColorThemeKind.HighContrast:
			return "base16/windows-high-contrast";
	}
}

export async function checkForSassConfig(statusBarItem?: StatusBarItem): Promise<boolean> {
	const contains = (await workspace.findFiles("**/sassconfig.json")).length > 0;
	if (contains) {
		commands.executeCommand("setContext", "vscode-sassc.isSassProject", true);
		statusBarItem?.show();
	} else {
		commands.executeCommand("setContext", "vscode-sassc.isSassProject", false);
		statusBarItem?.hide();
	}
	return contains;
}

/**
 * determines whether `path1` is sub directory of `path2` or not
 * @param path1 condition path
 * @param path2 main path
 * @returns boolean
 */
export function isSubDirOf(path1: string, path2: string): boolean {
	const path = relative(path2, path1);
	return !!path && !path.startsWith("..") && !isAbsolute(path);
}
