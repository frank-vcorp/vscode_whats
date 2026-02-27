import makeWASocket, { 
    DisconnectReason, 
    useMultiFileAuthState, 
    fetchLatestBaileysVersion, 
    makeCacheableSignalKeyStore 
} from '@whiskeysockets/baileys';
import { Boom } from '@hapi/boom';
import EventEmitter from 'events';
import pino from 'pino';
import QRCode from 'qrcode';
import * as path from 'path';
import * as fs from 'fs';

/**
 * @intervention IMPL-20260227-02
 * @see context/checkpoints/CHK_20260227_WAV2.md
 */

export class WhatsAppClient extends EventEmitter {
    private sock: any;
    private state: any;
    private saveCreds: any;
    private authPath: string;

    constructor(storagePath: string) {
        super();
        this.authPath = path.join(storagePath, 'whatsapp-auth');
        if (!fs.existsSync(this.authPath)) {
            fs.mkdirSync(this.authPath, { recursive: true });
        }
    }

    async connect() {
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
        });

        this.sock.ev.on('connection.update', async (update: any) => {
            const { connection, lastDisconnect, qr } = update;

            if (qr) {
                try {
                    const qrBase64 = await QRCode.toDataURL(qr);
                    this.emit('qr', qrBase64);
                } catch (err) {
                    console.error('Error generando QR:', err);
                }
            }

            if (connection === 'close') {
                const shouldReconnect = (lastDisconnect?.error as Boom)?.output?.statusCode !== DisconnectReason.loggedOut;
                console.log('Conexión cerrada:', lastDisconnect?.error, 'reintentando:', shouldReconnect);
                if (shouldReconnect) {
                    this.connect();
                }
            } else if (connection === 'open') {
                console.log('Conexión de WhatsApp abierta');
                this.emit('connected');
            }
        });

        this.sock.ev.on('creds.update', saveCreds);

        // Emitir mensajes para el historial si es necesario en el futuro
        this.sock.ev.on('messages.upsert', (m: any) => {
            if (m.type === 'notify') {
                this.emit('message', m.messages[0]);
            }
        });
    }

    getSocket() {
        return this.sock;
    }
}
