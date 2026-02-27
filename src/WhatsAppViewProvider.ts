import * as vscode from 'vscode';
import * as fs from 'fs';
import { WhatsAppClient } from './whatsapp-client.js';

/**
 * @intervention IMPL-20260227-05
 * @see context/checkpoints/CHK_20260227_NOTIFY_MEDIA.md
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

    public isVisible(): boolean {
        return this._view?.visible || false;
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
            const jid = data.jid || '123456789@s.whatsapp.net'; // Demo JID
            const historyPath = vscode.Uri.joinPath(this._extensionUri, 'context', 'whats_history.md').fsPath;

            switch (data.type) {
                case 'sendMessage':
                    try {
                        await this._client.sendMessage(jid, data.text);
                        this.addMessage('Yo', data.text);
                        
                        // Log a whats_history.md
                        const logEntry = `**[Yo]:** ${data.text}\n\n`;
                        fs.appendFileSync(historyPath, logEntry);
                    } catch (err: any) {
                        vscode.window.showErrorMessage('Error al enviar mensaje: ' + err.message);
                    }
                    break;
                case 'askCopilot':
                    vscode.commands.executeCommand('whatsapp.suggestWithCopilot', data.text);
                    break;
                case 'attachFile':
                    const options: vscode.OpenDialogOptions = {
                        canSelectMany: false,
                        openLabel: 'Enviar archivo',
                        filters: {
                            'Imágenes': ['png', 'jpg', 'jpeg'],
                            'Documentos': ['pdf', 'doc', 'docx', 'txt'],
                            'Todo': ['*']
                        }
                    };

                    const fileUri = await vscode.window.showOpenDialog(options);
                    if (fileUri && fileUri[0]) {
                        try {
                            const filePath = fileUri[0].fsPath;
                            const fileName = filePath.split(/[\\/]/).pop() || 'archivo';
                            const mimeType = this._getMimeType(filePath);

                            const buffer = await vscode.workspace.fs.readFile(fileUri[0]);
                            
                            if (mimeType.startsWith('image/')) {
                                await this._client.getSocket().sendMessage(jid, { 
                                    image: buffer, 
                                    caption: `Adjunto: ${fileName}`
                                });
                            } else {
                                await this._client.getSocket().sendMessage(jid, { 
                                    document: buffer,
                                    mimetype: mimeType,
                                    fileName: fileName
                                });
                            }

                            const logMsg = `[Archivo: ${fileName}]`;
                            this.addMessage('Yo', logMsg);
                            
                            // Log a whats_history.md
                            const logEntry = `**[Yo]:** ${logMsg}\n\n`;
                            fs.appendFileSync(historyPath, logEntry);

                        } catch (err: any) {
                            vscode.window.showErrorMessage('Error al enviar archivo: ' + err.message);
                        }
                    }
                    break;
            }
        });

        this.updateHtml();
    }

    private _getMimeType(filePath: string): string {
        const ext = filePath.split('.').pop()?.toLowerCase() || '';
        const mimeMap: { [key: string]: string } = {
            'png': 'image/png',
            'jpg': 'image/jpeg',
            'jpeg': 'image/jpeg',
            'pdf': 'application/pdf',
            'txt': 'text/plain',
            'doc': 'application/msword',
            'docx': 'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
        };
        return mimeMap[ext] || 'application/octet-stream';
    }

    private updateHtml() {
        if (this._view) {
            this._view.webview.html = this._getHtmlForWebview(this._view.webview);
        }
    }

    private _getHtmlForWebview(webview: vscode.Webview) {
        let content = '';
        
        // Cargar Toolkit de Webview
        const toolkitUri = webview.asWebviewUri(vscode.Uri.joinPath(this._extensionUri, 'node_modules', '@vscode', 'webview-ui-toolkit', 'dist', 'toolkit.min.js'));

        if (this.isConnected) {
            const messagesHtml = this.messages.map(m => `
                <div class="message ${m.sender === 'Yo' ? 'sent' : 'received'}">
                    <div class="message-header">
                        <span class="sender">${m.sender}</span>
                        ${m.sender !== 'Yo' ? `<span class="copilot-action" onclick="askCopilot('${m.text}')" title="Pedir ayuda a Copilot">🤖</span>` : ''}
                    </div>
                    <div class="text">${m.text}</div>
                </div>
            `).join('');

            content = `
                <div id="chat-container">
                    <div id="messages-list">
                        ${messagesHtml}
                    </div>
                    <vscode-divider></vscode-divider>
                    <div id="input-container">
                        <vscode-button id="clip-btn" appearance="icon" title="Adjuntar archivo">📎</vscode-button>
                        <vscode-text-field id="message-input" placeholder="Escribe un mensaje..." autofocus></vscode-text-field>
                        <vscode-button id="send-btn" appearance="primary">Enviar</vscode-button>
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
                <script type="module" src="${toolkitUri}"></script>
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
                        font-size: var(--vscode-font-size);
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
                        gap: 12px;
                        scrollbar-width: thin;
                        scrollbar-color: var(--vscode-scrollbarSlider-background) transparent;
                    }
                    .message {
                        padding: 8px 12px;
                        border-radius: 4px;
                        max-width: 90%;
                        font-size: 0.95em;
                        line-height: 1.5;
                        position: relative;
                        box-shadow: 0 1px 2px rgba(0,0,0,0.1);
                    }
                    .message.received {
                        align-self: flex-start;
                        background: var(--vscode-sideBar-background);
                        border: 1px solid var(--vscode-widget-border);
                        color: var(--vscode-sideBar-foreground);
                    }
                    .message.sent {
                        align-self: flex-end;
                        background: var(--vscode-selection-background);
                        color: var(--vscode-selection-foreground);
                        opacity: 0.9;
                    }
                    .message-header {
                        display: flex;
                        justify-content: space-between;
                        align-items: center;
                        margin-bottom: 4px;
                        gap: 8px;
                    }
                    .sender { 
                        font-weight: 600; 
                        font-size: 0.75em; 
                        color: var(--vscode-descriptionForeground);
                        text-transform: uppercase;
                        letter-spacing: 0.05em;
                    }

                    .copilot-action {
                        cursor: pointer;
                        font-size: 1.1em;
                        opacity: 0.6;
                        transition: opacity 0.2s, transform 0.2s;
                        display: flex;
                        align-items: center;
                        justify-content: center;
                        width: 20px;
                        height: 20px;
                    }
                    .copilot-action:hover {
                        opacity: 1;
                        transform: scale(1.2);
                    }
                    
                    #input-container {
                        padding: 12px;
                        display: flex;
                        gap: 8px;
                        background: var(--vscode-sideBar-background);
                        align-items: center;
                    }
                    vscode-text-field {
                        flex: 1;
                    }
                    vscode-button {
                        white-space: nowrap;
                    }
                </style>
            </head>
            <body>
                ${content}
                <script>
                    const vscode = acquireVsCodeApi();
                    const list = document.getElementById('messages-list');
                    const input = document.getElementById('message-input');
                    const btn = document.getElementById('send-btn');

                    const clipBtn = document.getElementById('clip-btn');

                    function askCopilot(text) {
                        vscode.postMessage({ type: 'askCopilot', text: text });
                    }

                    if (clipBtn) {
                        clipBtn.addEventListener('click', () => {
                            vscode.postMessage({ type: 'attachFile' });
                        });
                    }

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
                            
                            const header = document.createElement('div');
                            header.className = 'message-header';
                            
                            const senderSpan = document.createElement('span');
                            senderSpan.className = 'sender';
                            senderSpan.textContent = message.sender;
                            header.appendChild(senderSpan);
                            
                            if (message.sender !== 'Yo') {
                                const copilotSpan = document.createElement('span');
                                copilotSpan.className = 'copilot-action';
                                copilotSpan.textContent = '🤖';
                                copilotSpan.title = 'Pedir ayuda a Copilot';
                                copilotSpan.onclick = () => askCopilot(message.text);
                                header.appendChild(copilotSpan);
                            }
                            
                            const textDiv = document.createElement('div');
                            textDiv.className = 'text';
                            textDiv.textContent = message.text;
                            
                            div.appendChild(header);
                            div.appendChild(textDiv);

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
