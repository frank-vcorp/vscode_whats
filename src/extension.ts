import * as vscode from 'vscode';
import * as fs from 'fs';
import * as path from 'path';
import { WhatsAppViewProvider } from './WhatsAppViewProvider.js';
import { WhatsAppClient } from './whatsapp-client.js';

/**
 * @intervention IMPL-20260227-07
 * @see context/checkpoints/CHK_20260227_STATUSBAR.md
 */
export async function activate(context: vscode.ExtensionContext) {
    console.log('Felicidades, tu extensión "vscode-whats" ahora está activa.');

    const client = new WhatsAppClient(context.globalStorageUri.fsPath);
    const provider = new WhatsAppViewProvider(context.extensionUri, client);

    // --- Notificaciones en StatusBar (IMPL-20260227-07) ---
    const statusBarItem = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Right, 100);
    statusBarItem.command = 'whatsapp.focus';
    context.subscriptions.push(statusBarItem);
    
    let unreadMessages = 0;
    const updateStatusBar = () => {
        if (unreadMessages > 0) {
            statusBarItem.text = `$(comment-discussion) ${unreadMessages}`;
            statusBarItem.tooltip = `${unreadMessages} mensajes nuevos en WhatsApp`;
            statusBarItem.show();
        } else {
            statusBarItem.hide();
        }
    };

    // Resetear contador cuando se abre la vista
    provider.onDidChangeVisibility((visible) => {
        if (visible) {
            unreadMessages = 0;
            updateStatusBar();
        }
    });

    // Registrar comando para enfocar la vista
    context.subscriptions.push(
        vscode.commands.registerCommand('whatsapp.focus', () => {
            // "whatsapp-view" es el ID definido en package.json
            vscode.commands.executeCommand('whatsapp-view.focus');
        })
    );
    // -----------------------------------------------------

    const historyPath = path.join(context.extensionPath, 'context', 'whats_history.md');

    // Asegurar que el directorio context existe
    const contextDir = path.dirname(historyPath);
    if (!fs.existsSync(contextDir)) {
        fs.mkdirSync(contextDir, { recursive: true });
    }

    // Iniciar comando para Copilot
    context.subscriptions.push(
        vscode.commands.registerCommand('whatsapp.suggestWithCopilot', async (text?: string) => {
            let contextText = '';
            
            if (text) {
                // Si viene de un mensaje específico
                contextText = text;
            } else {
                // Si es global, leemos el historial
                try {
                    if (fs.existsSync(historyPath)) {
                        const content = fs.readFileSync(historyPath, 'utf8');
                        const lines = content.trim().split('\n').filter(l => l.trim() !== '');
                        contextText = lines.slice(-10).join('\n');
                    }
                } catch (err) {
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
        })
    );

    // Listener para mensajes entrantes para persistencia
    client.on('message', async (m: any) => {
        const messageText = m.message?.conversation || m.message?.extendedTextMessage?.text;
        const senderName = m.pushName || m.key.remoteJid;

        if (messageText) {
            const logEntry = `**[${senderName}]:** ${messageText}\n\n`;
            try {
                fs.appendFileSync(historyPath, logEntry);
            } catch (error) {
                console.error('Error escribiendo historial:', error);
            }

            // Nota: El provider ya escucha 'message' internamente para actualizar la UI.
            
            // Actualizar StatusBar si la vista no es visible
            if (!provider.isVisible()) {
                unreadMessages++;
                updateStatusBar();
            } else {
                // Si es visible, asumimos que se leyó (o al menos se vió)
                // Opcional: Podría requerir lógica más compleja de "Chat activo", 
                // pero por ahora simplificamos: visible = leído.
                unreadMessages = 0;
                updateStatusBar();
            }
        }
    });

    context.subscriptions.push(
        vscode.window.registerWebviewViewProvider(WhatsAppViewProvider.viewType, provider)
    );

    // Iniciar conexión en segundo plano
    client.connect().catch(console.error);
}

export function deactivate() {}
