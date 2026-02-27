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
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.WhatsAppClient = void 0;
const baileys_1 = __importStar(require("@whiskeysockets/baileys"));
const events_1 = __importDefault(require("events"));
const pino_1 = __importDefault(require("pino"));
const qrcode_1 = __importDefault(require("qrcode"));
const path = __importStar(require("path"));
const fs = __importStar(require("fs"));
class WhatsAppClient extends events_1.default {
    sock;
    state;
    saveCreds;
    authPath;
    store;
    isConnecting = false;
    isReconnecting = false;
    reconnectTimeout;
    constructor(storagePath) {
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
            bind: (ev) => {
                ev.on('chats.set', ({ chats }) => {
                    for (const chat of chats)
                        this.store?.chats.set(chat.id, chat);
                    this.emit('chats.update', this.getChats());
                });
                ev.on('chats.upsert', (newChats) => {
                    for (const chat of newChats) {
                        const existing = this.store?.chats.get(chat.id) || {};
                        this.store?.chats.set(chat.id, { ...existing, ...chat });
                    }
                    this.emit('chats.update', this.getChats());
                });
                ev.on('chats.update', (updates) => {
                    for (const update of updates) {
                        const existing = this.store?.chats.get(update.id) || {};
                        this.store?.chats.set(update.id, { ...existing, ...update });
                    }
                    this.emit('chats.update', this.getChats());
                });
                ev.on('contacts.set', ({ contacts }) => {
                    for (const contact of contacts)
                        this.store?.contacts.set(contact.id, contact);
                });
                ev.on('contacts.upsert', (contacts) => {
                    for (const contact of contacts) {
                        this.store?.contacts.set(contact.id, { ...(this.store?.contacts.get(contact.id) || {}), ...contact });
                    }
                });
                ev.on('messages.upsert', ({ messages, type }) => {
                    if (type === 'notify' || type === 'append') {
                        for (const msg of messages) {
                            if (!msg.key.remoteJid)
                                continue;
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
            writeToFile: (pathStr) => {
                const data = {
                    chats: Object.fromEntries(this.store.chats),
                    contacts: Object.fromEntries(this.store.contacts)
                };
                fs.writeFileSync(pathStr, JSON.stringify(data));
            },
            readFromFile: (pathStr) => {
                if (fs.existsSync(pathStr)) {
                    const data = JSON.parse(fs.readFileSync(pathStr, 'utf-8'));
                    this.store.chats = new Map(Object.entries(data.chats || {}));
                    this.store.contacts = new Map(Object.entries(data.contacts || {}));
                }
            }
        };
        try {
            const storePath = path.join(this.authPath, 'baileys_store.json');
            this.store.readFromFile(storePath);
        }
        catch (error) {
            console.log('No se pudo leer store previo, iniciando nuevo.');
        }
        // Guardar store periódicamente
        setInterval(() => {
            try {
                this.store?.writeToFile(path.join(this.authPath, 'baileys_store.json'));
            }
            catch (error) { }
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
            }
            catch (e) {
                console.warn('Error limpiando socket anterior:', e);
            }
            this.sock = undefined;
        }
        try {
            const { state, saveCreds } = await (0, baileys_1.useMultiFileAuthState)(this.authPath);
            this.state = state;
            this.saveCreds = saveCreds;
            const { version, isLatest } = await (0, baileys_1.fetchLatestBaileysVersion)();
            console.log(`Usando Baileys v${version.join('.')}, isLatest: ${isLatest}`);
            const logger = (0, pino_1.default)({ level: 'silent' });
            this.sock = (0, baileys_1.default)({
                version,
                logger,
                printQRInTerminal: false,
                auth: {
                    creds: state.creds,
                    keys: (0, baileys_1.makeCacheableSignalKeyStore)(state.keys, logger),
                },
                generateHighQualityLinkPreview: true,
                // FIX: Configuración de browser para evitar desconexiones
                browser: ['VS Code WhatsApp', 'Chrome', '1.0.0'],
                // FIX: Sincronizar historial completo
                syncFullHistory: true,
            });
            this.store?.bind(this.sock.ev);
            this.sock.ev.on('connection.update', (update) => {
                const { connection, lastDisconnect, qr } = update;
                if (qr) {
                    qrcode_1.default.toDataURL(qr).then((url) => {
                        this.emit('qr', url);
                    }).catch(console.error);
                }
                if (connection === 'close') {
                    this.isConnecting = false;
                    const shouldReconnect = lastDisconnect?.error?.output?.statusCode !== baileys_1.DisconnectReason.loggedOut;
                    console.log('Conexión cerrada. Reintentando:', shouldReconnect);
                    if (shouldReconnect) {
                        this.isReconnecting = true;
                        if (this.reconnectTimeout)
                            clearTimeout(this.reconnectTimeout);
                        this.reconnectTimeout = setTimeout(() => {
                            this.isReconnecting = false;
                            this.connect();
                        }, 2000);
                    }
                }
                else if (connection === 'open') {
                    this.isConnecting = false;
                    this.isReconnecting = false;
                    console.log('Conexión de WhatsApp abierta');
                    this.emit('connected');
                }
            });
            this.sock.ev.on('creds.update', saveCreds);
            // Nota: Ya no necesitamos escuchar eventos del store aquí porque el store manual emite 'chats.update' en su bind.
            // Reenvío de mensajes nuevos para notificaciones
            this.sock.ev.on('messages.upsert', async (m) => {
                if (m.type === 'notify') {
                    const msg = m.messages[0];
                    if (!msg.key.fromMe) {
                        this.emit('message', msg);
                    }
                    // Forzar refresh de chats aunque el store debería haberlo hecho
                    this.emit('chats.update', this.getChats());
                }
            });
        }
        catch (error) {
            console.error('Error fatal al conectar:', error);
            this.isConnecting = false;
        }
    }
    getChats() {
        if (!this.store)
            return [];
        // Obtener todos los chats del store (Map -> Array)
        const chats = Array.from(this.store.chats.values());
        return chats.map((c) => {
            const contact = this.store.contacts.get(c.id) || {};
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
            };
        })
            .sort((a, b) => b.timestamp - a.timestamp)
            .slice(0, 50);
    }
    async sendMessage(jid, text) {
        if (!this.sock)
            throw new Error('Cliente no conectado');
        const sent = await this.sock.sendMessage(jid, { text });
        return sent;
    }
    getSocket() {
        return this.sock;
    }
}
exports.WhatsAppClient = WhatsAppClient;
//# sourceMappingURL=whatsapp-client.js.map