import type { NextFunction, Request, Response } from 'express';
import type { SetFcmTokenInput, UpdateMeInput } from '../../shared/schemas';
import { deleteUserAccount } from '../auth/auth.service';
import { getUserById, setFcmToken, updateUser } from './users.service';

export async function getMe(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const userId = req.user!.userId;
    const user = await getUserById(userId);
    res.status(200).json({ user });
  } catch (err) {
    next(err);
  }
}

export async function patchMe(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const userId = req.user!.userId;
    const body = req.body as UpdateMeInput;
    const user = await updateUser(userId, body);
    res.status(200).json({ user });
  } catch (err) {
    next(err);
  }
}

export async function patchFcmToken(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const userId = req.user!.userId;
    const body = req.body as SetFcmTokenInput;
    await setFcmToken(userId, body.token);
    res.status(204).send();
  } catch (err) {
    next(err);
  }
}

// DELETE /me — Right-to-erasure flow (GDPR / DPDP §16). Cascades user data.
// Historical rides are retained but the user row is deleted; the assigned
// driver's earnings reports remain intact.
export async function deleteMe(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const userId = req.user!.userId;
    await deleteUserAccount(userId);
    res.status(204).send();
  } catch (err) {
    next(err);
  }
}
