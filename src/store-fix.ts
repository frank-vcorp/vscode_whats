import * as fs from 'fs';
import * as path from 'path';

// Minimal implementation of makeInMemoryStore compatible with Baileys usage
export function makeInMemoryStore(config: any) {
    const chats: any = {};
    const messages: any = {};
    const contacts: any = {};
    const state: any = { connection: 'close' };

    // Helper to get all chats as array
    Object.defineProperty(chats, 'all', {
        value: () => Object.values(chats),
        enumerable: false,
        configurable: true
    });

    const bind = (ev: any) => {
        ev.on('connection.update', (update: any) => {
            Object.assign(state, update);
        });

        ev.on('messaging-history.set', ({ chats: newChats, contacts: newContacts, messages: newMessages, isLatest }: any) => {
            if (newContacts) {
                 for (const contact of newContacts) {
                     contacts[contact.id] = Object.assign(contacts[contact.id] || {}, contact);
                 }
            }
            if (newChats) {
                 for (const chat of newChats) {
                     const old = chats[chat.id] || {};
                     const merged = { ...old, ...chat };
                     chats[chat.id] = merged;
                 }
            }
            if (newMessages) {
                 for (const msg of newMessages) {
                     const jid = msg.key.remoteJid;
                     if (jid) {
                        if (!messages[jid]) messages[jid] = [];
                        const exists = messages[jid].find((m: any) => m.key.id === msg.key.id);
                        if (!exists) {
                            messages[jid].push(msg);
                        }
                     }
                 }
                 // Sort
                 for (const jid in messages) {
                     messages[jid].sort((a: any, b: any) => (a.messageTimestamp || 0) - (b.messageTimestamp || 0));
                 }
            }
        });

        ev.on('contacts.upsert', (newContacts: any[]) => {
            for (const contact of newContacts) {
                contacts[contact.id] = Object.assign(contacts[contact.id] || {}, contact);
            }
        });

        ev.on('chats.upsert', (newChats: any[]) => {
            for (const chat of newChats) {
                const old = chats[chat.id] || {};
                const merged = { ...old, ...chat };
                // Ensure critical fields are updated
                if (chat.unreadCount !== undefined) merged.unreadCount = chat.unreadCount;
                if (chat.conversationTimestamp) merged.conversationTimestamp = chat.conversationTimestamp;
                chats[chat.id] = merged;
            }
        });

        ev.on('messages.upsert', ({ messages: newMessages, type }: any) => {
            if (type === 'append' || type === 'notify') {
                for (const msg of newMessages) {
                    const jid = msg.key.remoteJid;
                    if (!jid) continue;
                    
                    if (!messages[jid]) messages[jid] = [];
                    
                    const exists = messages[jid].find((m: any) => m.key.id === msg.key.id);
                    if (!exists) {
                        messages[jid].push(msg);
                        
                        // Update chat metadata locally
                        const chat = chats[jid] || { id: jid, unreadCount: 0 };
                        chat.lastMessageRecv = msg; 
                        
                        // Only update conversationTimestamp if it's new
                        if ((msg.messageTimestamp || 0) > (chat.conversationTimestamp || 0)) {
                            chat.conversationTimestamp = msg.messageTimestamp;
                        }
                        
                        if (!msg.key.fromMe) {
                            chat.unreadCount = (chat.unreadCount || 0) + 1;
                        }
                        chats[jid] = chat;
                    }
                }
            }
        });
    };

    return {
        chats,
        messages,
        contacts,
        state,
        bind,
        writeToFile: (filePath: string) => {
            try {
                const dir = path.dirname(filePath);
                if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
                const data = { chats, contacts, messages };
                fs.writeFileSync(filePath, JSON.stringify(data, null, 2));
            } catch (e) {
                console.error('Error writing store to file', e);
            }
        },
        readFromFile: (filePath: string) => {
            if (fs.existsSync(filePath)) {
                try {
                    const content = fs.readFileSync(filePath, 'utf8');
                    const data = JSON.parse(content);
                    Object.assign(chats, data.chats || {});
                    Object.assign(contacts, data.contacts || {});
                    if (data.messages) {
                        for (const jid in data.messages) {
                            messages[jid] = data.messages[jid];
                        }
                    }
                } catch (e) {
                    console.error('Error reading store file', e);
                }
            }
        }
    };
}
