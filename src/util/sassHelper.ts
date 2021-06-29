import { renderSync, Result } from "sass";

export function compileSassText(text: string): Result | Error {
	try {
		return renderSync({
			data: text,
			file: "module.scss",
			outFile: "module.css",
			indentWidth: 4,
			sourceMap: true,
			omitSourceMapUrl: true,
		});
	} catch (e) {
		return e;
	}
}

export function getCssFileName(file: string) {
	let pos = file.lastIndexOf(".");
	return file.substr(0, pos < 0 ? file.length : pos) + ".css";
}
