import type { Socket } from 'socket.io';
import { logger } from '../../config/logger';
import { AppError } from '../../errors/AppError';
import * as bidService from '../../modules/bids/bids.service';
import { ClientEvents, Rooms } from '../../shared/events';
import { PlaceBidSchema, ReviseBidSchema } from '../../shared/schemas';

interface AckResponse {
  ok: boolean;
  data?: unknown;
  error?: { code: string; message: string; details?: unknown };
}
type Ack = ((response: AckResponse) => void) | undefined;

function safeAck(ack: Ack, response: AckResponse): void {
  if (typeof ack === 'function') ack(response);
}

export function registerBidHandlers(socket: Socket): void {
  socket.on(ClientEvents.DriverPlaceBid, async (payload: unknown, ack?: Ack) => {
    const parsed = PlaceBidSchema.safeParse(payload);
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
      const result = await bidService.placeBid(
        socket.data.userId,
        parsed.data.rideId,
        parsed.data.amount,
      );
      // Once the driver has bid, server-side join them to the ride room so they
      // receive subsequent ride:bidUpdate broadcasts (and ride:bidLost).
      socket.join(Rooms.ride(parsed.data.rideId));
      safeAck(ack, { ok: true, data: result });
    } catch (err) {
      if (err instanceof AppError) {
        safeAck(ack, {
          ok: false,
          error: { code: err.code, message: err.message, details: err.details },
        });
        return;
      }
      logger.error({ err, socketId: socket.id }, 'driver:placeBid failed');
      safeAck(ack, {
        ok: false,
        error: { code: 'INTERNAL', message: 'Internal error' },
      });
    }
  });

  socket.on(ClientEvents.DriverReviseBid, async (payload: unknown, ack?: Ack) => {
    const parsed = ReviseBidSchema.safeParse(payload);
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
      const result = await bidService.reviseBid(
        socket.data.userId,
        parsed.data.rideId,
        parsed.data.amount,
      );
      safeAck(ack, { ok: true, data: result });
    } catch (err) {
      if (err instanceof AppError) {
        safeAck(ack, {
          ok: false,
          error: { code: err.code, message: err.message, details: err.details },
        });
        return;
      }
      logger.error({ err, socketId: socket.id }, 'driver:reviseBid failed');
      safeAck(ack, {
        ok: false,
        error: { code: 'INTERNAL', message: 'Internal error' },
      });
    }
  });
}
