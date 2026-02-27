# PROYECTO: WhatsApp for VS Code (v0.1.0)
**Estado:** [ ] No Iniciado | [/] En Progreso | [✓] Completado

## 📋 MICRO-SPRINT: Scaffolding Inicial de WA Sidebar
**Fecha:** 2026-02-27  
**ID:** IMPL-20260227-01  
**Duración estimada:** 4 horas  

### 🎯 Entregable Demostrable
> Extensión de VS Code que añade un icono de WhatsApp en el Sidebar y carga el QR oficial de WhatsApp Web al abrirlo.

### ✅ Tareas Técnicas
- [✓] Generar package.json con contribuciones [ ]
- [✓] Implementar extension.ts y WhatsAppViewProvider.ts [ ]
- [✓] Cargar web.whatsapp.com con permisos [ ]

### 🧪 Cómo Demostrar
1. Presionar F5 para iniciar la depuración.
2. Hacer clic en el icono de WhatsApp en la Activity Bar.
3. Verificar que aparece el QR de WhatsApp Web.

## 📋 Backlog de Funcionalidades

### Fase 1: Cimientos (Este Micro-Sprint)
- [✓] (3) Scaffolding de Extensión VS Code (TypeScript) [ ]
- [✓] (5) WebviewViewProvider para SideBar [ ]
- [✓] (3) Cargar URL de WhatsApp Web nativo en el Webview [ ]

### Fase 2: Experiencia e Inyección
- [ ] (5) CSS Injection: Tema Minimalista (Estilo VS Code Chat) [ ]
- [ ] (8) Bridge de Comunicación: Exportar últimos mensajes a archivo local `.whats_history.md` [ ]
- [ ] (5) Sistema de Notificaciones en VS Code [ ]

### Fase 3: Archivos y Copilot
- [ ] (5) Optimización de subida/bajada de archivos [ ]
- [ ] (8) Integración avanzada: Comandos para enviar código seleccionado a WA [ ]

## ⚠️ Deuda Técnica
| ID | Descripción | Impacto | Estado |
|----|-------------|---------|--------|
| DT-001 | Dependencia de las clases CSS de WA Web (frágil ante actualizaciones) | Medio | [ ] |
