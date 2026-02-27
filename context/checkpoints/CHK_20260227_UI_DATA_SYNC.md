# Checkpoint: Corrección UI y Sincronización de Datos

**Fecha:** 2026-02-27  
**Agente:** SOFIA (Builder)  
**ID:** CHK_20260227_UI_DATA_SYNC.md

## Tarea(s) Abordada(s)
- **Fix Alineación**: Mensajes propios ahora aparecen a la derecha.
- **Fix Historial**: Al abrir un chat, se cargan los últimos 50 mensajes del store.
- **Fix Nombres**: Mejor resolución de nombres de contacto en lista y header.

## Cambios Realizados

### 1. `src/whatsapp-client.ts`
- **Habilitado acceso al historial**: Implementado `getChatMessages(jid)` que consulta `store.messages`.
- **Identidad**: Implementado `getMyselfJid()` para validación robusta de remitente.
- **Contactos**: Centralizado `getContactName(jid)` con normalización de IDs.

### 2. `src/WhatsAppViewProvider.ts`
- **Renderizado**: Actualizado `_renderConversation` para mostrar el nombre real del contacto en el header.
- **Lógica de Carga**: Al hacer click en un chat (`selectChat`), se invoca `loadHistoryForChat`.
- **CSS Classes**: La clase `sent` vs `received` ahora se decide correctamente comparando `fromMe` y `myselfJid`.

## Decisiones Técnicas
- **Límite de 50 mensajes**: Para mantener la performance de la Webview ligera, solo cargamos los últimos 50 mensajes del historial.
- **Cache Local**: Se mantiene `messagesCache` en el Provider para la sesión de UI, pero se hidrata desde el `store` persistente al abrir chats.

## Soft Gates
- [x] Compilación limpia
- [x] Lógica de negocio (Alineación, Nombres, Historial)
- [x] Sin errores de linter

## Próximos Pasos
- Verificar si el usuario necesita cargar *más* historial (paginación/scroll up). Actualmente solo carga los últimos 50.
