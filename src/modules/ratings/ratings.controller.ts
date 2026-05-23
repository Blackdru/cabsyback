import type { NextFunction, Request, Response } from 'express';
import type { RateRideInput } from '../../shared/schemas';
import { rateRide } from './ratings.service';

export async function rate(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const userId = req.user!.userId;
    const rideId = req.params.id;
    if (!rideId) {
      res.status(400).json({ error: { code: 'VALIDATION_ERROR', message: 'rideId required' } });
      return;
    }
    const { stars, comment } = req.body as RateRideInput;
    const rating = await rateRide(userId, rideId, stars, comment);
    res.status(201).json({ rating });
  } catch (err) {
    next(err);
  }
}
