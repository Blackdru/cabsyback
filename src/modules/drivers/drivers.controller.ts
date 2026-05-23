import type { NextFunction, Request, Response } from 'express';
import type { OnboardDriverInput } from '../../shared/schemas';
import {
  getEarnings as getEarningsService,
  onboard as onboardService,
} from './drivers.service';

export async function onboard(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const userId = req.user!.userId;
    const body = req.body as OnboardDriverInput;
    const driver = await onboardService(userId, body);
    res.status(201).json({ driver });
  } catch (err) {
    next(err);
  }
}

export async function getEarnings(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const userId = req.user!.userId;
    const earnings = await getEarningsService(userId);
    res.status(200).json({ earnings });
  } catch (err) {
    next(err);
  }
}
