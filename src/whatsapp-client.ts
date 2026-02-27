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
 * @intervention IMPL-20260227-CRASH
 * @see context/interconsultas/DICTAMEN_FIX-20260227-01.md
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
    private store: { chats: Map<string, any>; contacts: Map<string, any>; writeToFile: (path: string) => void; readFromFile: (path: string) => void; bind: (ev: any) => void; } | undefined;
    private isConnecting: boolean = false;
    private isReconnecting: boolean = false;
    private reconnectTimeout: NodeJS.Timeout | undefined;

    constructor(storagePath: string) {
        super();
        this.authPath = path.join(storagePath, 'whatsapp-auth');
        if (!fs.existsSync(this.authPath)) {
            fs.mkdirSync(this.authPath, { recursive: true });
        }

        // --- FIX: Store MANUAL en memoria para persistencia de chats ---
        // Implementación simple compatible con makeInMemoryStore
        this.store = {
            chats: new Map(),
            contacts: new Map(),
            bind: (ev: any) => {
                ev.on('chats.set', ({ chats }: any) => {
                   for (const chat of chats) this.store?.chats.set(chat.id, chat);
                   this.emit('chats.update', this.getChats());
                });
                ev.on('chats.upsert', (newChats: any[]) => {
                    for (const chat of newChats) {
                        const existing = this.store?.chats.get(chat.id) || {};
                        this.store?.chats.set(chat.id, { ...existing, ...chat });
                    }
                    this.emit('chats.update', this.getChats());
                });
                ev.on('chats.update', (updates: any[]) => {
                    for (const update of updates) {
                        const existing = this.store?.chats.get(update.id) || {};
                        this.store?.chats.set(update.id, { ...existing, ...update });
                    }
                    this.emit('chats.update', this.getChats());
                });
                ev.on('contacts.set', ({ contacts }: any) => {
                    for (const contact of contacts) this.store?.contacts.set(contact.id, contact);
                });
                ev.on('contacts.upsert', (contacts: any[]) => {
                    for (const contact of contacts) {
                        this.store?.contacts.set(contact.id, { ...(this.store?.contacts.get(contact.id) || {}), ...contact });
                    }
                });
                ev.on('messages.upsert', ({ messages, type }: any) => {
                    if (type === 'notify' || type === 'append') {
                        for (const msg of messages) {
                            if (!msg.key.remoteJid) continue;
                            const jid = msg.key.remoteJid;
                            const chat = this.store?.chats.get(jid) || { id: jid, unreadCount: 0 };
                            
                            // Actualizar timestamp y último mensaje
                            chat.conversationTimestamp = (typeof msg.messageTimestamp === 'number') 
                                ? msg.messageTimestamp 
                                : msg.messageTimestamp?.low;
                            
                            // Guardar el mensaje completo como lastMessageRecv para compatibilidad
                             chat.lastMessageRecv = msg;
                            
                            if (!msg.key.fromMe && type === 'notify') {
                                chat.unreadCount = (chat.unreadCount || 0) + 1;
                            }
                            
                            this.store?.chats.set(jid, chat);
                        }
                        this.emit('chats.update', this.getChats());
                    }
                });
            },
            writeToFile: (pathStr: string) => {
                const data = {
                    chats: Object.fromEntries(this.store!.chats),
                    contacts: Object.fromEntries(this.store!.contacts)
                };
                fs.writeFileSync(pathStr, JSON.stringify(data));
            },
            readFromFile: (pathStr: string) => {
                if (fs.existsSync(pathStr)) {
                    const data = JSON.parse(fs.readFileSync(pathStr, 'utf-8'));
                    this.store!.chats = new Map(Object.entries(data.chats || {}));
                    this.store!.contacts = new Map(Object.entries(data.contacts || {}));
                }
            }
        };

        try {
            const storePath = path.join(this.authPath, 'baileys_store.json');
            this.store.readFromFile(storePath);
        } catch (error) {
            console.log('No se pudo leer store previo, iniciando nuevo.');
        }

        // Guardar store periódicamente
        setInterval(() => {
            try {
                this.store?.writeToFile(path.join(this.authPath, 'baileys_store.json'));
            } catch (error) {}
        }, 10_000);
    }

    async connect() {
        if (this.isConnecting || this.isReconnecting) {
            console.log('Conexión/Reconexión en curso, ignorando llamada duplicada.');
            return;
        }
        this.isConnecting = true;

        // --- Cleanup robusto antes de reconectar ---
        if (this.sock) {
            try {
                this.sock.ws?.close();
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

        try {
            const { state, saveCreds } = await useMultiFileAuthState(this.authPath);
            this.state = state;
            this.saveCreds = saveCreds;

            const { version, isLatest } = await fetchLatestBaileysVersion();
            console.log(`Usando Baileys v${version.join('.')}, isLatest: ${isLatest}`);

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
                // FIX: Configuración de browser para evitar desconexiones
                browser: ['VS Code WhatsApp', 'Chrome', '1.0.0'], 
                // FIX: Sincronizar historial completo
                syncFullHistory: true, 
            });

            this.store?.bind(this.sock.ev);

            this.sock.ev.on('connection.update', (update: any) => {
                const { connection, lastDisconnect, qr } = update;

                if (qr) {
                    QRCode.toDataURL(qr).then((url) => {
                        this.emit('qr', url);
                    }).catch(console.error);
                }

                if (connection === 'close') {
                    this.isConnecting = false;
                    
                    const shouldReconnect = (lastDisconnect?.error as Boom)?.output?.statusCode !== DisconnectReason.loggedOut;
                    console.log('Conexión cerrada. Reintentando:', shouldReconnect);
                    
                    if (shouldReconnect) {
                         this.isReconnecting = true;
                         if (this.reconnectTimeout) clearTimeout(this.reconnectTimeout);
                         this.reconnectTimeout = setTimeout(() => {
                             this.isReconnecting = false;
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

            // Nota: Ya no necesitamos escuchar eventos del store aquí porque el store manual emite 'chats.update' en su bind.
            
            // Reenvío de mensajes nuevos para notificaciones
            this.sock.ev.on('messages.upsert', async (m: any) => {
                if (m.type === 'notify') {
                    const msg = m.messages[0];
                    if (!msg.key.fromMe) {
                        this.emit('message', msg);
                    }
                    // Forzar refresh de chats aunque el store debería haberlo hecho
                    this.emit('chats.update', this.getChats());
                }
            });

        } catch (error) {
            console.error('Error fatal al conectar:', error);
            this.isConnecting = false;
        }
    }

    getChats(): ChatInfo[] {
        if (!this.store) return [];

        // Obtener todos los chats del store (Map -> Array)
        const chats = Array.from(this.store.chats.values());
        
        return chats.map((c: any) => {
            const contact = this.store!.contacts.get(c.id) || {};
            
            // Lógica de nombre: name del chat > name del contacto > notify del contacto > user id
            let name = c.name || contact.name || contact.notify || c.id.split('@')[0];
            
            // Último mensaje
            const lastMsg = c.lastMessageRecv || c.lastMessage; 
            
            let content = '';
            if (lastMsg) {
                 const mContent = lastMsg.message;
                 content = mContent?.conversation || 
                           mContent?.extendedTextMessage?.text || 
                           mContent?.imageMessage?.caption ||
                           (mContent?.imageMessage ? '📷 Foto' : '') ||
                           (mContent?.videoMessage ? '🎥 Video' : '') ||
                           (mContent?.audioMessage ? '🎵 Audio' : '') ||
                           (mContent?.stickerMessage ? '👾 Sticker' : '') ||
                           'Mensaje';
            }

            return {
                jid: c.id,
                name,
                timestamp: c.conversationTimestamp || (Date.now() / 1000),
                unreadCount: c.unreadCount || 0,
                isGroup: c.id.endsWith('@g.us'),
                lastMessage: content
            } as ChatInfo;
        })
        .sort((a: ChatInfo, b: ChatInfo) => b.timestamp - a.timestamp)
        .slice(0, 50);
    } 

    async sendMessage(jid: string, text: string) {
        if (!this.sock) throw new Error('Cliente no conectado');
        const sent = await this.sock.sendMessage(jid, { text });
        return sent;
    }

    getSocket() {
        return this.sock;
    }
}
