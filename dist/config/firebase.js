"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.FirebaseAuthError = void 0;
exports.verifyFirebaseIdToken = verifyFirebaseIdToken;
const app_1 = require("firebase-admin/app");
const auth_1 = require("firebase-admin/auth");
const env_1 = require("./env");
const logger_1 = require("./logger");
let firebaseApp = null;
function init() {
    if (firebaseApp || (0, app_1.getApps)().length > 0) {
        firebaseApp = (0, app_1.getApps)()[0] ?? firebaseApp;
        return;
    }
    const { FIREBASE_PROJECT_ID, FIREBASE_CLIENT_EMAIL, FIREBASE_PRIVATE_KEY } = env_1.env;
    if (!FIREBASE_PROJECT_ID || !FIREBASE_CLIENT_EMAIL || !FIREBASE_PRIVATE_KEY) {
        logger_1.logger.warn('firebase admin not initialized: missing FIREBASE_PROJECT_ID / FIREBASE_CLIENT_EMAIL / FIREBASE_PRIVATE_KEY');
        return;
    }
    const privateKey = FIREBASE_PRIVATE_KEY.replace(/\\n/g, '\n');
    firebaseApp = (0, app_1.initializeApp)({
        credential: (0, app_1.cert)({
            projectId: FIREBASE_PROJECT_ID,
            clientEmail: FIREBASE_CLIENT_EMAIL,
            privateKey,
        }),
    });
    logger_1.logger.info('firebase admin initialized');
}
init();
class FirebaseAuthError extends Error {
    code;
    constructor(message, code = 'FIREBASE_AUTH_ERROR') {
        super(message);
        this.name = 'FirebaseAuthError';
        this.code = code;
    }
}
exports.FirebaseAuthError = FirebaseAuthError;
async function verifyFirebaseIdToken(idToken) {
    if (!firebaseApp) {
        throw new FirebaseAuthError('Firebase admin not initialized', 'FIREBASE_NOT_INITIALIZED');
    }
    try {
        const decoded = await (0, auth_1.getAuth)(firebaseApp).verifyIdToken(idToken);
        const result = { uid: decoded.uid };
        if (typeof decoded.phone_number === 'string') {
            result.phoneNumber = decoded.phone_number;
        }
        return result;
    }
    catch (err) {
        const message = err instanceof Error ? err.message : 'Invalid Firebase ID token';
        throw new FirebaseAuthError(message, 'FIREBASE_INVALID_TOKEN');
    }
}
//# sourceMappingURL=firebase.js.map