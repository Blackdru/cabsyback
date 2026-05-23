"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.attachSocketServer = attachSocketServer;
exports.getIo = getIo;
const socket_io_1 = require("socket.io");
const env_1 = require("../config/env");
const logger_1 = require("../config/logger");
const events_1 = require("../shared/events");
const jwt_1 = require("../utils/jwt");
const handlers_1 = require("./handlers");
let ioRef = null;
function extractToken(socket) {
    const auth = socket.handshake.auth;
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
function attachSocketServer(httpServer) {
    // Mirror HTTP CORS policy on Socket.IO: in prod, only the configured
    // origins; in dev, allow all. Locked down because socket events bypass
    // the HTTP CORS check and would otherwise be CSRF-exploitable.
    const corsOrigins = (env_1.env.CORS_ORIGINS ?? '')
        .split(',')
        .map((s) => s.trim())
        .filter((s) => s.length > 0);
    const allowAll = corsOrigins.length === 0 && env_1.env.NODE_ENV !== 'production';
    const io = new socket_io_1.Server(httpServer, {
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
            const payload = (0, jwt_1.verifyAccessToken)(token);
            socket.data.userId = payload.sub;
            socket.data.role = payload.role;
            next();
        }
        catch (err) {
            logger_1.logger.warn({ err, socketId: socket.id }, 'socket auth failed');
            next(new Error('UNAUTHORIZED'));
        }
    });
    io.on('connection', (socket) => {
        const { userId, role } = socket.data;
        socket.join(events_1.Rooms.user(userId));
        logger_1.logger.info({ socketId: socket.id, userId, role }, 'socket connected');
        (0, handlers_1.registerHandlers)(socket);
        socket.on('disconnect', (reason) => {
            // Drivers are NOT auto-set offline on disconnect: they may reconnect with
            // a new socket within seconds. The stale-driver pruner GCs abandoned ones.
            logger_1.logger.info({ socketId: socket.id, userId, role, reason }, 'socket disconnected');
        });
    });
    return io;
}
function getIo() {
    if (!ioRef) {
        throw new Error('Socket.IO server not initialised. Call attachSocketServer first.');
    }
    return ioRef;
}
//# sourceMappingURL=socket.js.map