import { WebSocketServer } from 'ws';
import { setupWSConnection } from 'y-websocket/bin/utils';

const wss = new WebSocketServer({ port: 1234 });

wss.on('connection', (conn, req) => {
  const url = req.url.slice(1);
  setupWSConnection(conn, req, { docName: url });
});

console.log("🟢 WebSocket server running at ws://localhost:1234");
