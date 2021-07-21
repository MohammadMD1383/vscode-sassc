import { existsSync, mkdirSync, writeFileSync } from "fs";
import { basename, dirname, isAbsolute, join, relative } from "path";
import { renderSync, Result, SassException } from "sass";
import { OutputChannel, window } from "vscode";
import { isIndentedStyle } from "./configurations";

export function compileSassText(text: string): Result | Error {
	try {
		return renderSync({
			data: text,
			file: "module.scss",
			outFile: "module.css",
			indentWidth: 4,
			sourceMap: true,
			omitSourceMapUrl: true,
			indentedSyntax: isIndentedStyle(),
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

export async function compileProject(files: string[], config: SassConfig, root: string) {
	// @ts-ignore
	const _this = compileProject as { outputChannel: OutputChannel };
	if (typeof _this.outputChannel === "undefined") {
		_this.outputChannel = window.createOutputChannel(`Sass Compile Errors`);
	}

	files = files.filter((file: string) => !basename(file).startsWith("_"));

	const promises: Array<Promise<void>> = [];
	files.forEach((file: string) => {
		const isIndentedSyntax = file.endsWith(".sass");
		let outFile = getCssFileName(file);

		if (config.outDir) {
			if (isAbsolute(config.outDir)) outFile = join(config.outDir, relative(root, outFile));
			else outFile = join(root, config.outDir, relative(root, outFile));
		}

		promises.push(
			(async function () {
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

					const outFolder = dirname(outFile);
					if (!existsSync(outFolder)) mkdirSync(outFolder, { recursive: true });

					writeFileSync(outFile, compiledCode.css, { encoding: "utf8" });
					if (config.sourceMaps) {
						writeFileSync(`${outFile}.map`, compiledCode.map!, { encoding: "utf8" });
					}

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
