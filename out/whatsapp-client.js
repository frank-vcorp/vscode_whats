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
        // --- FIX: Usar makeInMemoryStore oficial de Baileys ---
        this.store = (0, baileys_1.makeInMemoryStore)({
            logger: (0, pino_1.default)({ level: 'silent' })
        });
        // Cargar store previo si existe
        try {
            const storePath = path.join(this.authPath, 'baileys_store_multi.json');
            if (fs.existsSync(storePath)) {
                this.store.readFromFile(storePath);
            }
        }
        catch (error) {
            console.log('No se pudo leer store previo, iniciando nuevo.');
        }
        // Guardar store periódicamente
        setInterval(() => {
            try {
                this.store?.writeToFile(path.join(this.authPath, 'baileys_store_multi.json'));
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
                // FIX: Configuración solicitada
                browser: ['VS Code WhatsApp', 'Chrome', '1.0.0'],
                syncFullHistory: true,
            });
            // Bindear el store a los eventos del socket
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
            // Reenvío de mensajes nuevos para notificaciones
            this.sock.ev.on('messages.upsert', async (m) => {
                if (m.type === 'notify') {
                    const msg = m.messages[0];
                    if (!msg.key.fromMe) {
                        this.emit('message', msg);
                    }
                    // Emitir actualización de chats
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
        // Obtener chats ordenados usando lógica simple
        // store.chats es un objeto o mapa. makeInMemoryStore usa un mapa interno pero expone métodos
        // Asumiendo que store.chats tiene un método o es iterable
        let chats = [];
        if (this.store.chats) {
            // Intenta usar .all() si existe (KeyedDB)
            if (typeof this.store.chats.all === 'function') {
                chats = this.store.chats.all();
            }
            else if (this.store.chats instanceof Map) {
                chats = Array.from(this.store.chats.values());
            }
            else {
                chats = Object.values(this.store.chats);
            }
        }
        return chats.map((c) => {
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