"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const http_1 = __importDefault(require("http"));
const express_1 = __importDefault(require("express"));
const cors_1 = __importDefault(require("cors"));
const helmet_1 = __importDefault(require("helmet"));
const env_1 = require("./config/env");
const logger_1 = require("./config/logger");
const client_1 = require("./db/client");
const socket_1 = require("./realtime/socket");
const error_1 = require("./middleware/error");
const scheduler_1 = require("./jobs/scheduler");
const rateLimit_1 = require("./middleware/rateLimit");
const validateEnv_1 = require("./utils/validateEnv");
const auth_routes_1 = __importDefault(require("./modules/auth/auth.routes"));
const users_routes_1 = __importDefault(require("./modules/users/users.routes"));
const drivers_routes_1 = __importDefault(require("./modules/drivers/drivers.routes"));
const rides_routes_1 = __importDefault(require("./modules/rides/rides.routes"));
const ratings_routes_1 = __importDefault(require("./modules/ratings/ratings.routes"));
// Validate environment before starting server
(0, validateEnv_1.validateOrExit)();
const app = (0, express_1.default)();
const corsOrigins = (env_1.env.CORS_ORIGINS ?? '')
    .split(',')
    .map((s) => s.trim())
    .filter((s) => s.length > 0);
// Empty whitelist + non-prod => allow all (dev convenience).
// Empty whitelist + prod => reject all (fail closed).
const allowAllOrigins = corsOrigins.length === 0 && env_1.env.NODE_ENV !== 'production';
app.use((0, helmet_1.default)());
app.use((0, cors_1.default)({
    origin: (incoming, cb) => {
        if (!incoming) {
            // Same-origin / curl / server-to-server — no Origin header.
            cb(null, true);
            return;
        }
        if (allowAllOrigins) {
            cb(null, true);
            return;
        }
        cb(null, corsOrigins.includes(incoming));
    },
    credentials: true,
}));
app.use(express_1.default.json());
app.use(rateLimit_1.apiLimiter);
app.get('/health', (_req, res) => {
    res.json({
        status: 'ok',
        uptime: process.uptime(),
        version: '1.0.0',
        environment: env_1.env.NODE_ENV,
        timestamp: new Date().toISOString(),
    });
});
app.get('/ready', async (_req, res) => {
    try {
        await client_1.pool.query('SELECT 1');
        res.json({ status: 'ready' });
    }
    catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        logger_1.logger.warn({ err: message }, 'readiness check failed');
        res.status(503).json({
            error: { code: 'NOT_READY', message: 'Dependencies unavailable' },
        });
    }
});
app.use('/auth/otp/request', rateLimit_1.otpRequestLimiter);
app.use('/auth/otp/verify', rateLimit_1.otpVerifyLimiter);
app.use('/auth/refresh', rateLimit_1.refreshLimiter);
app.use('/auth', auth_routes_1.default);
app.use('/me', users_routes_1.default);
app.use('/drivers', drivers_routes_1.default);
app.use('/rides', rides_routes_1.default);
app.use('/rides', ratings_routes_1.default);
app.use(error_1.errorHandler);
const httpServer = http_1.default.createServer(app);
const io = (0, socket_1.attachSocketServer)(httpServer);
let jobHandles = null;
httpServer.listen(env_1.env.PORT, () => {
    logger_1.logger.info(`Cabsy backend listening on :${env_1.env.PORT}`);
    jobHandles = (0, scheduler_1.startAllJobs)();
});
let shuttingDown = false;
async function shutdown(signal) {
    if (shuttingDown)
        return;
    shuttingDown = true;
    logger_1.logger.info({ signal }, 'shutdown initiated');
    const forceExit = setTimeout(() => {
        logger_1.logger.warn('shutdown timed out; forcing exit');
        process.exit(1);
    }, 10_000);
    forceExit.unref();
    try {
        if (jobHandles) {
            (0, scheduler_1.stopAllJobs)(jobHandles);
            jobHandles = null;
        }
        await new Promise((resolve) => {
            io.close(() => resolve());
        });
        await new Promise((resolve, reject) => {
            httpServer.close((err) => (err ? reject(err) : resolve()));
        });
        await client_1.pool.end().catch((err) => {
            const message = err instanceof Error ? err.message : String(err);
            logger_1.logger.warn({ err: message }, 'pg pool drain failed');
        });
        logger_1.logger.info('shutdown complete');
        process.exit(0);
    }
    catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        logger_1.logger.error({ err: message }, 'shutdown error');
        process.exit(1);
    }
}
process.on('SIGTERM', () => void shutdown('SIGTERM'));
process.on('SIGINT', () => void shutdown('SIGINT'));
// Last-resort safety nets. We log + exit on unhandled rejections rather than
// silently leaking errors; the orchestrator (k8s, ECS, fly.io) will restart us.
process.on('unhandledRejection', (reason) => {
    const message = reason instanceof Error ? reason.message : String(reason);
    logger_1.logger.error({ reason: message }, 'unhandledRejection');
    void shutdown('unhandledRejection');
});
process.on('uncaughtException', (err) => {
    logger_1.logger.error({ err: err.message, stack: err.stack }, 'uncaughtException');
    void shutdown('uncaughtException');
});
//# sourceMappingURL=server.js.map