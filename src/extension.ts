import * as vscode from 'vscode';
import { WhatsAppViewProvider } from './WhatsAppViewProvider.js';
import { WhatsAppClient } from './whatsapp-client.js';

/**
 * @intervention IMPL-20260227-02
 * @see context/checkpoints/CHK_20260227_WAV2.md
 */
export async function activate(context: vscode.ExtensionContext) {
    console.log('Felicidades, tu extensión "vscode-whats" ahora está activa.');

    const client = new WhatsAppClient(context.globalStorageUri.fsPath);
    const provider = new WhatsAppViewProvider(context.extensionUri, client);

    context.subscriptions.push(
        vscode.window.registerWebviewViewProvider(WhatsAppViewProvider.viewType, provider)
    );

    // Iniciar conexión en segundo plano
    client.connect().catch(console.error);
}

export function deactivate() {}
