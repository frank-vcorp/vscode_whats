# context/00_ARQUITECTURA.md - WhatsApp for VS Code

**ID:** ARCH-20260227-01
**Estado:** [~] Borrador inicial

## 🛠️ Stack Tecnológico Producido
- **Extensión VS Code**: TypeScript / Node.js
- **Frontend**: VS Code Webview API (Iframe/WebviewViewProvider)
- **Servicio Interno**: `web.whatsapp.com` (Sincronización QR nativa)

## 🧩 Patrón de Diseño
- **WebviewViewProvider**: Para inyectar WhatsApp Web en una barra lateral persistente (Sidebar).
- **Inyección de CSS**: Inyectar estilos CSS al Webview para que los colores de WA Web coincidan con el tema de VS Code del usuario.
- **Bridge de Datos**: Comunicación vía API de Webview para leer la historia de mensajes (solo si se necesita para Copilot) y guardarla en un archivo local en la carpeta `context/`.

## 📂 Archivos Clave
- `src/extension.ts`: Punto de entrada.
- `src/whatsapp-provider.ts`: Lógica de la barra lateral.
- `resources/styles.css`: Estilos que inyectaremos.
- `context/...whats_history.md`: Buffer donde guardaremos el historial para que Copilot pueda leerlo.

## 🚧 Riesgos
- **WA Web Updates**: Si WhatsApp cambia sus clases CSS (ej. `.chat-list`), el tema inyectado podría verse mal.
- **Seguridad**: Nunca guardaremos credenciales, usaremos el mismo sistema de WhatsApp Web (SessionStorage/Cookies del Webview nativo).
