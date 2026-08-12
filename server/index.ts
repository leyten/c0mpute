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
  if (req.url === '/api/network') {
    // the network-map feed. Dial IPs (geo-lookup input) are served ONLY to loopback — the
    // feed generator on this box; any remote caller gets the public (identity-free) shape.
    const ra = req.socket.remoteAddress ?? '';
    const loopback = ra === '127.0.0.1' || ra === '::1' || ra === '::ffff:127.0.0.1';
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify(orchestrator.getShardNetwork(loopback)));
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

// Last line of defence. Every socket handler is a public entry point on a
// permissionless network, so one malformed payload must never be able to take
// the process down: in-memory job state is the product, and a crash drops every
// worker and every charged, in-flight answer at once. Payloads are validated at
// each handler; this catches whatever slips through, loudly, without exiting.
process.on('unhandledRejection', (reason) => {
  console.error('[Server] UNHANDLED REJECTION — a handler threw and was not caught:', reason);
});
process.on('uncaughtException', (err) => {
  console.error('[Server] UNCAUGHT EXCEPTION — a handler threw and was not caught:', err);
});

// httpServer.close() waits for open connections to end, and this server's whole
// job is long-lived websockets — its callback never fired, so every restart hung
// until systemd's SIGKILL and lost up to 2 minutes of unpersisted reputation.
// Close socket.io first (it disconnects clients), flush, then exit on a deadline.
let shuttingDown = false;
const shutdown = (signal: string) => {
  if (shuttingDown) return;
  shuttingDown = true;
  console.log(`${signal} received, shutting down...`);
  try {
    orchestrator.persistReputation();
  } catch (err) {
    console.error('[Server] Failed to flush reputation on shutdown:', err);
  }
  io.close(() => {
    httpServer.close(() => {
      console.log('Server closed');
      process.exit(0);
    });
  });
  setTimeout(() => {
    console.warn('[Server] Shutdown deadline reached, exiting.');
    process.exit(0);
  }, 4000).unref();
};

process.on('SIGTERM', () => shutdown('SIGTERM'));
process.on('SIGINT', () => shutdown('SIGINT'));
