import jwt, { type SignOptions } from 'jsonwebtoken';
import { env } from '../config/env';

export type Role = 'rider' | 'driver';

export interface AccessTokenPayload {
  sub: string;
  role: Role;
}

export interface RefreshTokenPayload {
  sub: string;
}

function decodeKey(raw: string): string {
  const trimmed = raw.trim();
  if (trimmed.includes('-----BEGIN')) {
    return trimmed.replace(/\\n/g, '\n');
  }
  return Buffer.from(trimmed, 'base64').toString('utf8');
}

// Check if we should use RS256 (asymmetric) or HS256 (symmetric)
const useAsymmetric = !!(env.JWT_PRIVATE_KEY && env.JWT_PUBLIC_KEY);

function getPrivateKey(): string {
  if (!env.JWT_PRIVATE_KEY) {
    throw new Error('JWT_PRIVATE_KEY is not configured');
  }
  return decodeKey(env.JWT_PRIVATE_KEY);
}

function getPublicKey(): string {
  if (!env.JWT_PUBLIC_KEY) {
    throw new Error('JWT_PUBLIC_KEY is not configured');
  }
  return decodeKey(env.JWT_PUBLIC_KEY);
}

// Fallback to JWT_SECRET for development (HS256)
function getSecret(): string {
  const secret = process.env.JWT_SECRET;
  if (!secret) {
    throw new Error('JWT_SECRET is not configured');
  }
  return secret;
}

export function signAccessToken(payload: AccessTokenPayload): string {
  const options: SignOptions = {
    algorithm: useAsymmetric ? 'RS256' : 'HS256',
    expiresIn: env.JWT_ACCESS_TTL as SignOptions['expiresIn'],
    subject: payload.sub,
  };
  const secret = useAsymmetric ? getPrivateKey() : getSecret();
  return jwt.sign({ role: payload.role }, secret, options);
}

export function signRefreshToken(payload: RefreshTokenPayload): string {
  const options: SignOptions = {
    algorithm: useAsymmetric ? 'RS256' : 'HS256',
    expiresIn: env.JWT_REFRESH_TTL as SignOptions['expiresIn'],
    subject: payload.sub,
    audience: 'refresh',
  };
  const secret = useAsymmetric ? getPrivateKey() : getSecret();
  return jwt.sign({}, secret, options);
}

export function verifyAccessToken(token: string): AccessTokenPayload {
  const secret = useAsymmetric ? getPublicKey() : getSecret();
  const algorithm = useAsymmetric ? 'RS256' : 'HS256';
  const decoded = jwt.verify(token, secret, { algorithms: [algorithm] });
  if (typeof decoded === 'string' || decoded === null) {
    throw new Error('Invalid token payload');
  }
  const sub = decoded.sub;
  const role = (decoded as { role?: unknown }).role;
  if (typeof sub !== 'string' || (role !== 'rider' && role !== 'driver')) {
    throw new Error('Invalid access token payload');
  }
  return { sub, role };
}

export function verifyRefreshToken(token: string): RefreshTokenPayload {
  const secret = useAsymmetric ? getPublicKey() : getSecret();
  const algorithm = useAsymmetric ? 'RS256' : 'HS256';
  const decoded = jwt.verify(token, secret, {
    algorithms: [algorithm],
    audience: 'refresh',
  });
  if (typeof decoded === 'string' || decoded === null) {
    throw new Error('Invalid token payload');
  }
  const sub = decoded.sub;
  if (typeof sub !== 'string') {
    throw new Error('Invalid refresh token payload');
  }
  return { sub };
}
