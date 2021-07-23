import { existsSync, mkdirSync, writeFileSync } from "fs";
import { basename, dirname, isAbsolute, join, relative } from "path";
import { renderSync, Result } from "sass";
import { Disposable, OutputChannel, TextDocument, window, workspace } from "vscode";
import { isSubDirOf } from "./util";

export function compileSassText(text: string, isIndentedSyntax: boolean): Result | Error {
	try {
		return renderSync({
			data: text,
			file: "module.scss",
			outFile: "module.css",
			indentWidth: 4,
			sourceMap: true,
			omitSourceMapUrl: true,
			indentedSyntax: isIndentedSyntax,
		});
	} catch (e) {
		return e;
	}
}

export function getCssFileName(file: string) {
	let pos = file.lastIndexOf(".");
	return file.substr(0, pos < 0 ? file.length : pos) + ".css";
}

interface SassConfig {
	outDir?: string;
	removeComments?: boolean;
	sourceMaps?: boolean;
	indentType?: "space" | "tab";
	indentWidth?: number;
	linefeed?: "cr" | "crlf" | "lf" | "lfcr";
	omitSourceMapUrl?: boolean;
	outputStyle?: "expanded" | "compressed";
}

function compileAndSaveFile(root: string, file: string, config: SassConfig, saveError: boolean = false) {
	const isIndentedSyntax = file.endsWith(".sass");
	let outFile = getCssFileName(file);
	if (config.outDir) {
		if (isAbsolute(config.outDir)) outFile = join(config.outDir, relative(root, outFile));
		else outFile = join(root, config.outDir, relative(root, outFile));
	}

	const outFolder = dirname(outFile);
	if (!existsSync(outFolder)) mkdirSync(outFolder, { recursive: true });

	try {
		const compiledCode = renderSync({
			file: file,
			outFile: outFile,
			indentType: config.indentType,
			indentWidth: config.indentWidth,
			indentedSyntax: isIndentedSyntax,
			linefeed: config.linefeed,
			omitSourceMapUrl: config.omitSourceMapUrl,
			outputStyle: config.outputStyle,
			sourceMap: config.sourceMaps,
		});

		writeFileSync(outFile, compiledCode.css, { encoding: "utf8" });
		if (config.sourceMaps) {
			writeFileSync(`${outFile}.map`, compiledCode.map!, { encoding: "utf8" });
		}
	} catch (error) {
		if (!saveError) throw error;
		writeFileSync(outFile, error.message);
	}
}

export async function compileProject(files: string[], config: SassConfig, root: string) {
	// @ts-ignore
	const _this = compileProject as { outputChannel: OutputChannel };
	if (typeof _this.outputChannel === "undefined") {
		_this.outputChannel = window.createOutputChannel(`Sass Compile Errors`);
	}

	files = files.filter((file: string) => !basename(file).startsWith("_"));

	const promises: Array<Promise<void>> = [];
	files.forEach((file: string) => {
		promises.push(
			(async function () {
				try {
					compileAndSaveFile(root, file, config);
					return Promise.resolve();
				} catch (error) {
					_this.outputChannel.appendLine(error.message);
					_this.outputChannel.show();
					return Promise.resolve();
				}
			})()
		);
	});

	await Promise.all(promises);
}

const watches: { [key: string]: Disposable } = {};

export async function watchProject(configPath: string, config: SassConfig) {
	if (Object.keys(watches).includes(configPath)) return;

	const root = dirname(configPath);

	(await workspace.findFiles(join(relative(workspace.workspaceFolders![0].uri.fsPath, root), "**/*.{sass,scss}")))
		.map((uri) => uri.fsPath)
		.filter((file) => !basename(file).startsWith("_"))
		.forEach((file) => {
			compileAndSaveFile(root, file, config, true);
		});

	watches[configPath] = workspace.onDidSaveTextDocument((document: TextDocument) => {
		const file = document.fileName;
		if (!isSubDirOf(file, root) || basename(file).endsWith("_")) return;
		compileAndSaveFile(root, file, config, true);
	});
}

export function getActiveWatches() {
	return Object.keys(watches);
}

export function destroyWatch(watchConfigPath: string) {
	if (!Object.keys(watches).includes(watchConfigPath)) return;

	watches[watchConfigPath].dispose();
	delete watches[watchConfigPath];
}
