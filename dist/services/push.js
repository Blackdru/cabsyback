"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.sendNotification = sendNotification;
const app_1 = require("firebase-admin/app");
const messaging_1 = require("firebase-admin/messaging");
const client_1 = require("../db/client");
const logger_1 = require("../config/logger");
// Best-effort push: never throw, never block the primary flow.
async function sendNotification(userId, payload) {
    try {
        if ((0, app_1.getApps)().length === 0) {
            logger_1.logger.debug({ userId }, 'push: firebase admin not initialized, skipping');
            return;
        }
        const { rows } = await client_1.pool.query('SELECT fcm_token FROM users WHERE id = $1 LIMIT 1', [userId]);
        const token = rows[0]?.fcm_token;
        if (!token) {
            logger_1.logger.debug({ userId }, 'push: no fcm token registered, skipping');
            return;
        }
        await (0, messaging_1.getMessaging)().send({
            token,
            notification: { title: payload.title, body: payload.body },
            data: payload.data ?? {},
        });
    }
    catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        logger_1.logger.warn({ err: message, userId }, 'push: send failed');
    }
}
//# sourceMappingURL=push.js.map