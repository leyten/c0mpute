import { createServer } from 'http';
import { Server } from 'socket.io';
import { Orchestrator } from '../lib/orchestrator/orchestrator';
import { ServerToClientEvents, ClientToServerEvents } from '../lib/orchestrator/types';

// Railway uses PORT, fallback to SOCKET_PORT for local dev
const PORT = process.env.PORT || process.env.SOCKET_PORT || 3001;

// Create HTTP server
const httpServer = createServer((req, res) => {
  // Health check endpoint
  if (req.url === '/health') {
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ status: 'ok' }));
    return;
  }
  res.writeHead(404);
  res.end();
});

// Create Socket.IO server
const io = new Server<ClientToServerEvents, ServerToClientEvents>(httpServer, {
  cors: {
    origin: process.env.ALLOWED_ORIGINS 
      ? process.env.ALLOWED_ORIGINS.split(',') 
      : ['http://localhost:3000', 'https://c0mpute.vercel.app'],
    methods: ['GET', 'POST'],
    credentials: true,
  },
});

// Initialize orchestrator
const orchestrator = new Orchestrator(io);

// Start server
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

// Graceful shutdown
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
