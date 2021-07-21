import * as vscode from "vscode";
import * as path from "path";
import * as fs from "fs";
import * as sm from "source-map";
import { checkForSassConfig, getFileUri, getThemeName } from "./util/util";
import { compileProject, compileSassText, getCssFileName } from "./util/sassHelper";

export function activate(context: vscode.ExtensionContext) {
	if (vscode.workspace.name) {
		const statusBarItem = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Left, 4);
		statusBarItem.command = "vscode-sassc.compileProject";
		statusBarItem.text = "$(zap) Compile Project";
		statusBarItem.tooltip = "SASS/SCSS";
		context.subscriptions.push(statusBarItem);

		checkForSassConfig(statusBarItem);

		const createFileListener = vscode.workspace.onDidCreateFiles(() => {
			checkForSassConfig(statusBarItem);
		});

		const deleteFileListener = vscode.workspace.onDidDeleteFiles(() => {
			checkForSassConfig(statusBarItem);
		});

		const renameFileListener = vscode.workspace.onDidRenameFiles(() => {
			checkForSassConfig(statusBarItem);
		});
	}

	context.subscriptions.push(
		vscode.commands.registerCommand("vscode-sassc.singleCompilationCompileCurrentFile", async () => {
			const items: Array<vscode.QuickPickItem> = [
				{ label: "Live View", detail: "View and navigate compiled css as you edit" },
				{ label: "Compile To Output", detail: "Compile to vscode output channel" },
				{ label: "Compile Across Current File", detail: "Compile and save next to current file" },
				{ label: "Compile To File...", detail: "Compile and save it anywhere of your choice" },
			];

			const selection = await vscode.window.showQuickPick(items, {
				canPickMany: false,
				placeHolder: "Choose how to compile",
				title: "Compile Current File",
			});
			if (!selection) return;

			const isUntitled = vscode.window.activeTextEditor!.document.isUntitled;
			let fileName: string;
			if (isUntitled) fileName = vscode.window.activeTextEditor!.document.fileName;
			else fileName = path.basename(vscode.window.activeTextEditor!.document.fileName);

			switch (selection.label) {
				case items[0].label: // live view
					const liveViewWebView = vscode.window.createWebviewPanel(
						"css-live-view",
						`LiveView: ${fileName}`,
						{ viewColumn: vscode.ViewColumn.Beside, preserveFocus: false },
						{ enableScripts: true }
					);

					const htmlFilePath = getFileUri(context, "res/html/LiveView.html").fsPath;
					const script1FilePath = liveViewWebView.webview.asWebviewUri(getFileUri(context, "res/dist/highlight.min.js"));
					const script2FilePath = liveViewWebView.webview.asWebviewUri(getFileUri(context, "res/dist/css.min.js"));
					const styleFilePath = liveViewWebView.webview.asWebviewUri(getFileUri(context, `res/dist/styles/${getThemeName()}.min.css`));

					let htmlFileContent = fs.readFileSync(htmlFilePath).toString();
					htmlFileContent = htmlFileContent.replace("{{style}}", styleFilePath.toString());
					htmlFileContent = htmlFileContent.replace("{{script1}}", script1FilePath.toString());
					htmlFileContent = htmlFileContent.replace("{{script2}}", script2FilePath.toString());

					liveViewWebView.webview.html = htmlFileContent;

					let compiledCode = compileSassText(vscode.window.activeTextEditor!.document.getText());

					liveViewWebView.webview.postMessage({
						kind: "code",
						code: compiledCode instanceof Error ? compiledCode.message : compiledCode.css.toString(),
					});

					const documentChangeListener = vscode.workspace.onDidChangeTextDocument((event) => {
						if (event.document !== vscode.window.activeTextEditor?.document) {
							liveViewWebView.dispose();
							return;
						}

						compiledCode = compileSassText(event.document.getText());

						try {
							liveViewWebView.webview.postMessage({
								kind: "code",
								code: compiledCode instanceof Error ? compiledCode.message : compiledCode.css.toString(),
							});
						} catch {
							documentChangeListener.dispose();
						}
					});

					const cursorChangeListener = vscode.window.onDidChangeTextEditorSelection(async (event) => {
						if (event.textEditor.document !== vscode.window.activeTextEditor?.document) {
							liveViewWebView.dispose();
							return;
						}

						if (compiledCode instanceof Error) return;

						const mapping = await sm.SourceMapConsumer.with(compiledCode.map!.toString(), null, (consumer) => {
							return consumer.generatedPositionFor({
								source: consumer.sources[0],
								line: event.textEditor.selection.active.line + 1,
								column: event.textEditor.selection.active.character,
							});
						});

						try {
							liveViewWebView.webview.postMessage({
								kind: "highlight",
								highlight: mapping,
							});
						} catch {
							cursorChangeListener.dispose();
						}
					});
					break;

				case items[1].label: //	compile to output
					vscode.window.withProgress(
						{
							location: vscode.ProgressLocation.Notification,
							cancellable: false,
							title: "Compiling...",
						},
						() => {
							const outputChannel = vscode.window.createOutputChannel(`SASSC: ${fileName}`);
							const compileOutput = compileSassText(vscode.window.activeTextEditor!.document.getText());
							outputChannel.append(compileOutput instanceof Error ? compileOutput.message : compileOutput.css.toString());
							outputChannel.show();
							return Promise.resolve();
						}
					);
					break;

				case items[2].label: // compile across
					if (isUntitled) {
						vscode.window.showWarningMessage("Please save this file before using this action.");
						return;
					}

					vscode.window.withProgress(
						{
							location: vscode.ProgressLocation.Notification,
							cancellable: false,
							title: "Compiling...",
						},
						async () => {
							if (vscode.window.activeTextEditor!.document.isDirty) await vscode.window.activeTextEditor!.document.save();

							const compiledCode = compileSassText(vscode.window.activeTextEditor!.document.getText());

							const newFilePath = path.join(
								path.dirname(vscode.window.activeTextEditor!.document.fileName),
								getCssFileName(fileName)
							);
							fs.writeFileSync(newFilePath, compiledCode instanceof Error ? compiledCode.message : compiledCode.css);

							return Promise.resolve();
						}
					);
					break;

				case items[3].label: // compile to file
					const dest = await vscode.window.showSaveDialog({ title: "Compile To File...", filters: { css: ["css"] } });
					if (!dest) return;

					vscode.window.withProgress(
						{
							location: vscode.ProgressLocation.Notification,
							cancellable: false,
							title: "Compiling...",
						},
						() => {
							const compiledCode = compileSassText(vscode.window.activeTextEditor!.document.getText());
							fs.writeFileSync(dest.fsPath, compiledCode instanceof Error ? compiledCode.message : compiledCode.css);

							return Promise.resolve();
						}
					);
					break;
			}
		}),

		vscode.commands.registerCommand("vscode-sassc.compileProject", async () => {
			// find all tsconfig files in project
			const sassConfigFiles = (await vscode.workspace.findFiles("**/sassconfig.json")).map((uri) => {
				return uri.fsPath;
			});
			let sassConfigPath: string;

			// let user choose which one to compile
			if (sassConfigFiles.length > 1) {
				const items: Array<vscode.QuickPickItem> = sassConfigFiles.map((item, i) => {
					return {
						label: path.relative(vscode.workspace.workspaceFolders![0].uri.fsPath, item),
						description: i.toString(),
						detail: item,
					};
				});

				const selection = await vscode.window.showQuickPick(items, {
					canPickMany: false,
					title: "Compile Project",
					placeHolder: "Choose sassconfig root",
				});
				if (!selection) return;

				sassConfigPath = sassConfigFiles[+selection.description!];
			}
			// else is always `1`. because the availability of this command is to exist at least one sassconfig file
			else {
				sassConfigPath = sassConfigFiles[0];
			}

			vscode.window.withProgress(
				{
					location: vscode.ProgressLocation.Notification,
					cancellable: false,
				},
				async (progress) => {
					progress.report({ message: "Compiling...", increment: 33 });
					const sassSearchLocation = path.relative(
						vscode.workspace.workspaceFolders![0].uri.fsPath,
						path.join(path.dirname(sassConfigPath), "**/*.{sass,scss}")
					);
					const sassFiles = (await vscode.workspace.findFiles(sassSearchLocation)).map((uri) => {
						return uri.fsPath;
					});

					const sassConfig = JSON.parse(fs.readFileSync(sassConfigPath).toString());

					progress.report({ increment: 33 });
					await compileProject(sassFiles, sassConfig, path.dirname(sassConfigPath));

					progress.report({ message: "Done!", increment: 34 });
					return new Promise<void>((resolve) => {
						setTimeout(() => {
							resolve();
						}, 1000);
					});
				}
			);
		}),

		vscode.commands.registerCommand("vscode-sassc.watchProject", () => {
			vscode.window.showInformationMessage("Hello :)");
		})
	);
}

export function deactivate() {}
