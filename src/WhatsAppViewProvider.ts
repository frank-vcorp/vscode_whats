import * as vscode from 'vscode';
import { WhatsAppClient } from './whatsapp-client.js';

/**
 * @intervention IMPL-20260227-03
 * @see context/checkpoints/CHK_20260227_CHAT_UI.md
 */
export class WhatsAppViewProvider implements vscode.WebviewViewProvider {

    public static readonly viewType = 'whatsapp-view';
    private _view?: vscode.WebviewView;
    private lastQrCode?: string;
    private isConnected: boolean = false;
    private messages: { sender: string, text: string }[] = [];

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

    public addMessage(sender: string, text: string) {
        this.messages.push({ sender, text });
        if (this.messages.length > 50) this.messages.shift();
        
        if (this._view) {
            this._view.webview.postMessage({ type: 'addMessage', sender, text });
        }
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

        webviewView.webview.onDidReceiveMessage(async (data) => {
            switch (data.type) {
                case 'sendMessage':
                    try {
                        const jid = data.jid || '123456789@s.whatsapp.net'; // Demo JID
                        await this._client.sendMessage(jid, data.text);
                        this.addMessage('Yo', data.text);
                    } catch (err: any) {
                        vscode.window.showErrorMessage('Error al enviar mensaje: ' + err.message);
                    }
                    break;
            }
        });

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
            const messagesHtml = this.messages.map(m => `
                <div class="message ${m.sender === 'Yo' ? 'sent' : 'received'}">
                    <div class="sender">${m.sender}</div>
                    <div class="text">${m.text}</div>
                </div>
            `).join('');

            content = `
                <div id="chat-container">
                    <div id="messages-list">
                        ${messagesHtml}
                    </div>
                    <div id="input-container">
                        <input type="text" id="message-input" placeholder="Escribe un mensaje..." />
                        <button id="send-btn">Enviar</button>
                    </div>
                </div>
            `;
        } else if (this.lastQrCode) {
            content = `
                <div class="qr-container">
                    <h2>Escanéame 👋</h2>
                    <img src="${this.lastQrCode}" alt="WhatsApp QR Code" />
                    <p>Usa WhatsApp en tu teléfono para escanear este código.</p>
                </div>
            `;
        } else {
            content = '<div class="loader"><h2>Cargando conexión...</h2><p>Iniciando socket...</p></div>';
        }

        return `<!DOCTYPE html>
            <html lang="es">
            <head>
                <meta charset="UTF-8">
                <meta name="viewport" content="width=device-width, initial-scale=1.0">
                <style>
                    body {
                        font-family: var(--vscode-font-family);
                        color: var(--vscode-foreground);
                        margin: 0;
                        padding: 0;
                        height: 100vh;
                        display: flex;
                        flex-direction: column;
                        overflow: hidden;
                    }

                    .qr-container, .loader {
                        padding: 20px;
                        text-align: center;
                    }
                    img { background: white; padding: 10px; border-radius: 8px; max-width: 80%; }

                    #chat-container {
                        display: flex;
                        flex-direction: column;
                        height: 100%;
                    }
                    #messages-list {
                        flex: 1;
                        overflow-y: auto;
                        padding: 10px;
                        display: flex;
                        flex-direction: column;
                        gap: 8px;
                    }
                    .message {
                        padding: 8px 12px;
                        border-radius: 6px;
                        max-width: 85%;
                        font-size: 0.9em;
                        line-height: 1.4;
                    }
                    .message.received {
                        align-self: flex-start;
                        background: var(--vscode-sideBar-background);
                        border: 1px solid var(--vscode-widget-border);
                    }
                    .message.sent {
                        align-self: flex-end;
                        background: var(--vscode-button-background);
                        color: var(--vscode-button-foreground);
                    }
                    .sender { font-weight: bold; font-size: 0.8em; margin-bottom: 2px; }
                    
                    #input-container {
                        padding: 10px;
                        display: flex;
                        gap: 5px;
                        background: var(--vscode-sideBar-background);
                        border-top: 1px solid var(--vscode-widget-border);
                    }
                    #message-input {
                        flex: 1;
                        background: var(--vscode-input-background);
                        color: var(--vscode-input-foreground);
                        border: 1px solid var(--vscode-input-border);
                        padding: 4px 8px;
                        border-radius: 2px;
                    }
                    #message-input:focus { border-color: var(--vscode-focusBorder); outline: none; }
                    #send-btn {
                        background: var(--vscode-button-background);
                        color: var(--vscode-button-foreground);
                        border: none;
                        padding: 4px 12px;
                        cursor: pointer;
                        border-radius: 2px;
                    }
                    #send-btn:hover { background: var(--vscode-button-hoverBackground); }
                </style>
            </head>
            <body>
                ${content}
                <script>
                    const vscode = acquireVsCodeApi();
                    const list = document.getElementById('messages-list');
                    const input = document.getElementById('message-input');
                    const btn = document.getElementById('send-btn');

                    if (btn) {
                        btn.addEventListener('click', () => {
                            const text = input.value;
                            if (text) {
                                vscode.postMessage({ type: 'sendMessage', text: text });
                                input.value = '';
                            }
                        });
                        input.addEventListener('keypress', (e) => {
                            if (e.key === 'Enter') btn.click();
                        });
                    }

                    window.addEventListener('message', event => {
                        const message = event.data;
                        if (message.type === 'addMessage') {
                            const div = document.createElement('div');
                            div.className = 'message ' + (message.sender === 'Yo' ? 'sent' : 'received');
                            div.innerHTML = \`<div class="sender">\${message.sender}</div><div class="text">\${message.text}</div>\`;
                            if (list) {
                                list.appendChild(div);
                                list.scrollTop = list.scrollHeight;
                            }
                        }
                    });
                    
                    if (list) list.scrollTop = list.scrollHeight;
                </script>
            </body>
            </html>`;
    }
}
