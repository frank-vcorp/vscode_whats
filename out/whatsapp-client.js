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
    chats = new Map();
    isConnecting = false;
    isReconnecting = false;
    reconnectTimeout;
    constructor(storagePath) {
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
            }
            catch (e) {
                console.warn('Error limpiando socket anterior:', e);
            }
            this.sock = undefined;
        }
        // -----------------------------------------------
        try {
            const { state, saveCreds } = await (0, baileys_1.useMultiFileAuthState)(this.authPath);
            this.state = state;
            this.saveCreds = saveCreds;
            const { version, isLatest } = await (0, baileys_1.fetchLatestBaileysVersion)();
            console.log(`Usando Baileys v${version.join('.')}, isLatest: ${isLatest}`);
            // Limpiar socket anterior si existe (evitar memory leaks / listeners zombies)
            if (this.sock) {
                this.sock.ev.removeAllListeners('connection.update');
                this.sock.ev.removeAllListeners('creds.update');
                this.sock.ev.removeAllListeners('messages.upsert');
            }
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
            });
            this.sock.ev.on('connection.update', (update) => {
                const { connection, lastDisconnect, qr } = update;
                if (qr) {
                    qrcode_1.default.toDataURL(qr).then((url) => {
                        this.emit('qr', url);
                    }).catch(console.error);
                }
                if (connection === 'close') {
                    // Resetear flag para permitir futura reconexión
                    this.isConnecting = false;
                    const shouldReconnect = lastDisconnect?.error?.output?.statusCode !== baileys_1.DisconnectReason.loggedOut;
                    console.log('Conexión cerrada. Reintentando:', shouldReconnect);
                    if (shouldReconnect) {
                        this.isReconnecting = true;
                        // Backoff simple de 2s para evitar bucles rápidos
                        if (this.reconnectTimeout)
                            clearTimeout(this.reconnectTimeout);
                        this.reconnectTimeout = setTimeout(() => {
                            this.isReconnecting = false; // Reset antes de llamar
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
            // Manejo de mensajes (re-registrar listeners en el nuevo socket)
            this._registerMessageHandlers();
        }
        catch (error) {
            console.error('Error fatal al conectar:', error);
            this.isConnecting = false;
        }
    }
    _registerMessageHandlers() {
        // Manejo de chats
        this.sock.ev.on('chats.upsert', (newChats) => {
            console.log('Chats upsert:', newChats.length);
            for (const chat of newChats) {
                this._updateChat(chat.id, chat);
            }
            this.emit('chats.update', this.getChats());
        });
        this.sock.ev.on('chats.update', (updates) => {
            for (const update of updates) {
                this._updateChat(update.id, update);
            }
            this.emit('chats.update', this.getChats());
        });
        this.sock.ev.on('messages.upsert', async (m) => {
            if (m.type === 'notify' || m.type === 'append') {
                const msg = m.messages[0];
                if (!msg.key.remoteJid)
                    return;
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
    _updateChat(jid, updates) {
        if (jid === 'status@broadcast')
            return;
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
            this.sock?.groupMetadata(jid).then((meta) => {
                existing.name = meta.subject;
                this.chats.set(jid, existing);
                this.emit('chats.update', this.getChats());
            }).catch(() => { });
        }
        else if (!existing.isGroup && updates.name) {
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
    getChats() {
        return Array.from(this.chats.values())
            .sort((a, b) => b.timestamp - a.timestamp)
            .slice(0, 20);
    }
    async sendMessage(jid, text) {
        if (!this.sock)
            throw new Error('Cliente no conectado');
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
exports.WhatsAppClient = WhatsAppClient;
//# sourceMappingURL=whatsapp-client.js.map