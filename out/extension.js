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
 * @intervention IMPL-20260227-05
 * @see context/checkpoints/CHK_20260227_NOTIFY_MEDIA.md
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
    // Iniciar comando para Copilot
    context.subscriptions.push(vscode.commands.registerCommand('whatsapp.suggestWithCopilot', async (text) => {
        let contextText = '';
        if (text) {
            // Si viene de un mensaje específico
            contextText = text;
        }
        else {
            // Si es global, leemos el historial
            try {
                if (fs.existsSync(historyPath)) {
                    const content = fs.readFileSync(historyPath, 'utf8');
                    const lines = content.trim().split('\n').filter(l => l.trim() !== '');
                    contextText = lines.slice(-10).join('\n');
                }
            }
            catch (err) {
                console.error('Error leyendo historial:', err);
            }
        }
        if (!contextText) {
            vscode.window.showInformationMessage('No hay mensajes recientes para analizar.');
            return;
        }
        const prompt = `Basándote en estos mensajes de WhatsApp reciente, ¿qué respuesta profesional me sugieres? \n\n${contextText}`;
        // Intentar copiar al portapapeles por seguridad (pueden no tener Chat activo)
        await vscode.env.clipboard.writeText(prompt);
        vscode.window.showInformationMessage('Prompt copiado al portapapeles. Abre Copilot Chat y pégalo.', 'Abrir Chat').then(selection => {
            if (selection === 'Abrir Chat') {
                vscode.commands.executeCommand('workbench.action.chat.open');
            }
        });
        // También intentamos lanzarlo directamente si es posible
        vscode.commands.executeCommand('workbench.action.chat.open', { query: prompt }).then(undefined, err => {
            console.log('El comando directo no es soportado en esta versión de VS Code:', err);
        });
    }));
    // Listener para mensajes entrantes para persistencia
    client.on('message', async (m) => {
        const messageText = m.message?.conversation || m.message?.extendedTextMessage?.text;
        const senderName = m.pushName || m.key.remoteJid;
        if (messageText) {
            const logEntry = `**[${senderName}]:** ${messageText}\n\n`;
            try {
                fs.appendFileSync(historyPath, logEntry);
            }
            catch (error) {
                console.error('Error escribiendo historial:', error);
            }
            // Nota: El provider ya escucha 'message' internamente para actualizar la UI.
            // provider.addMessage(senderName, messageText); <-- Eliminado
            // Notificación si no está visible
            if (!provider.isVisible()) {
                const preview = messageText.length > 50 ? messageText.substring(0, 47) + '...' : messageText;
                vscode.window.showInformationMessage(`WhatsApp: ${senderName}: ${preview}`, 'Ver Chat').then(selection => {
                    if (selection === 'Ver Chat') {
                        vscode.commands.executeCommand('whatsapp.focus');
                    }
                });
            }
        }
    });
    context.subscriptions.push(vscode.window.registerWebviewViewProvider(WhatsAppViewProvider_js_1.WhatsAppViewProvider.viewType, provider));
    // Iniciar conexión en segundo plano
    client.connect().catch(console.error);
}
function deactivate() { }
//# sourceMappingURL=extension.js.map