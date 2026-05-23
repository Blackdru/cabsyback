"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.idempotency = idempotency;
const node_crypto_1 = __importDefault(require("node:crypto"));
const client_1 = require("../db/client");
const logger_1 = require("../config/logger");
// Idempotency-Key header support (Stripe-style). Clients SHOULD include a
// UUID in `Idempotency-Key` on POST /rides (and similar mutating endpoints
// where retries are likely). Backend stores the (user, key) -> response in
// `idempotency_keys` for 24h. A repeat request within that window returns
// the cached response without re-running the handler.
//
// The request_hash check protects against a misbehaving client reusing the
// same key for two semantically different requests — we 409 in that case.
const HEADER = 'idempotency-key';
function hashRequest(method, path, body) {
    const payload = JSON.stringify({ method, path, body });
    return node_crypto_1.default.createHash('sha256').update(payload).digest('hex');
}
async function idempotency(req, res, next) {
    const key = req.header(HEADER);
    if (!key) {
        next();
        return;
    }
    const userId = req.user?.userId;
    if (!userId) {
        // No auth context yet — should not happen if mounted after requireAuth.
        next();
        return;
    }
    const requestHash = hashRequest(req.method, req.path, req.body);
    try {
        const { rows } = await client_1.pool.query(`SELECT request_hash, response, status_code
       FROM idempotency_keys
       WHERE user_id = $1 AND key = $2 AND expires_at > now()`, [userId, key]);
        const cached = rows[0];
        if (cached) {
            if (cached.request_hash !== requestHash) {
                res.status(409).json({
                    error: {
                        code: 'IDEMPOTENCY_KEY_REUSED',
                        message: 'Idempotency-Key already used with a different request body',
                    },
                });
                return;
            }
            // Cache hit — replay the original response.
            res.status(cached.status_code).json(cached.response);
            return;
        }
    }
    catch (err) {
        // If the cache lookup fails (DB blip), fail open: proceed with the
        // request rather than 503'ing a happy-path booking.
        const message = err instanceof Error ? err.message : String(err);
        logger_1.logger.warn({ err: message, userId }, 'idempotency cache lookup failed');
        next();
        return;
    }
    // Wrap res.json so we can persist the response after the handler resolves.
    const originalJson = res.json.bind(res);
    res.json = ((body) => {
        const statusCode = res.statusCode;
        // Only cache 2xx — don't memoize transient errors.
        if (statusCode >= 200 && statusCode < 300) {
            client_1.pool
                .query(`INSERT INTO idempotency_keys (user_id, key, request_hash, response, status_code)
           VALUES ($1, $2, $3, $4, $5)
           ON CONFLICT (user_id, key) DO NOTHING`, [userId, key, requestHash, body, statusCode])
                .catch((err) => {
                const m = err instanceof Error ? err.message : String(err);
                logger_1.logger.warn({ err: m, userId }, 'idempotency cache write failed');
            });
        }
        return originalJson(body);
    });
    next();
}
//# sourceMappingURL=idempotency.js.map