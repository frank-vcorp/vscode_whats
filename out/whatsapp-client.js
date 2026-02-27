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
const store_fix_1 = require("./store-fix");
const events_1 = __importDefault(require("events"));
const pino_1 = __importDefault(require("pino"));
const qrcode_1 = __importDefault(require("qrcode"));
const path = __importStar(require("path"));
const fs = __importStar(require("fs"));
class WhatsAppClient extends events_1.default {
    sock;
    state;
    saveCreds;
    authPath; // Path to store creds
    store;
    isConnecting = false;
    isReconnecting = false;
    connectionTimer;
    reconnectTimeout;
    constructor(storagePath) {
        super();
        this.authPath = path.join(storagePath, 'whatsapp-auth');
        if (!fs.existsSync(this.authPath)) {
            fs.mkdirSync(this.authPath, { recursive: true });
        }
        // --- FIX: Store robusto con manejo de errores ---
        try {
            this.store = (0, store_fix_1.makeInMemoryStore)({
                logger: (0, pino_1.default)({ level: 'silent' })
            });
            const storePath = path.join(this.authPath, 'baileys_store_multi.json');
            if (fs.existsSync(storePath)) {
                this.store.readFromFile(storePath);
            }
        }
        catch (error) {
            console.error('Error inicializando store:', error);
            // Si falla el store, intentar borrarlo para evitar bloqueos
            try {
                fs.unlinkSync(path.join(this.authPath, 'baileys_store_multi.json'));
            }
            catch (e) { }
            this.store = (0, store_fix_1.makeInMemoryStore)({ logger: (0, pino_1.default)({ level: 'silent' }) });
        }
        // Guardar store periódicamente
        setInterval(() => {
            try {
                this.store?.writeToFile(path.join(this.authPath, 'baileys_store_multi.json'));
            }
            catch (error) { }
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
        }
        catch (error) {
            console.error('Error borrando sesión:', error);
        }
    }
    async connect() {
        if (this.isConnecting || this.isReconnecting)
            return;
        this.isConnecting = true;
        // Timeout de seguridad: Si en 20s no conecta, forzar error
        if (this.connectionTimer)
            clearTimeout(this.connectionTimer);
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
            // Listener explícito para historial y actualizaciones
            this.sock.ev.on('messaging-history.set', (arg) => {
                const { chats, contacts, messages, isLatest } = arg;
                console.log(`Historial recibido: ${chats?.length || 0} chats, ${contacts?.length || 0} contactos, ${messages?.length || 0} mensajes.`);
                // Forzar actualización de UI después de recibir historial
                setTimeout(() => {
                    this.emit('chats.update', this.getChats());
                }, 2000); // Dar tiempo al store para procesar
            });
            this.sock.ev.on('contacts.upsert', (contacts) => {
                console.log(`Contactos actualizados: ${contacts.length}`);
                this.emit('chats.update', this.getChats());
            });
            this.sock.ev.on('chats.upsert', (chats) => {
                console.log(`Chats actualizados: ${chats.length}`);
                this.emit('chats.update', this.getChats());
            });
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
        const chats = this.store.chats.all ? this.store.chats.all() :
            (this.store.chats instanceof Map ? Array.from(this.store.chats.values()) : Object.values(this.store.chats));
        return chats.filter((chat) => chat.id !== 'status@broadcast').map((chat) => {
            // FIX: Mejor resolución de nombres usando helper
            const name = this.getContactName(chat.id) || chat.name || chat.id.split('@')[0];
            // Extract message content safely
            let content = '...';
            // Baileys v6 store structure might differ slightly
            const messagesInStore = this.store.messages ? (this.store.messages[chat.id]?.array || this.store.messages[chat.id] || []) : [];
            const lastMsgFromStore = messagesInStore.length > 0 ? messagesInStore[messagesInStore.length - 1] : null;
            const msg = lastMsgFromStore || (chat.messages ? (chat.messages.all ? chat.messages.all()[0] : chat.messages[0]) : null);
            const lastMsg = msg || chat.lastMessageRecv || chat.lastMessage || {};
            // -------------------------------------------------------------------------------------
            // LOGICA CRITICA: DEEP SEARCH TIMESTAMP (Evitar chats viejos al principio)
            // -------------------------------------------------------------------------------------
            let timestamp = 0; // Por defecto: FONDO DE LA LISTA
            let debugSource = 'NONE';
            // 1. FUENTE SUPREMA: El array de mensajes locales del store
            // Esto asegura que si tenemos mensajes, usemos el último de verdad
            if (messagesInStore.length > 0) {
                // Iterar desde el final hacia el principio para encontrar el último mensaje con timestamp válido
                for (let i = messagesInStore.length - 1; i >= 0; i--) {
                    const m = messagesInStore[i];
                    // --- FILTRO DE MENSAJES DE SISTEMA / PROTOCOLO ---
                    // Ignorar mensajes puramente técnicos que no deben reordenar el chat
                    // protocolMessage: Revoke, Ephemeral settings
                    // senderKeyDistributionMessage: Distribución de claves de cifrado (ruido de fondo)
                    if (m.message?.protocolMessage ||
                        m.message?.senderKeyDistributionMessage ||
                        // @ts-ignore - messageStubType a veces no está en los tipos pero viene en el objeto
                        (m.messageStubType && m.messageStubType === 2) /* CIPHERTEXT */) {
                        continue;
                    }
                    // Ignorar updates de estado vacíos o irrelevantes
                    // messageStubType 2 = CIPHERTEXT es común en "Waiting for this message" pero podría ser válido si es el único.
                    // Sin embargo, si tenemos historial, preferimos mensajes reales.
                    let ts = m.messageTimestamp;
                    if (ts) {
                        // Normalizar Long / number
                        ts = typeof ts === 'number' ? ts : (ts.low || ts.toNumber?.() || 0);
                        if (ts > 0) {
                            timestamp = ts;
                            debugSource = 'MSG'; // Encontrado en mensaje real
                            break;
                        }
                    }
                }
            }
            // 2. FUENTE SECUNDARIA: Propiedad del chat 'lastMessageRecv' / 'lastMessage'
            // Si el store estaba vacío (chat muy viejo sin sync de mensajes), usamos la metadata del chat
            if (timestamp === 0) {
                const tRecv = chat.lastMessageRecv?.messageTimestamp;
                const tSent = chat.lastMessage?.messageTimestamp;
                // Normalizar
                const valRecv = tRecv ? (typeof tRecv === 'number' ? tRecv : (tRecv.low || tRecv.toNumber?.() || 0)) : 0;
                const valSent = tSent ? (typeof tSent === 'number' ? tSent : (tSent.low || tSent.toNumber?.() || 0)) : 0;
                if (valRecv > 0 || valSent > 0) {
                    timestamp = Math.max(valRecv, valSent);
                    debugSource = 'META'; // Encontrado en metadata del chat
                }
            }
            // 3. FUENTE TERCIARIA: 'conversationTimestamp' SOLO SI HAY MENSAJES NO LEÍDOS
            // Esto evita que actualizaciones de metadatos (foto, descripción) revivan chats de 2020.
            if (timestamp === 0 && chat.unreadCount > 0 && chat.conversationTimestamp) {
                const ts = chat.conversationTimestamp;
                // SOLO si es razonablemente reciente (ej. > 2020) para evitar basura unix 0
                const tsNum = typeof ts === 'number' ? ts : (ts.low || ts.toNumber?.() || 0);
                if (tsNum > 1600000000) { // > Sept 2020
                    timestamp = tsNum;
                    debugSource = 'FALLBACK'; // Usando conversationTimestamp por unreadCount
                }
            }
            // Explicit check for valid number
            const finalTimestamp = Number(timestamp);
            if (lastMsg && lastMsg.message) {
                const m = lastMsg.message;
                content = m.conversation ||
                    m.extendedTextMessage?.text ||
                    m.imageMessage?.caption || (m.imageMessage ? '📷 Foto' : '') ||
                    m.videoMessage?.caption || (m.videoMessage ? '🎥 Video' : '') ||
                    m.audioMessage?.caption || (m.audioMessage ? '🎵 Audio' : '') ||
                    m.stickerMessage?.caption || (m.stickerMessage ? '👾 Sticker' : '') ||
                    m.documentMessage?.caption || (m.documentMessage ? '📄 Documento' : '') ||
                    '...';
            }
            return {
                jid: chat.id,
                name: name,
                // Only use valid timestamps greater than 0
                timestamp: !isNaN(finalTimestamp) && finalTimestamp > 0 ? finalTimestamp : 0,
                unreadCount: chat.unreadCount || 0,
                isGroup: chat.id.endsWith('@g.us'),
                lastMessage: content,
                debugSource: debugSource // FIX-20260227-SORTING-DEBUG
            };
        })
            .sort((a, b) => (b.timestamp || 0) - (a.timestamp || 0));
    }
    // --- FIX: COMANDO PARA LIMPIAR STORE ---
    async clearStore() {
        console.log('Limpiando store (manteniendo sesión)...');
        try {
            // 1. Limpiar memoria
            if (this.store) {
                // No hay método oficial clear(), re-creamos
                // this.store.chats.clear() si existiera
            }
            // 2. Borrar archivo físico
            const storePath = path.join(this.authPath, 'baileys_store_multi.json');
            if (fs.existsSync(storePath)) {
                fs.unlinkSync(storePath);
            }
            // 3. Re-inicializar store vacío
            this.store = (0, store_fix_1.makeInMemoryStore)({ logger: (0, pino_1.default)({ level: 'silent' }) });
            if (this.sock) {
                this.store.bind(this.sock.ev);
            }
            // 4. Forzar resync simple (pidiendo historial de nuevo es complejo), 
            // mejor solo vaciar y dejar que entren nuevos o reiniciar extensión.
            this.emit('chats.update', []);
            console.log('Store limpiado.');
            return true;
        }
        catch (e) {
            console.error('Error limpiando store:', e);
            return false;
        }
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
    getMyselfJid() {
        // Normalizar el JID del usuario (eliminar :device@...)
        const id = this.sock?.user?.id;
        return id ? id.split(':')[0] + '@s.whatsapp.net' : undefined;
    }
    getChatMessages(jid, limit = 50) {
        if (!this.store || !this.store.messages)
            return [];
        const msgs = this.store.messages[jid];
        if (!msgs)
            return [];
        // Si es un array directo (nuestra impl simple) o un objeto con array (Baileys original)
        const msgList = Array.isArray(msgs) ? msgs : (msgs.array || []);
        // Devolver los últimos N mensajes
        return msgList.slice(-limit);
    }
    getContactName(jid) {
        if (!this.store)
            return jid.split('@')[0];
        // Normalizar JID para búsqueda en contactos
        const id = jid.split('@')[0] + '@s.whatsapp.net';
        const contact = this.store.contacts[id] || this.store.contacts[jid];
        return contact?.name || contact?.notify || contact?.verifiedName || jid.split('@')[0];
    }
}
exports.WhatsAppClient = WhatsAppClient;
//# sourceMappingURL=whatsapp-client.js.map