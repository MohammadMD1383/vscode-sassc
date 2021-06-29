import { join } from "path";
import { ColorThemeKind, ExtensionContext, Uri, window } from "vscode";

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
