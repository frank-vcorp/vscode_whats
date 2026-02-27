# Checkpoint: Implementación de Notificaciones en StatusBar

**Fecha:** 2026-02-27  
**Agente:** SOFIA (Builder)  
**ID:** IMPL-20260227-07  

## Tarea Abordada
El usuario solicitó notificaciones no intrusivas para los mensajes de WhatsApp, reemplazando los `showInformationMessage` por un contador en la barra de estado.

## Cambios Realizados
1.  **Extension.ts**:
    -   Se creó un `StatusBarItem` con el icono `$(comment-discussion)`.
    -   Se eliminó `vscode.window.showInformationMessage` en el listener de mensajes.
    -   Se implementó lógica para incrementar un contador de mensajes no leídos.
    -   Se resetea el contador al abrir la vista de WhatsApp.

2.  **WhatsAppViewProvider.ts**:
    -   Se expuso el evento `onDidChangeVisibility` para que `extension.ts` pueda reaccionar a la apertura de la vista.

3.  **Package.json**:
    -   Se registró el comando `whatsapp.focus`.

## Decisiones Técnicas
-   Se utiliza `vscode.StatusBarAlignment.Right` para la ubicación del item.
-   Se mantiene el contador local en `extension.ts` ya que es una preocupación de la UI global de VS Code, no interna de la webview.
-   Se usa el evento `onDidChangeVisibility` nativo del WebviewView.

## Soft Gates
-   [ ] Compilación OK
-   [ ] Testing Manual (Verificar que aparece el icono y cuenta)
-   [ ] Documentación actualizada

## Próximos Pasos
-   Verificar si se desea persistir el contador entre reinicios (actualmente se pierde, lo cual es aceptable para notificaciones efímeras).
