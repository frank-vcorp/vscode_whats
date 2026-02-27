# PROYECTO: WhatsApp for VS Code (v0.5.2 - Status Bar & Polish)
**Estado:** [✓] Completado

## 📋 MICRO-SPRINT: Integración en Status Bar
**Fecha:** 2026-02-27  
**ID:** IMPL-20260227-07  
**Duración estimada:** 2 horas  
**Estado:** [✓] Completado

### ⚠️ Hotfix Critical Crash
**ID:** FIX-20260227-CRASH
**Estado:** [✓] Resuelto
- [✓] Downgrade de baileys a v6.7.21 (stable)
- [✓] Implementación manual de Store (evita lista vacía)
- [✓] Configuración de browser (evita desconexiones)

### 🎯 Entregable Demostrable
> Icono de WhatsApp en la Status Bar (barra inferior) que muestra el contador de mensajes no leídos. Al hacer clic, abre/cierra el Sidebar. Las notificaciones invasivas (popups) están eliminadas.

### ✅ Tareas Técnicas
- [✓] Implementar `vscode.window.createStatusBarItem` [✓]
- [✓] Lógica de contador de mensajes no leídos (desde Baileys) [✓]
- [✓] Comando `whatsapp.focus` para abrir el Sidebar desde la Status Bar [✓]
- [✓] Eliminar `vscode.window.showInformationMessage` para mensajes nuevos [✓]

### 🧪 Cómo Demostrar
1. Ver el icono `$(comment-discussion)` en la barra inferior (derecha, junto a notificaciones).
2. Recibir mensajes y ver que el contador sube: `$(comment-discussion) 3`.
3. Hacer clic en el icono y ver que se despliega automáticamente el Sidebar de WhatsApp.

### 🎯 Entregable Demostrable
> La extensión muestra notificaciones nativas en VS Code al llegar un mensaje y permite adjuntar archivos locales del ordenador para enviarlos por el chat.

### ✅ Tareas Técnicas
- [✓] Implementar `vscode.window.showInformationMessage` para nuevos chats [✓]
- [✓] Botón de "Adjuntar Archivo" en Sidebar (Uso de `vscode.window.showOpenDialog`) [✓]
- [✓] Lógica de envío de archivos (Media) con Baileys [✓]
- [✓] Registro de archivos en `whats_history.md` [✓]

### 🧪 Cómo Demostrar
1. Al recibir un mensaje con la vista oculta, aparece un popup abajo a la derecha.
2. Hacer clic en "Ver Chat" y que la barra lateral de WhatsApp se enfoque.
3. El botón del clip permite elegir una imagen o documento y enviarlo.
4. `whats_history.md` muestra el registro: `**[Yo]:** [Archivo: nombre.pdf]`.

## 📋 Backlog de Funcionalidades

### Fase 1: Conectividad y QR (Completado)
- [✓] (8) Integración de `baileys` en el backend de la extensión [✓]
- [✓] (5) Generador de QR en Sidebar (Base64/SVG) [✓]
- [✓] (3) Persistencia de sesión multidevice [✓]

### Fase 2: Interfaz Nativa (VS Code UI)
- [✓] (8) Chat UI con `vscode-webview-ui-toolkit` [✓]
- [✓] (5) Notificaciones de sistema [✓]
- [✓] (5) Buffer de chat local para Copilot [✓]

### Fase 3: Inteligencia y Archivos
- [✓] (13) Botón "Responder con Copilot" [✓]
- [✓] (8) Subida/Descarga de archivos nativa [✓]

## ⚠️ Deuda Técnica Crítica & Seguridad (MITIGADA)
| ID | Descripción | Prioridad | Estado |
|----|-------------|-----------|--------|
| SEC-001 | **XSS/Inyección en Webview**: Eliminados `onclick` por event listeners y data-attributes | **P0 (Crítica)** | [✓] |
| SEC-002 | **Storage Incorrecto**: Migrado a `globalStorageUri` | **P1 (Bloqueante)** | [✓] |
| FIX-001 | **Reconexión Inestable**: Implementado debounce y limpieza de listeners | **P1 (Bloqueante)** | [✓] |
| SEC-003 | **CSP Faltante**: Agregada Content Security Policy estricta | **P1 (Seguridad)** | [✓] |

## ⚠️ Deuda Técnica
| ID | Descripción | Impacto | Estado |
|----|-------------|---------|--------|
| DT-002 | Gestión de dependencias binarias (si aplica) | Alto | [ ] |
| DT-003 | Estabilidad ante cambios de protocolo de WA | Medio | [ ] |
