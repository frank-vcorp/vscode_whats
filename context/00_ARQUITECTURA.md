# context/00_ARQUITECTURA.md - WhatsApp for VS Code (V2 - Headless)

**ID:** ARCH-20260227-02
**Estado:** [/] En construcción

## 🛠️ Stack Tecnológico Producido
- **Extensión VS Code**: TypeScript / Node.js
- **Motor de Conexión**: `@whiskeysockets/baileys` (Protocolo WhatsApp Socket)
- **Frontend**: VS Code Webview + `vscode-webview-ui-toolkit`
- **QR Engine**: `qrcode` (Generación de imagen local)

## 🧩 Patrón de Diseño
- **Backend (Extension Context)**: La extensión mantiene un socket persistente con WA. Al llegar un mensaje, lo procesa y lo envía al Webview vía `postMessage`.
- **Copilot Buffer**: Cada mensaje entrante es añadido al archivo `context/whats_history.md`.
- **UI Provider**: El `WhatsAppViewProvider` renderiza una interfaz personalizada que imita el Sidebar de VS Code.

## 📂 Estructura de Archivos
- `src/whatsapp-client.ts`: Clase que encapsula la lógica de Baileys.
- `src/WhatsAppViewProvider.ts`: Traduce eventos del cliente al Webview.
- `media/chat.js`: Lógica del lado del cliente (UI interactiva).
- `context/whats_history.md`: Historial plano para consumo de Copilot.

## 🚧 Riesgos
- **Binary Dependencies**: Baileys usa librerías que pueden requerir compilación.
- **WhatsApp Bans**: El uso de librerías de terceros siempre conlleva un riesgo si hay actividad inusual.
