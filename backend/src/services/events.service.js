/**
 * Hub simples de Server-Sent Events (SSE) para enviar notificações ao vivo
 * ao painel do barbeiro sem precisar de WebSocket complexo.
 */
export function createEventHub() {
  const clients = new Set();

  function addClient(res) {
    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Connection', 'keep-alive');
    res.flushHeaders?.();

    res.write(`event: conectado\ndata: ${JSON.stringify({ ok: true })}\n\n`);
    clients.add(res);

    const heartbeat = setInterval(() => {
      try {
        res.write(': ping\n\n');
      } catch {
        clearInterval(heartbeat);
        clients.delete(res);
      }
    }, 25000);

    res.on('close', () => {
      clearInterval(heartbeat);
      clients.delete(res);
    });
  }

  function broadcast(eventName, payload) {
    const message = `event: ${eventName}\ndata: ${JSON.stringify(payload)}\n\n`;
    for (const res of clients) {
      try {
        res.write(message);
      } catch {
        clients.delete(res);
      }
    }
  }

  return { addClient, broadcast };
}
