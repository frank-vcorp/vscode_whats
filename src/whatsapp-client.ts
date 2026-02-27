import makeWASocket, { 
    DisconnectReason, 
    useMultiFileAuthState, 
    fetchLatestBaileysVersion, 
    makeCacheableSignalKeyStore,
    WAMessage,
    proto
} from '@whiskeysockets/baileys';
import { Boom } from '@hapi/boom';
import EventEmitter from 'events';
import pino from 'pino';
import QRCode from 'qrcode';
import * as path from 'path';
import * as fs from 'fs';

/**
 * @intervention IMPL-20260227-06
 * @see context/checkpoints/CHK_20260227_SALES_AGENT.md
 */

export interface ChatInfo {
    jid: string;
    name: string;
    lastMessage?: string;
    timestamp: number;
    unreadCount: number;
    isGroup: boolean;
}

export class WhatsAppClient extends EventEmitter {
    private sock: any;
    private state: any;
    private saveCreds: any;
    private authPath: string;
    private chats: Map<string, ChatInfo> = new Map();
    private isConnecting: boolean = false;
    private isReconnecting: boolean = false;
    private reconnectTimeout: NodeJS.Timeout | undefined;

    constructor(storagePath: string) {
        super();
        this.authPath = path.join(storagePath, 'whatsapp-auth');
        if (!fs.existsSync(this.authPath)) {
            fs.mkdirSync(this.authPath, { recursive: true });
        }
    }

    async connect() {
        if (this.isConnecting || this.isReconnecting) {
            console.log('Conexión/Reconexión en curso, ignorando llamada duplicada.');
            return;
        }
        this.isConnecting = true;

        // --- FIX: Cleanup robusto antes de reconectar ---
        if (this.sock) {
            try {
                this.sock.ws?.close(); // Cerrar WS si existe
                this.sock.ev.removeAllListeners('connection.update');
                this.sock.ev.removeAllListeners('creds.update');
                this.sock.ev.removeAllListeners('messages.upsert');
                this.sock.ev.removeAllListeners('chats.upsert');
                this.sock.ev.removeAllListeners('chats.update');
            } catch (e) {
                console.warn('Error limpiando socket anterior:', e);
            }
            this.sock = undefined;
        }
        // -----------------------------------------------

        try {
            const { state, saveCreds } = await useMultiFileAuthState(this.authPath);
            this.state = state;
            this.saveCreds = saveCreds;

            const { version, isLatest } = await fetchLatestBaileysVersion();
            console.log(`Usando Baileys v${version.join('.')}, isLatest: ${isLatest}`);

            // Limpiar socket anterior si existe (evitar memory leaks / listeners zombies)
            if (this.sock) {
                this.sock.ev.removeAllListeners('connection.update');
                this.sock.ev.removeAllListeners('creds.update');
                this.sock.ev.removeAllListeners('messages.upsert');
            }

            const logger = pino({ level: 'silent' });

            this.sock = makeWASocket({
                version,
                logger,
                printQRInTerminal: false,
                auth: {
                    creds: state.creds,
                    keys: makeCacheableSignalKeyStore(state.keys, logger),
                },
                generateHighQualityLinkPreview: true,
            });

            this.sock.ev.on('connection.update', (update: any) => {
                const { connection, lastDisconnect, qr } = update;

                if (qr) {
                    QRCode.toDataURL(qr).then((url) => {
                        this.emit('qr', url);
                    }).catch(console.error);
                }

                if (connection === 'close') {
                    // Resetear flag para permitir futura reconexión
                    this.isConnecting = false;
                    
                    const shouldReconnect = (lastDisconnect?.error as Boom)?.output?.statusCode !== DisconnectReason.loggedOut;
                    console.log('Conexión cerrada. Reintentando:', shouldReconnect);
                    
                    if (shouldReconnect) {
                         this.isReconnecting = true;
                         // Backoff simple de 2s para evitar bucles rápidos
                         if (this.reconnectTimeout) clearTimeout(this.reconnectTimeout);
                         this.reconnectTimeout = setTimeout(() => {
                             this.isReconnecting = false; // Reset antes de llamar
                             this.connect();
                         }, 2000);
                    }
                } else if (connection === 'open') {
                    this.isConnecting = false;
                    this.isReconnecting = false;
                    console.log('Conexión de WhatsApp abierta');
                    this.emit('connected');
                }
            });

            this.sock.ev.on('creds.update', saveCreds);

            // Manejo de mensajes (re-registrar listeners en el nuevo socket)
            this._registerMessageHandlers();

        } catch (error) {
            console.error('Error fatal al conectar:', error);
            this.isConnecting = false;
        }
    }

    private _registerMessageHandlers() {
        // Manejo de chats
        this.sock.ev.on('chats.upsert', (newChats: any[]) => {
            console.log('Chats upsert:', newChats.length);
            for (const chat of newChats) {
                this._updateChat(chat.id, chat);
            }
            this.emit('chats.update', this.getChats());
        });

        this.sock.ev.on('chats.update', (updates: any[]) => {
            for (const update of updates) {
                this._updateChat(update.id, update);
            }
            this.emit('chats.update', this.getChats());
        });

        this.sock.ev.on('messages.upsert', async (m: any) => {
            if (m.type === 'notify' || m.type === 'append') {
                const msg = m.messages[0];
                if (!msg.key.remoteJid) return;

                const jid = msg.key.remoteJid;
                
                const timestamp = (typeof msg.messageTimestamp === 'number') 
                    ? msg.messageTimestamp 
                    : (msg.messageTimestamp?.low || Date.now() / 1000);
                
                const currentChat = this.chats.get(jid);
                const newUnread = !msg.key.fromMe ? ((currentChat?.unreadCount || 0) + 1) : 0;

                this._updateChat(jid, {
                    conversationTimestamp: timestamp,
                    unreadCount: newUnread
                });

                if (m.type === 'notify') {
                    this.emit('message', msg);
                    this.emit('chats.update', this.getChats()); 
                }
            }
        });
    }

    private _updateChat(jid: string, updates: any) {
        if (jid === 'status@broadcast') return;

        const existing = this.chats.get(jid) || {
            jid,
            name: jid.split('@')[0], // Default name
            timestamp: Date.now() / 1000,
            unreadCount: 0,
            isGroup: jid.endsWith('@g.us'),
            lastMessage: '' 
        };

        // Si es grupo y no tenemos nombre real, intentar obtenerlo
        if (existing.isGroup && existing.name === jid.split('@')[0]) {
            // Nota: Esto es asíncrono, se actualizará después
            this.sock?.groupMetadata(jid).then((meta: any) => {
                existing.name = meta.subject;
                this.chats.set(jid, existing);
                this.emit('chats.update', this.getChats());
            }).catch(() => {});
        } else if (!existing.isGroup && updates.name) {
             existing.name = updates.name; // A veces viene en el update
        }

        if (updates.conversationTimestamp) {
            existing.timestamp = (typeof updates.conversationTimestamp === 'number') 
                ? updates.conversationTimestamp 
                : updates.conversationTimestamp.low;
        }

        // Simular last message si no tenemos acceso al contenido exacto desde chats.update
        // messages.upsert se encargará de poner el texto real

        this.chats.set(jid, { ...existing, ...updates });
    }

    getChats(): ChatInfo[] {
        return Array.from(this.chats.values())
            .sort((a, b) => b.timestamp - a.timestamp)
            .slice(0, 20);
    } 

    async sendMessage(jid: string, text: string) {
        if (!this.sock) throw new Error('Cliente no conectado');
        const sent = await this.sock.sendMessage(jid, { text });
        // Actualizar chat localmente para reflejar "Yo" envió algo
        this._updateChat(jid, {
            conversationTimestamp: Date.now() / 1000,
            lastMessage: `You: ${text}`
        });
        return sent;
    }

    getSocket() {
        return this.sock;
    }
}
