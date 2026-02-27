import * as vscode from 'vscode';
import { WhatsAppViewProvider } from './WhatsAppViewProvider.js';

/**
 * @intervention IMPL-20260227-01
 * @see context/checkpoints/CHK_20260227_SCX.md
 */
export function activate(context: vscode.ExtensionContext) {
    console.log('Felicidades, tu extensión "vscode-whats" ahora está activa.');

    const provider = new WhatsAppViewProvider(context.extensionUri);

    context.subscriptions.push(
        vscode.window.registerWebviewViewProvider(WhatsAppViewProvider.viewType, provider)
    );
}

export function deactivate() {}
