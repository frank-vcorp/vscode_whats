"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
Object.defineProperty(exports, "__esModule", { value: true });
exports.WhatsAppViewProvider = void 0;
const vscode = __importStar(require("vscode"));
const fs = __importStar(require("fs"));
/**
 * @intervention IMPL-20260227-07
 * @see context/checkpoints/CHK_20260227_STATUSBAR.md
 */
class WhatsAppViewProvider {
    _context;
    _client;
    static viewType = 'whatsapp-view';
    _view;
    lastQrCode;
    isConnected = false;
    // Evento de visibilidad
    _onDidChangeVisibility = new vscode.EventEmitter();
    onDidChangeVisibility = this._onDidChangeVisibility.event;
    // Estado de la UI
    currentView = 'list';
    activeChatJid;
    chats = []; // Cache de lista de chats
    messagesCache = new Map();
    _extensionUri;
    constructor(_context, _client) {
        this._context = _context;
        this._client = _client;
        this._extensionUri = _context.extensionUri;
        this._client.on('qr', (qr) => {
            this.lastQrCode = qr;
            this.updateHtml();
        });
        this._client.on('connected', () => {
            this.isConnected = true;
            this.lastQrCode = undefined;
            vscode.window.showInformationMessage('¡WhatsApp conectado con éxito!');
            this.updateHtml();
            // Cargar chats iniciales
            this.chats = this._client.getChats();
            this.updateHtml();
        });
        this._client.on('chats.update', (updatedChats) => {
            this.chats = updatedChats;
            if (this.currentView === 'list') {
                this.updateHtml();
            }
        });
        this._client.on('message', (msg) => {
            const jid = msg.key.remoteJid;
            const text = msg.message?.conversation ||
                msg.message?.extendedTextMessage?.text ||
                msg.message?.imageMessage?.caption ||
                (msg.message?.imageMessage ? '[Imagen]' : undefined);
            if (jid && text) {
                const isMe = msg.key.fromMe;
                const sender = isMe ? 'Yo' : (msg.pushName || jid.split('@')[0]); // Nombre simple
                this.addMessageToCache(jid, sender, text);
                // Si estamos viendo este chat, actualizar
                if (this.currentView === 'chat' && this.activeChatJid === jid) {
                    if (this._view) {
                        this._view.webview.postMessage({
                            type: 'addMessage',
                            sender,
                            text,
                            isSales: this.isSalesOpportunity(text)
                        });
                    }
                }
            }
        });
    }
    isSalesOpportunity(text) {
        const salesRegex = /\b(cotiz|precio|costo|cuanto|valor|desarrollo|app|web)\b/i;
        return salesRegex.test(text);
    }
    addMessageToCache(jid, sender, text) {
        if (!this.messagesCache.has(jid)) {
            this.messagesCache.set(jid, []);
        }
        const chatMsgs = this.messagesCache.get(jid);
        chatMsgs.push({
            sender,
            text,
            isSales: this.isSalesOpportunity(text)
        });
        if (chatMsgs.length > 50)
            chatMsgs.shift();
    }
    isVisible() {
        return this._view?.visible || false;
    }
    resolveWebviewView(webviewView, context, _token) {
        this._view = webviewView;
        // Notificar cambios de visibilidad
        webviewView.onDidChangeVisibility(() => {
            this._onDidChangeVisibility.fire(webviewView.visible);
        });
        webviewView.webview.options = {
            enableScripts: true,
            localResourceRoots: [
                this._extensionUri
            ]
        };
        webviewView.webview.onDidReceiveMessage(async (data) => {
            const jid = this.activeChatJid || 'unknown'; // JID actual
            // --- FIX: SEC-002 - Usar globalStorageUri ---
            const storageDir = this._context.globalStorageUri;
            if (!fs.existsSync(storageDir.fsPath)) {
                fs.mkdirSync(storageDir.fsPath, { recursive: true });
            }
            const historyPath = vscode.Uri.joinPath(storageDir, 'whats_history.md').fsPath;
            // ----------------------------------------------
            switch (data.type) {
                case 'selectChat':
                    this.activeChatJid = data.jid;
                    this.currentView = 'chat';
                    this.updateHtml();
                    break;
                case 'backToList':
                    this.currentView = 'list';
                    this.activeChatJid = undefined;
                    this.updateHtml();
                    break;
                case 'sendMessage':
                    if (!this.activeChatJid)
                        return;
                    try {
                        await this._client.sendMessage(this.activeChatJid, data.text);
                        this.addMessageToCache(this.activeChatJid, 'Yo', data.text);
                        // Renderizado local optimista ya manejado por postMessage si se quiere, 
                        // pero aquí esperamos el evento del cliente o forzamos update
                        this.updateHtml(); // Redibujar simple por ahora
                        // Log a whats_history.md
                        const logEntry = `**[Yo -> ${this.activeChatJid}]:** ${data.text}\n\n`;
                        fs.appendFileSync(historyPath, logEntry);
                    }
                    catch (err) {
                        vscode.window.showErrorMessage('Error al enviar mensaje: ' + err.message);
                    }
                    break;
                case 'askCopilot':
                    // Si es venta, el prompt puede ser más específico
                    const prompt = data.isSales
                        ? `Genera una respuesta profesional de VENTAS para este mensaje de cliente: "${data.text}". El objetivo es cerrar una reunión o enviar una cotización.`
                        : `Responde a este mensaje de WhatsApp: "${data.text}"`;
                    vscode.window.showInformationMessage('Consultando a Copilot Sales Agent... 💰');
                    vscode.commands.executeCommand('whatsapp.suggestWithCopilot', prompt);
                    break;
                case 'attachFile':
                    if (!this.activeChatJid)
                        return;
                    const options = {
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
                            const sock = this._client.getSocket();
                            if (!sock)
                                throw new Error('No conectado');
                            if (mimeType.startsWith('image/')) {
                                await sock.sendMessage(this.activeChatJid, {
                                    image: buffer,
                                    caption: `Adjunto: ${fileName}`
                                });
                            }
                            else {
                                await sock.sendMessage(this.activeChatJid, {
                                    document: buffer,
                                    mimetype: mimeType,
                                    fileName: fileName
                                });
                            }
                            const logMsg = `[Archivo: ${fileName}]`;
                            this.addMessageToCache(this.activeChatJid, 'Yo', logMsg);
                            this.updateHtml();
                            fs.appendFileSync(historyPath, `**[Yo -> ${this.activeChatJid}]:** ${logMsg}\n\n`);
                        }
                        catch (err) {
                            vscode.window.showErrorMessage('Error al enviar archivo: ' + err.message);
                        }
                    }
                    break;
            }
        });
        this.updateHtml();
    }
    _getMimeType(filePath) {
        const ext = filePath.split('.').pop()?.toLowerCase() || '';
        const mimeMap = {
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
    updateHtml() {
        if (this._view) {
            this._view.webview.html = this._getHtmlForWebview(this._view.webview);
        }
    }
    _getHtmlForWebview(webview) {
        const toolkitUri = webview.asWebviewUri(vscode.Uri.joinPath(this._extensionUri, 'node_modules', '@vscode', 'webview-ui-toolkit', 'dist', 'toolkit.min.js'));
        let content = '';
        if (!this.isConnected) {
            if (this.lastQrCode) {
                content = `
                    <div class="qr-container">
                        <h2>Escanéame 👋</h2>
                        <img src="${this.lastQrCode}" alt="WhatsApp QR Code" />
                        <p>Usa WhatsApp en tu teléfono para escanear este código.</p>
                    </div>`;
            }
            else {
                content = '<div class="loader"><h2>Cargando conexión...</h2><p>Iniciando socket...</p></div>';
            }
        }
        else {
            // Lógica de Vistas
            if (this.currentView === 'list') {
                content = this._renderChatList();
            }
            else {
                content = this._renderConversation();
            }
        }
        return `<!DOCTYPE html>
            <html lang="es">
            <head>
                <meta charset="UTF-8">
                <!-- FIX: SEC-001 - CSP segura -->
                <meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src ${webview.cspSource} 'unsafe-inline'; script-src ${webview.cspSource} 'unsafe-inline'; img-src ${webview.cspSource} https: data:;">
                <!-- ------------------------ -->
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

                    /* Common */
                    .qr-container, .loader { padding: 20px; text-align: center; }
                    img { background: white; padding: 10px; border-radius: 8px; max-width: 80%; }
                    
                    /* Chat List */
                    #chat-list {
                        overflow-y: auto;
                        height: 100%;
                    }
                    .chat-item {
                        padding: 10px 15px;
                        border-bottom: 1px solid var(--vscode-widget-border);
                        cursor: pointer;
                        display: flex;
                        flex-direction: column;
                        gap: 4px;
                    }
                    .chat-item:hover {
                        background: var(--vscode-list-hoverBackground);
                    }
                    .chat-header {
                        display: flex;
                        justify-content: space-between;
                        font-weight: bold;
                    }
                    .chat-preview {
                        font-size: 0.9em;
                        color: var(--vscode-descriptionForeground);
                        white-space: nowrap;
                        overflow: hidden;
                        text-overflow: ellipsis;
                    }

                    /* Conversation */
                    #chat-container { display: flex; flex-direction: column; height: 100%; }
                    #chat-header-bar {
                        padding: 10px;
                        border-bottom: 1px solid var(--vscode-widget-border);
                        display: flex;
                        align-items: center;
                        gap: 10px;
                        background: var(--vscode-editor-background);
                    }
                    #messages-list {
                        flex: 1;
                        overflow-y: auto;
                        padding: 10px;
                        display: flex;
                        flex-direction: column;
                        gap: 12px;
                    }
                    .message {
                        padding: 8px 12px;
                        border-radius: 4px;
                        max-width: 90%;
                        font-size: 0.95em;
                        position: relative;
                        box-shadow: 0 1px 2px rgba(0,0,0,0.1);
                    }
                    .message.received {
                        align-self: flex-start;
                        background: var(--vscode-sideBar-background);
                        border: 1px solid var(--vscode-widget-border);
                    }
                    .message.sent {
                        align-self: flex-end;
                        background: var(--vscode-selection-background);
                        color: var(--vscode-selection-foreground);
                    }
                    
                    /* Sales Opportunity Styling */
                    .message.sales-opportunity {
                        border: 2px solid #FFD700 !important; /* Gold border */
                        background: #332b00 !important; /* Dark gold bg */
                        color: #FFF !important;
                    }
                    .sales-icon {
                        margin-left: 5px;
                        font-size: 1.2em;
                    }
                    .sales-actions {
                        margin-top: 8px;
                        display: flex;
                        justify-content: flex-end;
                    }

                    .message-header {
                        display: flex; justify-content: space-between; margin-bottom: 4px; font-size: 0.75em; opacity: 0.8;
                    }
                    .copilot-action { cursor: pointer; font-size: 1.2em; }
                    
                    #input-container {
                        padding: 12px; display: flex; gap: 8px; background: var(--vscode-sideBar-background); align-items: center;
                    }
                    vscode-text-field { flex: 1; }
                </style>
            </head>
            <body>
                ${content}
                <script>
                    const vscode = acquireVsCodeApi();
                    
                    // Manejo centralizado de eventos (Event Delegation)
                    document.addEventListener('click', (e) => {
                        const target = e.target;
                        
                        // 1. Selector de Chat
                        const chatItem = target.closest('[data-action="select-chat"]');
                        if (chatItem) {
                            const jid = chatItem.getAttribute('data-jid');
                            if (jid) vscode.postMessage({ type: 'selectChat', jid });
                            return;
                        }

                        // 2. Copilot Action (Span o Botón)
                        const copilotAction = target.closest('[data-action="ask-copilot"]');
                        if (copilotAction) {
                            const text = copilotAction.getAttribute('data-text');
                            const isSales = copilotAction.getAttribute('data-is-sales') === 'true';
                            if (text) vscode.postMessage({ type: 'askCopilot', text, isSales });
                            return;
                        }
                    });

                    // Elementos UI
                    const list = document.getElementById('messages-list');
                    const input = document.getElementById('message-input');
                    const sendBtn = document.getElementById('send-btn');
                    const backBtn = document.getElementById('back-btn');
                    const clipBtn = document.getElementById('clip-btn');

                    if (backBtn) {
                        backBtn.addEventListener('click', () => {
                            vscode.postMessage({ type: 'backToList' });
                        });
                    }

                    if (clipBtn) {
                        clipBtn.addEventListener('click', () => vscode.postMessage({ type: 'attachFile' }));
                    }

                    if (sendBtn) {
                        sendBtn.addEventListener('click', () => {
                            const text = input.value;
                            if (text) {
                                vscode.postMessage({ type: 'sendMessage', text: text });
                                input.value = '';
                            }
                        });
                        input.addEventListener('keypress', (e) => {
                            if (e.key === 'Enter') sendBtn.click();
                        });
                    }

                    // Auto scroll
                    if (list) list.scrollTop = list.scrollHeight;
                </script>
            </body>
            </html>`;
    }
    _escapeHtml(unsafe) {
        return unsafe
            .replace(/&/g, "&amp;")
            .replace(/</g, "&lt;")
            .replace(/>/g, "&gt;")
            .replace(/"/g, "&quot;")
            .replace(/'/g, "&#039;");
    }
    _renderChatList() {
        // Sort extra por seguridad aquí también
        const sortedChats = [...this.chats].sort((a, b) => (b.timestamp || 0) - (a.timestamp || 0));
        return `
            <div id="chat-list">
                <h3 style="padding: 10px;">Chats Recientes (${sortedChats.length})</h3>
                <div class="list-container">
                ${sortedChats.map(chat => {
            const timestamp = chat.timestamp * 1000;
            const date = new Date(timestamp);
            const timeString = date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
            const dateString = date.toLocaleDateString([], { day: '2-digit', month: '2-digit' });
            const isToday = new Date().toDateString() === date.toDateString();
            const displayTime = isToday ? timeString : dateString;
            // FIX-20260227-SORTING-DEBUG: Mostrar fuente de la fecha
            const debugTag = chat.debugSource ?
                `<span style="font-size: 0.6em; color: var(--vscode-errorForeground); margin-left: 5px; opacity: 0.7;" title="Fuente de fecha: ${chat.debugSource}">[${chat.debugSource}]</span>`
                : '';
            return `
                    <div class="chat-item" 
                         data-action="select-chat" 
                         data-jid="${this._escapeHtml(chat.jid)}"
                         style="padding: 10px; border-bottom: 1px solid var(--vscode-widget-border); cursor: pointer; display: flex; justify-content: space-between; align-items: center;">
                        <div style="flex: 1; overflow: hidden;">
                            <div style="font-weight: bold; display: flex; align-items: center;">
                                ${this._escapeHtml(chat.name || chat.jid.split('@')[0])}
                                ${debugTag}
                            </div>
                            <div style="font-size: 0.85em; opacity: 0.8; white-space: nowrap; overflow: hidden; text-overflow: ellipsis;">
                                ${this._escapeHtml(chat.lastMessage || '')}
                            </div>
                        </div>
                        <div style="font-size: 0.75em; opacity: 0.6; min-width: 50px; text-align: right;">
                            <div>${displayTime}</div>
                            ${chat.unreadCount > 0 ? `<div style="background: var(--vscode-activityBarBadge-background); color: var(--vscode-activityBarBadge-foreground); border-radius: 10px; padding: 2px 6px; display: inline-block; font-size: 0.8em; margin-top: 2px;">${chat.unreadCount}</div>` : ''}
                        </div>
                    </div>
                    `;
        }).join('')}
                </div>
            </div>
        `;
    }
    _renderConversation() {
        if (!this.activeChatJid)
            return '';
        const msgs = this.messagesCache.get(this.activeChatJid) || [];
        const messagesHtml = msgs.map(m => `
            <div class="message ${m.sender === 'Yo' ? 'sent' : 'received'} ${m.isSales ? 'sales-opportunity' : ''}">
                <div class="message-header">
                    <span class="sender">${this._escapeHtml(m.sender)}</span>
                    ${m.sender !== 'Yo' ? `
                        <span class="copilot-action" 
                              data-action="ask-copilot" 
                              data-text="${this._escapeHtml(m.text)}" 
                              data-is-sales="${m.isSales || false}" 
                              title="Pedir ayuda a Copilot">🤖</span>
                    ` : ''}
                    ${m.isSales ? '<span class="sales-icon" title="Oportunidad de Venta">💰</span>' : ''}
                </div>
                <div class="text">${this._escapeHtml(m.text)}</div>
                ${m.isSales ? `
                    <div class="sales-actions">
                        <vscode-button appearance="secondary" style="font-size: 0.8em; padding: 2px 5px;" 
                                       data-action="ask-copilot" 
                                       data-text="${this._escapeHtml(m.text)}" 
                                       data-is-sales="true">
                            Generar Cotización
                        </vscode-button>
                    </div>
                ` : ''}
            </div>
        `).join('');
        return `
            <div id="chat-container">
                <div id="chat-header-bar">
                    <vscode-button id="back-btn" appearance="icon">⬅️</vscode-button>
                    <h3>${this._escapeHtml(this.activeChatJid)}</h3>
                </div>
                <div id="messages-list">
                    ${messagesHtml}
                </div>
                <div id="input-container">
                    <vscode-button id="clip-btn" appearance="icon" title="Adjuntar archivo">📎</vscode-button>
                    <vscode-text-field id="message-input" placeholder="Escribe un mensaje..." autofocus></vscode-text-field>
                    <vscode-button id="send-btn" appearance="primary">Enviar</vscode-button>
                </div>
            </div>
        `;
    }
}
exports.WhatsAppViewProvider = WhatsAppViewProvider;
//# sourceMappingURL=WhatsAppViewProvider.js.map