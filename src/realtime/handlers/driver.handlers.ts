import type { Socket } from 'socket.io';
import { logger } from '../../config/logger';
import { AppError } from '../../errors/AppError';
import * as bidService from '../../modules/bids/bids.service';
import * as driverService from '../../modules/drivers/drivers.service';
import { ClientEvents } from '../../shared/events';
import { LocationUpdateSchema } from '../../shared/schemas';

interface AckResponse {
  ok: boolean;
  data?: unknown;
  error?: { code: string; message: string; details?: unknown };
}
type Ack = ((response: AckResponse) => void) | undefined;

function safeAck(ack: Ack, response: AckResponse): void {
  if (typeof ack === 'function') ack(response);
}

const LOCATION_UPDATE_MIN_INTERVAL_MS = 1000;

export function registerDriverHandlers(socket: Socket): void {
  socket.on(ClientEvents.DriverGoOnline, async (_payload: unknown, ack?: Ack) => {
    try {
      await driverService.goOnline(socket.data.userId);
      safeAck(ack, { ok: true });
    } catch (err) {
      if (err instanceof AppError) {
        safeAck(ack, {
          ok: false,
          error: { code: err.code, message: err.message, details: err.details },
        });
        return;
      }
      logger.error({ err, socketId: socket.id }, 'driver:goOnline failed');
      safeAck(ack, {
        ok: false,
        error: { code: 'INTERNAL', message: 'Internal error' },
      });
    }
  });

  socket.on(ClientEvents.DriverGoOffline, async (_payload: unknown, ack?: Ack) => {
    try {
      const userId = socket.data.userId;
      const driver = await driverService.getDriverByUserId(userId);
      if (driver) {
        await driverService.goOffline(userId);
        await bidService.withdrawAllBidsForDriver(driver.id);
      }
      safeAck(ack, { ok: true });
    } catch (err) {
      if (err instanceof AppError) {
        safeAck(ack, {
          ok: false,
          error: { code: err.code, message: err.message, details: err.details },
        });
        return;
      }
      logger.error({ err, socketId: socket.id }, 'driver:goOffline failed');
      safeAck(ack, {
        ok: false,
        error: { code: 'INTERNAL', message: 'Internal error' },
      });
    }
  });

  socket.on(ClientEvents.DriverLocationUpdate, async (payload: unknown, ack?: Ack) => {
    // Server-side rate limit: drop silently if a previous update landed within the window.
    const now = Date.now();
    const last = socket.data.lastLocationUpdateMs ?? 0;
    if (now - last < LOCATION_UPDATE_MIN_INTERVAL_MS) {
      return;
    }
    socket.data.lastLocationUpdateMs = now;

    const parsed = LocationUpdateSchema.safeParse(payload);
    if (!parsed.success) {
      safeAck(ack, {
        ok: false,
        error: {
          code: 'VALIDATION_ERROR',
          message: 'Invalid payload',
          details: parsed.error.flatten(),
        },
      });
      return;
    }

    try {
      await driverService.updateLocation(socket.data.userId, parsed.data);
      safeAck(ack, { ok: true });
    } catch (err) {
      if (err instanceof AppError) {
        safeAck(ack, {
          ok: false,
          error: { code: err.code, message: err.message, details: err.details },
        });
        return;
      }
      logger.error({ err, socketId: socket.id }, 'driver:locationUpdate failed');
      safeAck(ack, {
        ok: false,
        error: { code: 'INTERNAL', message: 'Internal error' },
      });
    }
  });
}
