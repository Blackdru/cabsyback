import { cert, getApps, initializeApp, type App } from 'firebase-admin/app';
import { getAuth } from 'firebase-admin/auth';
import { env } from './env';
import { logger } from './logger';

let firebaseApp: App | null = null;

function init(): void {
  if (firebaseApp || getApps().length > 0) {
    firebaseApp = getApps()[0] ?? firebaseApp;
    return;
  }

  const { FIREBASE_PROJECT_ID, FIREBASE_CLIENT_EMAIL, FIREBASE_PRIVATE_KEY } = env;

  if (!FIREBASE_PROJECT_ID || !FIREBASE_CLIENT_EMAIL || !FIREBASE_PRIVATE_KEY) {
    logger.warn(
      'firebase admin not initialized: missing FIREBASE_PROJECT_ID / FIREBASE_CLIENT_EMAIL / FIREBASE_PRIVATE_KEY',
    );
    return;
  }

  const privateKey = FIREBASE_PRIVATE_KEY.replace(/\\n/g, '\n');

  firebaseApp = initializeApp({
    credential: cert({
      projectId: FIREBASE_PROJECT_ID,
      clientEmail: FIREBASE_CLIENT_EMAIL,
      privateKey,
    }),
  });

  logger.info('firebase admin initialized');
}

init();

export class FirebaseAuthError extends Error {
  readonly code: string;
  constructor(message: string, code = 'FIREBASE_AUTH_ERROR') {
    super(message);
    this.name = 'FirebaseAuthError';
    this.code = code;
  }
}

export async function verifyFirebaseIdToken(
  idToken: string,
): Promise<{ uid: string; phoneNumber?: string }> {
  if (!firebaseApp) {
    throw new FirebaseAuthError('Firebase admin not initialized', 'FIREBASE_NOT_INITIALIZED');
  }

  try {
    const decoded = await getAuth(firebaseApp).verifyIdToken(idToken);
    const result: { uid: string; phoneNumber?: string } = { uid: decoded.uid };
    if (typeof decoded.phone_number === 'string') {
      result.phoneNumber = decoded.phone_number;
    }
    return result;
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Invalid Firebase ID token';
    throw new FirebaseAuthError(message, 'FIREBASE_INVALID_TOKEN');
  }
}
