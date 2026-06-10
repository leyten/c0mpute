import './load-env'; // MUST be first — loads .env.local before any env-derived const evaluates
import { createServer } from 'http';
import { Server } from 'socket.io';
import { Orchestrator } from '../lib/orchestrator/orchestrator';
import { ServerToClientEvents, ClientToServerEvents } from '../lib/orchestrator/types';
import { STAKER_ALLOWANCE_ENABLED, STAKER_ALLOWANCE_ALLOWLIST } from '../lib/tokenomics';

const PORT = process.env.PORT || process.env.SOCKET_PORT || 3001;
console.log(
  `[Server] Staker allowance: ${STAKER_ALLOWANCE_ENABLED ? 'ON' : 'off'}` +
    (STAKER_ALLOWANCE_ENABLED ? ` (allowlist: ${STAKER_ALLOWANCE_ALLOWLIST.length || 'all stakers'})` : '')
);

const httpServer = createServer((req, res) => {
  if (req.url === '/health') {
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ status: 'ok' }));
    return;
  }
  if (req.url === '/api/stats') {
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify(orchestrator.getPublicStats()));
    return;
  }
  res.writeHead(404);
  res.end();
});

const io = new Server<ClientToServerEvents, ServerToClientEvents>(httpServer, {
  // Image jobs return a full PNG as base64 (~2MB for 1024², more at higher res).
  // The default 1MB cap silently closes the socket mid-transfer ("transport
  // close"), so raise it well above any single render.
  maxHttpBufferSize: 16 * 1024 * 1024,
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
