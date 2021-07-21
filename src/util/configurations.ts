import { workspace } from "vscode";

const EXTENSION_NAME = "vscode-sassc";

interface SingleCompilation {
	useIndentedStyle: boolean;
}

export function isIndentedStyle(): boolean {
	return (workspace.getConfiguration(EXTENSION_NAME).get("singleCompilation") as SingleCompilation).useIndentedStyle;
}
