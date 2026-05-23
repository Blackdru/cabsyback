import type { Socket } from 'socket.io';
import { z } from 'zod';
import { logger } from '../../config/logger';
import { AppError, ForbiddenError } from '../../errors';
import * as bidService from '../../modules/bids/bids.service';
import * as rideService from '../../modules/rides/rides.service';
import { ClientEvents, Rooms } from '../../shared/events';
import {
  AcceptBidSchema,
  CancelRideSchema,
  CompleteRideSchema,
  StartRideSchema,
} from '../../shared/schemas';

interface AckResponse {
  ok: boolean;
  data?: unknown;
  error?: { code: string; message: string; details?: unknown };
}
type Ack = ((response: AckResponse) => void) | undefined;

function safeAck(ack: Ack, response: AckResponse): void {
  if (typeof ack === 'function') ack(response);
}

const JoinRideSchema = z.object({ rideId: z.string().uuid() });

export function registerRideHandlers(socket: Socket): void {
  // Documented extension to the spec: lets a rider socket subscribe to its own
  // ride room. Riders create rides via REST and otherwise wouldn't be in the
  // ride room when bids start arriving.
  socket.on(ClientEvents.RiderJoinRide, async (payload: unknown, ack?: Ack) => {
    const parsed = JoinRideSchema.safeParse(payload);
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
      const ride = await rideService.loadRideById(parsed.data.rideId);
      if (ride.riderId !== socket.data.userId) {
        throw new ForbiddenError('Not allowed to join this ride');
      }
      socket.join(Rooms.ride(ride.id));
      safeAck(ack, { ok: true });
    } catch (err) {
      if (err instanceof AppError) {
        safeAck(ack, {
          ok: false,
          error: { code: err.code, message: err.message, details: err.details },
        });
        return;
      }
      logger.error({ err, socketId: socket.id }, 'rider:joinRide failed');
      safeAck(ack, {
        ok: false,
        error: { code: 'INTERNAL', message: 'Internal error' },
      });
    }
  });

  socket.on(ClientEvents.RiderAcceptBid, async (payload: unknown, ack?: Ack) => {
    const parsed = AcceptBidSchema.safeParse(payload);
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
      // Defensive: ensure the rider socket is in the ride room before assignment
      // broadcasts go out. The canonical way is RiderJoinRide on bid screen open.
      socket.join(Rooms.ride(parsed.data.rideId));
      const result = await bidService.acceptBid(
        socket.data.userId,
        parsed.data.rideId,
        parsed.data.bidId,
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
      logger.error({ err, socketId: socket.id }, 'rider:acceptBid failed');
      safeAck(ack, {
        ok: false,
        error: { code: 'INTERNAL', message: 'Internal error' },
      });
    }
  });

  socket.on(ClientEvents.RiderCancelRide, async (payload: unknown, ack?: Ack) => {
    const parsed = CancelRideSchema.safeParse(payload);
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
      const result = await rideService.cancelRide(
        socket.data.userId,
        parsed.data.rideId,
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
      logger.error({ err, socketId: socket.id }, 'rider:cancelRide failed');
      safeAck(ack, {
        ok: false,
        error: { code: 'INTERNAL', message: 'Internal error' },
      });
    }
  });

  socket.on(ClientEvents.DriverStartRide, async (payload: unknown, ack?: Ack) => {
    const parsed = StartRideSchema.safeParse(payload);
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
      const result = await rideService.startRide(
        socket.data.userId,
        parsed.data.rideId,
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
      logger.error({ err, socketId: socket.id }, 'driver:startRide failed');
      safeAck(ack, {
        ok: false,
        error: { code: 'INTERNAL', message: 'Internal error' },
      });
    }
  });

  socket.on(ClientEvents.RideCompleteByDriver, async (payload: unknown, ack?: Ack) => {
    const parsed = CompleteRideSchema.safeParse(payload);
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
      const result = await rideService.completeRide(
        socket.data.userId,
        parsed.data.rideId,
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
      logger.error({ err, socketId: socket.id }, 'ride:completeByDriver failed');
      safeAck(ack, {
        ok: false,
        error: { code: 'INTERNAL', message: 'Internal error' },
      });
    }
  });
}
