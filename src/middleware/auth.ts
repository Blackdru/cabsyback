import type { Request, Response, NextFunction } from 'express';
import { verifyAccessToken, type Role } from '../utils/jwt';

declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace Express {
    interface Request {
      user?: { userId: string; role: Role };
    }
  }
}

export function requireAuth(req: Request, _res: Response, next: NextFunction): void {
  try {
    const header = req.headers.authorization;
    if (!header || !header.startsWith('Bearer ')) {
      throw new Error('Missing bearer token');
    }
    const token = header.slice('Bearer '.length).trim();
    if (!token) {
      throw new Error('Empty bearer token');
    }
    const payload = verifyAccessToken(token);
    req.user = { userId: payload.sub, role: payload.role };
    next();
  } catch {
    // TODO: replace with AppError once src/errors/ lands
    const err = new Error('Authentication required') as Error & {
      statusCode?: number;
      code?: string;
    };
    err.statusCode = 401;
    err.code = 'UNAUTHORIZED';
    next(err);
  }
}
