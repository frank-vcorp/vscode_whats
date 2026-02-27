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
/**
 * @intervention IMPL-20260227-02
 * @see context/checkpoints/CHK_20260227_WAV2.md
 */
class WhatsAppViewProvider {
    _extensionUri;
    _client;
    static viewType = 'whatsapp-view';
    _view;
    lastQrCode;
    isConnected = false;
    constructor(_extensionUri, _client) {
        this._extensionUri = _extensionUri;
        this._client = _client;
        this._client.on('qr', (qr) => {
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
    resolveWebviewView(webviewView, context, _token) {
        this._view = webviewView;
        webviewView.webview.options = {
            enableScripts: true,
            localResourceRoots: [
                this._extensionUri
            ]
        };
        this.updateHtml();
    }
    updateHtml() {
        if (this._view) {
            this._view.webview.html = this._getHtmlForWebview(this._view.webview);
        }
    }
    _getHtmlForWebview(webview) {
        let content = '';
        if (this.isConnected) {
            content = '<h1>¡Conectado!</h1><p>Pronto verás aquí tus chats.</p>';
        }
        else if (this.lastQrCode) {
            content = `
                <h2>Escanéame 👋</h2>
                <img src="${this.lastQrCode}" alt="WhatsApp QR Code" />
                <p>Usa WhatsApp en tu teléfono para escanear este código.</p>
            `;
        }
        else {
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
exports.WhatsAppViewProvider = WhatsAppViewProvider;
//# sourceMappingURL=WhatsAppViewProvider.js.map