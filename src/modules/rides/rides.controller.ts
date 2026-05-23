import type { NextFunction, Request, RequestHandler, Response } from 'express';
import { logger } from '../../config/logger';
import type { CreateRideInput, HistoryQueryInput } from '../../shared/schemas';
import { dispatchRide } from '../../services/dispatch';
import {
  createRide as createRideService,
  getRideForUser,
  getRideHistoryForUser,
} from './rides.service';

function asyncHandler(
  fn: (req: Request, res: Response, next: NextFunction) => Promise<void>,
): RequestHandler {
  return (req, res, next) => {
    fn(req, res, next).catch(next);
  };
}

export const createRide: RequestHandler = asyncHandler(async (req, res) => {
  const userId = req.user!.userId;
  const body = req.body as CreateRideInput;

  const result = await createRideService(userId, body);

  // Fire-and-forget: dispatch should not block the rider's POST response.
  void dispatchRide(result.rideId).catch((err: unknown) => {
    const message = err instanceof Error ? err.message : String(err);
    logger.error({ err: message, rideId: result.rideId }, 'dispatchRide failed');
  });

  res.status(200).json(result);
});

export const getRide: RequestHandler = asyncHandler(async (req, res) => {
  const userId = req.user!.userId;
  const rideId = req.params.id;
  if (!rideId) {
    res.status(400).json({ error: { code: 'BAD_REQUEST', message: 'Missing ride id' } });
    return;
  }
  const ride = await getRideForUser(userId, rideId);
  res.status(200).json({ ride });
});

export const getRideHistory: RequestHandler = asyncHandler(async (req, res) => {
  const userId = req.user!.userId;
  const query = req.query as unknown as HistoryQueryInput;
  const page = await getRideHistoryForUser(userId, {
    cursor: query.cursor,
    limit: query.limit,
  });
  res.status(200).json(page);
});
