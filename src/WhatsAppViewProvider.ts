import * as vscode from 'vscode';

/**
 * @intervention IMPL-20260227-01
 * @see context/checkpoints/CHK_20260227_SCX.md
 */
export class WhatsAppViewProvider implements vscode.WebviewViewProvider {

    public static readonly viewType = 'whatsapp-view';
    private _view?: vscode.WebviewView;

    constructor(
        private readonly _extensionUri: vscode.Uri,
    ) { }

    public resolveWebviewView(
        webviewView: vscode.WebviewView,
        context: vscode.WebviewViewResolveContext,
        _token: vscode.CancellationToken,
    ) {
        this._view = webviewView;

        webviewView.webview.options = {
            enableScripts: true,
            localResourceRoots: [
                this._extensionUri
            ]
        };

        webviewView.webview.html = this._getHtmlForWebview(webviewView.webview);
    }

    private _getHtmlForWebview(webview: vscode.Webview) {
        return `<!DOCTYPE html>
            <html lang="es">
            <head>
                <meta charset="UTF-8">
                <meta name="viewport" content="width=device-width, initial-scale=1.0">
                <title>WhatsApp Web</title>
                <style>
                    body, html {
                        margin: 0;
                        padding: 0;
                        height: 100%;
                        width: 100%;
                        overflow: hidden;
                    }
                    iframe {
                        border: none;
                        width: 100%;
                        height: 100%;
                    }
                </style>
            </head>
            <body>
                <iframe src="https://web.whatsapp.com" allow="camera; microphone" sandbox="allow-scripts allow-same-origin allow-forms allow-popups"></iframe>
            </body>
            </html>`;
    }
}
