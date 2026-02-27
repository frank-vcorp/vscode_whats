"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.WhatsAppViewProvider = void 0;
/**
 * @intervention IMPL-20260227-01
 * @see context/checkpoints/CHK_20260227_SCX.md
 */
class WhatsAppViewProvider {
    _extensionUri;
    static viewType = 'whatsapp-view';
    _view;
    constructor(_extensionUri) {
        this._extensionUri = _extensionUri;
    }
    resolveWebviewView(webviewView, context, _token) {
        this._view = webviewView;
        webviewView.webview.options = {
            enableScripts: true,
            localResourceRoots: [
                this._extensionUri
            ]
        };
        webviewView.webview.html = this._getHtmlForWebview(webviewView.webview);
    }
    _getHtmlForWebview(webview) {
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
exports.WhatsAppViewProvider = WhatsAppViewProvider;
//# sourceMappingURL=WhatsAppViewProvider.js.map