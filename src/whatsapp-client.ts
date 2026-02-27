import makeWASocket, { 
    DisconnectReason, 
    useMultiFileAuthState, 
    fetchLatestBaileysVersion, 
    makeCacheableSignalKeyStore,
    makeInMemoryStore,
    WAMessage,
    proto,
    ParticipantAction
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
    private store: any;
    private isConnecting: boolean = false;
    private isReconnecting: boolean = false;
    private connectionTimer: NodeJS.Timeout | undefined;
    private reconnectTimeout: NodeJS.Timeout | undefined;

    constructor(storagePath: string) {
        super();
        this.authPath = path.join(storagePath, 'whatsapp-auth');
        if (!fs.existsSync(this.authPath)) {
            fs.mkdirSync(this.authPath, { recursive: true });
        }

        // --- FIX: Store robusto con manejo de errores ---
        try {
            this.store = makeInMemoryStore({ 
                logger: pino({ level: 'silent' }) as any
            });
            const storePath = path.join(this.authPath, 'baileys_store_multi.json');
            if (fs.existsSync(storePath)) {
                this.store.readFromFile(storePath);
            }
        } catch (error) {
            console.error('Error inicializando store:', error);
            // Si falla el store, intentar borrarlo para evitar bloqueos
            try { fs.unlinkSync(path.join(this.authPath, 'baileys_store_multi.json')); } catch (e) {}
            this.store = makeInMemoryStore({ logger: pino({ level: 'silent' }) as any });
        }

        // Guardar store periódicamente
        setInterval(() => {
            try {
                this.store?.writeToFile(path.join(this.authPath, 'baileys_store_multi.json'));
            } catch (error) {}
        }, 30_000);
    }

    async resetSession() {
        console.log('Reseteando sesión...');
        if (this.sock) {
            this.sock.ws?.close();
            this.sock.removeAllListeners();
            this.sock = undefined;
        }
        
        try {
            fs.rmSync(this.authPath, { recursive: true, force: true });
            fs.mkdirSync(this.authPath, { recursive: true });
            console.log('Carpeta de sesión eliminada.');
            this.emit('disconnected', 'Sesión reiniciada manualmente.');
        } catch (error) {
            console.error('Error borrando sesión:', error);
        }
    }

    async connect() {
        if (this.isConnecting || this.isReconnecting) return;
        this.isConnecting = true;
        
        // Timeout de seguridad: Si en 20s no conecta, forzar error
        if (this.connectionTimer) clearTimeout(this.connectionTimer);
        this.connectionTimer = setTimeout(() => {
            if (this.isConnecting) {
                console.error('Timeout de conexión - reiniciando proceso...');
                this.isConnecting = false;
                this.emit('error', 'Tiempo de espera agotado. Verifica tu conexión.');
                // Opcional: Auto-reconnect
                // this.connect();
            }
        }, 20000);

        // --- Cleanup robusto antes de reconectar ---
        if (this.sock) {
            try {
                this.sock.ws?.close();
                this.sock.ev.removeAllListeners('connection.update');
                this.sock.ev.removeAllListeners('creds.update');
                this.sock.ev.removeAllListeners('messages.upsert');
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

            const logger = pino({ level: 'silent' }) as any;

            this.sock = makeWASocket({
                version,
                logger,
                printQRInTerminal: false,
                auth: {
                    creds: state.creds,
                    keys: makeCacheableSignalKeyStore(state.keys, logger),
                },
                generateHighQualityLinkPreview: true,
                // FIX: Configuración solicitada
                browser: ['VS Code WhatsApp', 'Chrome', '1.0.0'],
                syncFullHistory: true, 
            });

            // Bindear el store a los eventos del socket
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

            // Reenvío de mensajes nuevos para notificaciones
            this.sock.ev.on('messages.upsert', async (m: any) => {
                if (m.type === 'notify') {
                    const msg = m.messages[0];
                    if (!msg.key.fromMe) {
                        this.emit('message', msg);
                    }
                    // Emitir actualización de chats
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

        // Obtener chats ordenados usando lógica simple
        // store.chats es un objeto o mapa. makeInMemoryStore usa un mapa interno pero expone métodos
        // Asumiendo que store.chats tiene un método o es iterable
        let chats: any[] = [];
        if (this.store.chats) {
            // Intenta usar .all() si existe (KeyedDB)
            if (typeof this.store.chats.all === 'function') {
                chats = this.store.chats.all();
            } else if (this.store.chats instanceof Map) {
                chats = Array.from(this.store.chats.values());
            } else {
                chats = Object.values(this.store.chats);
            }
        }

        return chats.map((c: any) => {
            const contact = this.store.contacts[c.id] || {}; 
            
            // Lógica de nombre
            let name = c.name || contact.name || contact.notify || c.id.split('@')[0];
            
            // Último mensaje
            const lastMsg = c.lastMessageRecv || c.lastMessage; 
            
            let content = '';
            // Extraer texto del mensaje de forma segura
            if (lastMsg && lastMsg.message) {
                 const mContent = lastMsg.message;
                 content = mContent.conversation || 
                           mContent.extendedTextMessage?.text || 
                           mContent.imageMessage?.caption ||
                           (mContent.imageMessage ? '📷 Foto' : '') ||
                           (mContent.videoMessage ? '🎥 Video' : '') ||
                           (mContent.audioMessage ? '🎵 Audio' : '') ||
                           (mContent.stickerMessage ? '👾 Sticker' : '') ||
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
