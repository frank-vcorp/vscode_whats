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
exports.activate = activate;
exports.deactivate = deactivate;
const vscode = __importStar(require("vscode"));
const fs = __importStar(require("fs"));
const path = __importStar(require("path"));
const WhatsAppViewProvider_js_1 = require("./WhatsAppViewProvider.js");
const whatsapp_client_js_1 = require("./whatsapp-client.js");
/**
 * @intervention IMPL-20260227-03
 * @see context/checkpoints/CHK_20260227_CHAT_UI.md
 */
async function activate(context) {
    console.log('Felicidades, tu extensión "vscode-whats" ahora está activa.');
    const client = new whatsapp_client_js_1.WhatsAppClient(context.globalStorageUri.fsPath);
    const provider = new WhatsAppViewProvider_js_1.WhatsAppViewProvider(context.extensionUri, client);
    const historyPath = path.join(context.extensionPath, 'context', 'whats_history.md');
    // Asegurar que el directorio context existe
    const contextDir = path.dirname(historyPath);
    if (!fs.existsSync(contextDir)) {
        fs.mkdirSync(contextDir, { recursive: true });
    }
    // Listener para mensajes entrantes para persistencia
    client.on('message', async (m) => {
        const messageText = m.message?.conversation || m.message?.extendedTextMessage?.text;
        const senderName = m.pushName || m.key.remoteJid;
        if (messageText) {
            const logEntry = `**[${senderName}]:** ${messageText}\n\n`;
            fs.appendFileSync(historyPath, logEntry);
            // También notificar al provider para actualizar la UI en tiempo real
            provider.addMessage(senderName, messageText);
        }
    });
    context.subscriptions.push(vscode.window.registerWebviewViewProvider(WhatsAppViewProvider_js_1.WhatsAppViewProvider.viewType, provider));
    // Iniciar conexión en segundo plano
    client.connect().catch(console.error);
}
function deactivate() { }
//# sourceMappingURL=extension.js.map