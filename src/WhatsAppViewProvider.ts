import * as vscode from 'vscode';
import { WhatsAppClient } from './whatsapp-client.js';

/**
 * @intervention IMPL-20260227-02
 * @see context/checkpoints/CHK_20260227_WAV2.md
 */
export class WhatsAppViewProvider implements vscode.WebviewViewProvider {

    public static readonly viewType = 'whatsapp-view';
    private _view?: vscode.WebviewView;
    private lastQrCode?: string;
    private isConnected: boolean = false;

    constructor(
        private readonly _extensionUri: vscode.Uri,
        private readonly _client: WhatsAppClient,
    ) {
        this._client.on('qr', (qr: string) => {
            this.lastQrCode = qr;
            this.updateHtml();
        });

        this._client.on('connected', () => {
            this.isConnected = true;
            this.lastQrCode = undefined;
            vscode.window.showInformationMessage('¡WhatsApp conectado con éxito!');
            this.updateHtml();
        });
    }

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

        this.updateHtml();
    }

    private updateHtml() {
        if (this._view) {
            this._view.webview.html = this._getHtmlForWebview(this._view.webview);
        }
    }

    private _getHtmlForWebview(webview: vscode.Webview) {
        let content = '';
        if (this.isConnected) {
            content = '<h1>¡Conectado!</h1><p>Pronto verás aquí tus chats.</p>';
        } else if (this.lastQrCode) {
            content = `
                <h2>Escanéame 👋</h2>
                <img src="${this.lastQrCode}" alt="WhatsApp QR Code" />
                <p>Usa WhatsApp en tu teléfono para escanear este código.</p>
            `;
        } else {
            content = '<h2>Cargando conexión...</h2>';
        }

        return `<!DOCTYPE html>
            <html lang="es">
            <head>
                <meta charset="UTF-8">
                <meta name="viewport" content="width=device-width, initial-scale=1.0">
                <title>WhatsApp Web Native</title>
                <style>
                    body {
                        font-family: var(--vscode-font-family);
                        color: var(--vscode-foreground);
                        display: flex;
                        flex-direction: column;
                        align-items: center;
                        justify-content: center;
                        height: 100vh;
                        margin: 0;
                        padding: 20px;
                        text-align: center;
                    }
                    img {
                        background: white;
                        padding: 10px;
                        border-radius: 8px;
                        max-width: 80%;
                        height: auto;
                    }
                    h1, h2, p { margin-bottom: 20px; }
                </style>
            </head>
            <body>
                ${content}
            </body>
            </html>`;
    }
}
