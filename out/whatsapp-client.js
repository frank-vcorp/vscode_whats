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
/**
 * @intervention IMPL-20260227-02
 * @see context/checkpoints/CHK_20260227_WAV2.md
 */
class WhatsAppClient extends events_1.default {
    sock;
    state;
    saveCreds;
    authPath;
    constructor(storagePath) {
        super();
        this.authPath = path.join(storagePath, 'whatsapp-auth');
        if (!fs.existsSync(this.authPath)) {
            fs.mkdirSync(this.authPath, { recursive: true });
        }
    }
    async connect() {
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
        });
        this.sock.ev.on('connection.update', async (update) => {
            const { connection, lastDisconnect, qr } = update;
            if (qr) {
                try {
                    const qrBase64 = await qrcode_1.default.toDataURL(qr);
                    this.emit('qr', qrBase64);
                }
                catch (err) {
                    console.error('Error generando QR:', err);
                }
            }
            if (connection === 'close') {
                const shouldReconnect = lastDisconnect?.error?.output?.statusCode !== baileys_1.DisconnectReason.loggedOut;
                console.log('Conexión cerrada:', lastDisconnect?.error, 'reintentando:', shouldReconnect);
                if (shouldReconnect) {
                    this.connect();
                }
            }
            else if (connection === 'open') {
                console.log('Conexión de WhatsApp abierta');
                this.emit('connected');
            }
        });
        this.sock.ev.on('creds.update', saveCreds);
        // Emitir mensajes para el historial si es necesario en el futuro
        this.sock.ev.on('messages.upsert', (m) => {
            if (m.type === 'notify') {
                this.emit('message', m.messages[0]);
            }
        });
    }
    getSocket() {
        return this.sock;
    }
}
exports.WhatsAppClient = WhatsAppClient;
//# sourceMappingURL=whatsapp-client.js.map