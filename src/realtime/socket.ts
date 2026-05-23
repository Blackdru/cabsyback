import type { Server as HttpServer } from 'http';
import { Server as IOServer, type Socket } from 'socket.io';
import { env } from '../config/env';
import { logger } from '../config/logger';
import { Rooms } from '../shared/events';
import { verifyAccessToken } from '../utils/jwt';
import { registerHandlers } from './handlers';

declare module 'socket.io' {
  interface SocketData {
    userId: string;
    role: 'rider' | 'driver';
    lastLocationUpdateMs?: number;
  }
}

let ioRef: IOServer | null = null;

function extractToken(socket: Socket): string | null {
  const auth = socket.handshake.auth as { token?: unknown } | undefined;
  const fromAuth = auth?.token;
  if (typeof fromAuth === 'string' && fromAuth.length > 0) {
    return fromAuth;
  }
  const header = socket.handshake.headers.authorization;
  if (typeof header === 'string' && header.startsWith('Bearer ')) {
    return header.slice('Bearer '.length).trim() || null;
  }
  return null;
}

export function attachSocketServer(httpServer: HttpServer): IOServer {
  // Mirror HTTP CORS policy on Socket.IO: in prod, only the configured
  // origins; in dev, allow all. Locked down because socket events bypass
  // the HTTP CORS check and would otherwise be CSRF-exploitable.
  const corsOrigins = (env.CORS_ORIGINS ?? '')
    .split(',')
    .map((s) => s.trim())
    .filter((s) => s.length > 0);
  const allowAll = corsOrigins.length === 0 && env.NODE_ENV !== 'production';

  const io = new IOServer(httpServer, {
    cors: {
      origin: allowAll ? '*' : corsOrigins,
      credentials: true,
    },
  });

  ioRef = io;

  io.use((socket, next) => {
    const token = extractToken(socket);
    if (!token) {
      next(new Error('UNAUTHORIZED'));
      return;
    }
    try {
      const payload = verifyAccessToken(token);
      socket.data.userId = payload.sub;
      socket.data.role = payload.role;
      next();
    } catch (err) {
      logger.warn({ err, socketId: socket.id }, 'socket auth failed');
      next(new Error('UNAUTHORIZED'));
    }
  });

  io.on('connection', (socket) => {
    const { userId, role } = socket.data;
    socket.join(Rooms.user(userId));
    logger.info({ socketId: socket.id, userId, role }, 'socket connected');

    registerHandlers(socket);

    socket.on('disconnect', (reason) => {
      // Drivers are NOT auto-set offline on disconnect: they may reconnect with
      // a new socket within seconds. The stale-driver pruner GCs abandoned ones.
      logger.info(
        { socketId: socket.id, userId, role, reason },
        'socket disconnected',
      );
    });
  });

  return io;
}

export function getIo(): IOServer {
  if (!ioRef) {
    throw new Error('Socket.IO server not initialised. Call attachSocketServer first.');
  }
  return ioRef;
}
