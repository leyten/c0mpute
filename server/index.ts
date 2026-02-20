import { readFileSync } from 'fs';
import { resolve } from 'path';
import { createServer } from 'http';
import { Server } from 'socket.io';
import { Orchestrator } from '../lib/orchestrator/orchestrator';
import { ServerToClientEvents, ClientToServerEvents } from '../lib/orchestrator/types';

// Load .env.local for Privy secrets (not auto-loaded by tsx)
try {
  const envFile = readFileSync(resolve(process.cwd(), '.env.local'), 'utf8');
  for (const line of envFile.split('\n')) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    const eqIdx = trimmed.indexOf('=');
    if (eqIdx === -1) continue;
    const key = trimmed.slice(0, eqIdx);
    const value = trimmed.slice(eqIdx + 1);
    if (key && !process.env[key]) {
      process.env[key] = value;
    }
  }
} catch {
  console.warn('[Server] Could not load .env.local — relying on environment variables');
}

const PORT = process.env.PORT || process.env.SOCKET_PORT || 3001;

const httpServer = createServer((req, res) => {
  if (req.url === '/health') {
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ status: 'ok' }));
    return;
  }
  res.writeHead(404);
  res.end();
});

const io = new Server<ClientToServerEvents, ServerToClientEvents>(httpServer, {
  cors: {
    origin: process.env.ALLOWED_ORIGINS
      ? process.env.ALLOWED_ORIGINS.split(',')
      : ['http://localhost:3000', 'https://c0mpute.ai', 'https://www.c0mpute.ai'],
    methods: ['GET', 'POST'],
    credentials: true,
  },
});

const orchestrator = new Orchestrator(io);

httpServer.listen(PORT, () => {
  console.log(`
  ╔═══════════════════════════════════════════════════════════╗
  ║                                                           ║
  ║   C0MPUTE Orchestrator Server                             ║
  ║                                                           ║
  ║   WebSocket server running on port ${PORT}                   ║
  ║   Health check: http://localhost:${PORT}/health              ║
  ║                                                           ║
  ╚═══════════════════════════════════════════════════════════╝
  `);
});

process.on('SIGTERM', () => {
  console.log('SIGTERM received, shutting down...');
  httpServer.close(() => {
    console.log('Server closed');
    process.exit(0);
  });
});

process.on('SIGINT', () => {
  console.log('SIGINT received, shutting down...');
  httpServer.close(() => {
    console.log('Server closed');
    process.exit(0);
  });
});
