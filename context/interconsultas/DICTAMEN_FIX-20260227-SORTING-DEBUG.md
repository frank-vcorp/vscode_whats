# DICTAMEN TÉCNICO: FIX-20260227-SORTING-DEBUG

**ID:** FIX-20260227-SORTING-DEBUG
**Fecha:** 2026-02-27
**Responsable:** Deby (Forense)
**Estado:** Resuelto

## Problema
El usuario reportó que chats antiguos ("Gana más...") aparecían al inicio de la lista con fecha reciente (26/2), a pesar de que no había mensajes visibles nuevos.

## Análisis de Causa Raíz
1. **Mensajes de Protocolo:** La lógica de ordenamiento (`getChats`) iteraba sobre *todos* los mensajes del store para encontrar el último timestamp. WhatsApp envía mensajes de protocolo (ej: `senderKeyDistributionMessage`, `protocolMessage` para revocaciones) que tienen timestamps recientes pero no son visibles para el usuario. Estos mensajes "invisibles" estaban actualizando el timestamp del chat.
2. **Dependencia Rota:** Se descubrió que la librería `@whiskeysockets/baileys` en su versión instalada (`6.7.21`) no exportaba `makeInMemoryStore` como se esperaba, lo que causaba errores de compilación implícitos o comportamiento indefinido si se usaba una versión en caché incorrecta.

## Solución Aplicada

### 1. Filtrado de Mensajes Técnicos
Se modificó `src/whatsapp-client.ts` para ignorar mensajes de tipo:
- `protocolMessage`
- `senderKeyDistributionMessage`
- `messageStubType` (CIPHERTEXT, etc.)

Ahora, el timestamp del chat solo se actualiza si el último mensaje es un mensaje "real" (texto, imagen, etc.).

### 2. Implementación de Store Propio (`src/store-fix.ts`)
Dado que `makeInMemoryStore` no estaba disponible en la librería, se implementó una versión ligera y robusta en `src/store-fix.ts` que mantiene:
- Chats, Contactos y Mensajes en memoria.
- Persistencia a archivo JSON (`baileys_store_multi.json`).
- Compatibilidad con la estructura de eventos de Baileys.

### 3. Herramientas de Debugging
- **Debug Visual:** En la lista de chats, ahora aparece una etiqueta `[MSG]`, `[META]`, o `[FALLBACK]` en color rojo (solo visible si `debugSource` está presente) indicando de dónde se obtuvo la fecha del chat.
- **Limpieza de Cache:** Se agregó el comando `WhatsApp: Limpiar Cache de Mensajes` (`whatsapp.clearStore`) que permite borrar el archivo JSON y reiniciar la memoria del store sin perder la sesión de autenticación.

## Verificación
- Compilación exitosa (`npm run compile`).
- El orden del chat ahora debería respetar estrictamente el último mensaje visible.
- Si un chat sigue apareciendo arriba incorrectamente, la etiqueta `[DEBUG]` nos dirá por qué.

---
**Nota:** Si el problema persiste con `[MSG]`, significa que hay un mensaje real pero "vacío" o mal interpretado. Si dice `[META]`, es metadata del chat. Si dice `[FALLBACK]`, es por `unreadCount > 0`.
