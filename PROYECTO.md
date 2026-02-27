# PROYECTO: WhatsApp for VS Code (v0.2.0 - Cliente Nativo)
**Estado:** [/] En Progreso

## 📋 MICRO-SPRINT: Implementación de Baileys (Conexión)
**Fecha:** 2026-02-27  
**ID:** ARCH-20260227-02  
**Duración estimada:** 4 horas  

### 🎯 Entregable Demostrable
> La extensión muestra un código QR generado localmente en el Sidebar y, al escanearlo, confirma la conexión exitosa en la terminal de salida de VS Code.

### ✅ Tareas Técnicas
- [✓] Configurar `@whiskeysockets/baileys` y dependencias [✓]
- [✓] Implementar gestor de sesiones WA Local [✓]
- [✓] Generar QR en formato base64 para el Webview [✓]
- [✓] Crear el "Copilot Bridge" (archivo `context/whats_history.md`) [✓]

### 🧪 Cómo Demostrar
1. Ejecutar extensión (F5).
2. Ver que aparece un código QR distinto al oficial (estilo local).
3. Escanear y ver el log de "Conectado" en VS Code.

## 📋 Backlog de Funcionalidades

### Fase 1: Conectividad y QR (Este Micro-Sprint)
- [ ] (8) Integración de `baileys` en el backend de la extensión [ ]
- [ ] (5) Generador de QR en Sidebar (Base64/SVG) [ ]
- [ ] (3) Persistencia de sesión multidevice [ ]

### Fase 2: Interfaz Nativa (VS Code UI)
- [✓] (8) Chat UI con `vscode-webview-ui-toolkit` [✓]
- [ ] (5) Notificaciones de sistema [ ]
- [✓] (5) Buffer de chat local para Copilot [✓]

### Fase 3: Inteligencia y Archivos
- [✓] (13) Botón "Responder con Copilot" [✓]
- [ ] (8) Subida/Descarga de archivos nativa [ ]

## ⚠️ Deuda Técnica
| ID | Descripción | Impacto | Estado |
|----|-------------|---------|--------|
| DT-002 | Gestión de dependencias binarias (si aplica) | Alto | [ ] |
| DT-003 | Estabilidad ante cambios de protocolo de WA | Medio | [ ] |
