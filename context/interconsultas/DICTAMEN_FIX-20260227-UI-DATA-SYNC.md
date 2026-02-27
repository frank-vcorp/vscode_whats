# 🩺 Dictamen Técnico: FIX-20260227-UI-DATA-SYNC

**ID:** FIX-20260227-UI-DATA-SYNC
**Agente:** SOFIA (Builder)
**Fecha:** 2026-02-27
**Estado:** ✅ Resuelto

---

## 1. Descripción del Problema
El usuario reportó tres problemas críticos en la experiencia de chat:
1. **Falta de Historial**: Al abrir un chat, solo se mostraban los mensajes nuevos recibidos en la sesión actual, ignorando el historial previo.
2. **Nombres Faltantes**: La lista de chats mostraba JIDs (números de teléfono) en lugar de nombres de contacto.
3. **Alineación Incorrecta**: Los mensajes enviados por el propio usuario aparecían alineados a la izquierda (como recibidos) en lugar de a la derecha.

---

## 2. Análisis de Causa Raíz

### 2.1 Historial
El `WhatsAppViewProvider` gestionaba los mensajes usando un caché volátil (`this.messagesCache`) que solo se alimentaba del evento `messages.upsert` en tiempo real. Al seleccionar un chat, no existía lógica para consultar el `store` persistente de Baileys (`store.messages`).

### 2.2 Nombres
La resolución de nombres en `getChats` era inconsistente y dependía de que la clave en `store.contacts` coincidiera exactamente con el JID del chat. Los JIDs de mensajes a veces vienen sin servidor (`@s.whatsapp.net`) o con dispositivo (`:1@...`), lo que causaba fallos en el lookup.

### 2.3 Alineación
La lógica para determinar si un mensaje era "mío" (`fromMe`) dependía exclusivamente de la propiedad `key.fromMe` en el evento `upsert`. Sin embargo, al recargar mensajes o procesar el historial, esta propiedad podía perderse o no verificarse contra la identidad del usuario conectado (`myselfJid`).

---

## 3. Solución Implementada

### 3.1 Carga de Historial
- Se implementó `WhatsAppClient.getChatMessages(jid, limit)` para recuperar los últimos 50 mensajes del store.
- En `WhatsAppViewProvider`, al evento `selectChat`, ahora se invoca `loadHistoryForChat(jid)`, que pre-llena el caché visual con datos históricos del store.

### 3.2 Normalización de Identidad
- Se creó `WhatsAppClient.getMyselfJid()` para exponer el ID del usuario autenticado.
- Se refinó la lógica `isMe` para comprobar tanto `msg.key.fromMe` como `msg.key.participant === myselfJid`.
- Esto garantiza que los mensajes propios (históricos o nuevos) se rendericen con la clase CSS `sent` (derecha).

### 3.3 Resolución Robusta de Contactos
- Se centralizó la lógica en `WhatsAppClient.getContactName(jid)`.
- Este helper normaliza el JID (quita sufijos de dispositivo) antes de buscar en `store.contacts`.
- Busca en orden de prioridad: `name` > `notify` > `verifiedName` > `JID corto`.

---

## 4. Validación (Soft Gates)

- ✅ **Compilación**: `npm run watch` sin errores.
- ✅ **Lógica Mensajes**: Verificado en código que `isMe` determina la clase CSS.
- ✅ **Persistencia**: El `store` ya estaba configurado para guardar en disco, ahora la UI lo lee correctamente.

---

## 5. Archivos Modificados
- `src/whatsapp-client.ts`: Nuevos métodos `getChatMessages`, `getMyselfJid`, `getContactName`.
- `src/WhatsAppViewProvider.ts`: Integración de carga de historial, uso de helpers de nombre y corrección de renderizado.
