import http from 'http';
import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import { env } from './config/env';
import { logger } from './config/logger';
import { pool } from './db/client';
import { attachSocketServer } from './realtime/socket';
import { errorHandler } from './middleware/error';
import { startAllJobs, stopAllJobs, type JobHandles } from './jobs/scheduler';
import {
  apiLimiter,
  otpRequestLimiter,
  otpVerifyLimiter,
  refreshLimiter,
} from './middleware/rateLimit';
import { validateOrExit } from './utils/validateEnv';

import authRoutes from './modules/auth/auth.routes';
import usersRoutes from './modules/users/users.routes';
import driversRoutes from './modules/drivers/drivers.routes';
import ridesRoutes from './modules/rides/rides.routes';
import ratingsRoutes from './modules/ratings/ratings.routes';

// Validate environment before starting server
validateOrExit();

const app = express();

const corsOrigins = (env.CORS_ORIGINS ?? '')
  .split(',')
  .map((s) => s.trim())
  .filter((s) => s.length > 0);

// Empty whitelist + non-prod => allow all (dev convenience).
// Empty whitelist + prod => reject all (fail closed).
const allowAllOrigins = corsOrigins.length === 0 && env.NODE_ENV !== 'production';

app.use(helmet());
app.use(
  cors({
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
  }),
);
app.use(express.json());
app.use(apiLimiter);

app.get('/health', (_req, res) => {
  res.json({
    status: 'ok',
    uptime: process.uptime(),
    version: '1.0.0',
    environment: env.NODE_ENV,
    timestamp: new Date().toISOString(),
  });
});

app.get('/ready', async (_req, res) => {
  try {
    await pool.query('SELECT 1');
    res.json({ status: 'ready' });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    logger.warn({ err: message }, 'readiness check failed');
    res.status(503).json({
      error: { code: 'NOT_READY', message: 'Dependencies unavailable' },
    });
  }
});

app.use('/auth/otp/request', otpRequestLimiter);
app.use('/auth/otp/verify', otpVerifyLimiter);
app.use('/auth/refresh', refreshLimiter);
app.use('/auth', authRoutes);
app.use('/me', usersRoutes);
app.use('/drivers', driversRoutes);
app.use('/rides', ridesRoutes);
app.use('/rides', ratingsRoutes);

app.use(errorHandler);

const httpServer = http.createServer(app);
const io = attachSocketServer(httpServer);

let jobHandles: JobHandles | null = null;

httpServer.listen(env.PORT, () => {
  logger.info(`Cabsy backend listening on :${env.PORT}`);
  jobHandles = startAllJobs();
});

let shuttingDown = false;
async function shutdown(signal: string): Promise<void> {
  if (shuttingDown) return;
  shuttingDown = true;
  logger.info({ signal }, 'shutdown initiated');

  const forceExit = setTimeout(() => {
    logger.warn('shutdown timed out; forcing exit');
    process.exit(1);
  }, 10_000);
  forceExit.unref();

  try {
    if (jobHandles) {
      stopAllJobs(jobHandles);
      jobHandles = null;
    }
    await new Promise<void>((resolve) => {
      io.close(() => resolve());
    });
    await new Promise<void>((resolve, reject) => {
      httpServer.close((err) => (err ? reject(err) : resolve()));
    });
    await pool.end().catch((err: unknown) => {
      const message = err instanceof Error ? err.message : String(err);
      logger.warn({ err: message }, 'pg pool drain failed');
    });
    logger.info('shutdown complete');
    process.exit(0);
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    logger.error({ err: message }, 'shutdown error');
    process.exit(1);
  }
}

process.on('SIGTERM', () => void shutdown('SIGTERM'));
process.on('SIGINT', () => void shutdown('SIGINT'));

// Last-resort safety nets. We log + exit on unhandled rejections rather than
// silently leaking errors; the orchestrator (k8s, ECS, fly.io) will restart us.
process.on('unhandledRejection', (reason: unknown) => {
  const message = reason instanceof Error ? reason.message : String(reason);
  logger.error({ reason: message }, 'unhandledRejection');
  void shutdown('unhandledRejection');
});

process.on('uncaughtException', (err: Error) => {
  logger.error({ err: err.message, stack: err.stack }, 'uncaughtException');
  void shutdown('uncaughtException');
});
