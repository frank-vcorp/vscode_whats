# DICTAMEN TÉCNICO: FIX-20260227-DATE-SORTING

**ID:** FIX-20260227-DATE-SORTING
**Fecha:** 2026-02-27
**Autor:** Deby (Agente Forense)
**Estado:** Dictaminado

## 1. Análisis del Problema

### Síntomas Reportados
1.  **Ordenamiento Incorrecto:** Chats antiguos (ej. 2025) aparecen al inicio de la lista, mezclados con recientes.
2.  **Ambigüedad Visual:** La fecha se muestra como `dd/mm` (ej. `26/02`) sin indicar el año, haciendo indistinguible un chat de hoy (2026) vs uno de hace un año (2025).

### Causa Raíz

#### A. Ordenamiento (Backend `whatsapp-client.ts`)
La función `getChats()` determina el timestamp para ordenar usando esta lógica:

```typescript
if (lastMsg && lastMsg.messageTimestamp) {
    timestamp = lastMsg.messageTimestamp;
} else if (chat.conversationTimestamp) {
    timestamp = chat.conversationTimestamp;
}
```

El problema ocurre cuando `lastMsg` no está disponible o no tiene `messageTimestamp` (posible en chats sincronizados parcialmente o donde solo hubo actualizaciones de estado). En ese caso, se usa `chat.conversationTimestamp`.
Baileys actualiza `conversationTimestamp` en eventos que no siempre son mensajes nuevos (ej. actualizaciones de perfil, cambios en grupos). Esto hace que un chat "viejo" salte al tope de la lista con un timestamp reciente.

#### B. Visualización (Frontend `WhatsAppViewProvider.ts`)
El script de renderizado fuerza el formato ocultando el año si no es "hoy":

```javascript
document.write(isToday 
    ? date.toLocaleTimeString(...)
    : date.toLocaleDateString([], {day: '2-digit', month: '2-digit'}) // <--- FALTÓ EL AÑO
);
```

Esto causa que `26/02/2025` se vea igual a `26/02/2026`.

## 2. Solución Propuesta

### A. Corrección de Ordenamiento (`getChats` en `whatsapp-client.ts`)
Debemos priorizar la fecha del *último mensaje real* sobre el metadato de conversación, y ser más estrictos con el fallback.

1.  Prioridad 1: `lastMsg.messageTimestamp` (si existe mensaje real).
2.  Prioridad 2: `chat.lastMessageRecv.messageTimestamp` (si existe en el objeto chat).
3.  Fallback: `chat.conversationTimestamp`, PERO solo si no hay discrepancia masiva o si no hay otra opción.
    *   *Refinamiento:* Si `lastMsg` es un objeto vacío `{}` (que ocurre en el código actual), no debemos tratarlo como mensaje válido.

### B. Corrección de Visualización (`_renderChatList` en `WhatsAppViewProvider.ts`)
Modificar la lógica de visualización para incluir el año si la fecha no pertenece al año en curso.

```javascript
const isThisYear = date.getFullYear() === today.getFullYear();
// Si es hoy -> Hora
// Si es este año -> dd/mm
// Si es año anterior -> dd/mm/yy
```

## 3. Plan de Acción

1.  **Frontend:** Actualizar `_renderChatList` en `src/WhatsAppViewProvider.ts` para manejar lógica de año actual.
2.  **Backend:** Refinar la extracción de `timestamp` en `src/whatsapp-client.ts` para evitar falsos positivos con `conversationTimestamp` cuando no hay mensaje real asociado.

## 4. Archivos Afectados
- `src/whatsapp-client.ts`
- `src/WhatsAppViewProvider.ts`

---
**Firmado:** Deby
