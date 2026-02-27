import * as vscode from 'vscode';
import * as fs from 'fs';
import * as path from 'path';
import { WhatsAppViewProvider } from './WhatsAppViewProvider.js';
import { WhatsAppClient } from './whatsapp-client.js';

/**
 * @intervention IMPL-20260227-03
 * @see context/checkpoints/CHK_20260227_CHAT_UI.md
 */
export async function activate(context: vscode.ExtensionContext) {
    console.log('Felicidades, tu extensión "vscode-whats" ahora está activa.');

    const client = new WhatsAppClient(context.globalStorageUri.fsPath);
    const provider = new WhatsAppViewProvider(context.extensionUri, client);

    const historyPath = path.join(context.extensionPath, 'context', 'whats_history.md');

    // Asegurar que el directorio context existe
    const contextDir = path.dirname(historyPath);
    if (!fs.existsSync(contextDir)) {
        fs.mkdirSync(contextDir, { recursive: true });
    }

    // Listener para mensajes entrantes para persistencia
    client.on('message', async (m: any) => {
        const messageText = m.message?.conversation || m.message?.extendedTextMessage?.text;
        const senderName = m.pushName || m.key.remoteJid;

        if (messageText) {
            const logEntry = `**[${senderName}]:** ${messageText}\n\n`;
            fs.appendFileSync(historyPath, logEntry);
            
            // También notificar al provider para actualizar la UI en tiempo real
            provider.addMessage(senderName, messageText);
        }
    });

    context.subscriptions.push(
        vscode.window.registerWebviewViewProvider(WhatsAppViewProvider.viewType, provider)
    );

    // Iniciar conexión en segundo plano
    client.connect().catch(console.error);
}

export function deactivate() {}
