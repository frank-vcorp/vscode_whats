# PROYECTO: WhatsApp for VS Code (v0.4.0 - Sales Agent & Contacts)
**Estado:** [/] En Progreso

## 📋 MICRO-SPRINT: Contactos Reales y Cerebro Comercial
**Fecha:** 2026-02-27  
**ID:** ARCH-20260227-04  
**Duración estimada:** 4 horas  

### 🎯 Entregable Demostrable
> Panel lateral con lista de chats recientes reales. Al seleccionar uno, se carga la conversación. Si un mensaje contiene palabras clave de venta (ej: "precio"), se resalta y ofrece un botón de "Generar Cotización".

### ✅ Tareas Técnicas
- [ ] Implementar `client.fetchChats` en Baileys para obtener lista real [ ]
- [ ] UI de Lista de Contactos (Avatar + Nombre + Último Mensaje) [ ]
- [ ] Lógica de selección de chat activo (Cargar historial del contacto) [ ]
- [ ] **Sales Detector**: Regex para palabras clave ("precio", "costo", "cotización") -> Resaltado dorado en UI [ ]
- [ ] Botón "Generar Cotización" -> Invoca comando de Copilot con prompt de ventas [ ]

### 🧪 Cómo Demostrar
1. Ver lista de chats reales en el Sidebar.
2. Abrir un chat con un mensaje de prueba "cuánto cuesta una web".
3. Ver que el mensaje brilla en dorado.
4. Pulsar el botón de cotización y ver el borrador generado.

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
- [/] (8) Subida/Descarga de archivos nativa [/]

## ⚠️ Deuda Técnica
| ID | Descripción | Impacto | Estado |
|----|-------------|---------|--------|
| DT-002 | Gestión de dependencias binarias (si aplica) | Alto | [ ] |
| DT-003 | Estabilidad ante cambios de protocolo de WA | Medio | [ ] |
