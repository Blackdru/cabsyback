"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.apiLimiter = exports.refreshLimiter = exports.otpVerifyLimiter = exports.otpRequestLimiter = void 0;
const express_rate_limit_1 = __importDefault(require("express-rate-limit"));
// In-memory store: only sound on a single backend replica. If you ever scale
// horizontally, swap this for a shared store (Postgres-backed via
// rate-limit-postgres, or similar).
const RATE_LIMITED_BODY = {
    error: { code: 'RATE_LIMITED', message: 'Too many requests' },
};
function rateLimitHandler(_req, res) {
    res.status(429).json(RATE_LIMITED_BODY);
}
function buildLimiter(opts) {
    return (0, express_rate_limit_1.default)({
        windowMs: opts.windowMs,
        limit: opts.limit,
        standardHeaders: 'draft-7',
        legacyHeaders: false,
        handler: rateLimitHandler,
        keyGenerator: opts.keyGenerator,
    });
}
function ipKey(req) {
    return req.ip ?? req.socket.remoteAddress ?? 'unknown';
}
// Per-IP+phone — stops one number being hammered from a single IP.
exports.otpRequestLimiter = buildLimiter({
    windowMs: 10 * 60 * 1000,
    limit: 5,
    keyGenerator: (req) => {
        const body = req.body;
        const phone = typeof body?.phone === 'string' ? body.phone : 'no-phone';
        return `${ipKey(req)}|${phone}`;
    },
});
exports.otpVerifyLimiter = buildLimiter({
    windowMs: 10 * 60 * 1000,
    limit: 10,
    keyGenerator: (req) => ipKey(req),
});
exports.refreshLimiter = buildLimiter({
    windowMs: 10 * 60 * 1000,
    limit: 30,
    keyGenerator: (req) => ipKey(req),
});
exports.apiLimiter = buildLimiter({
    windowMs: 60 * 1000,
    limit: 300,
    keyGenerator: (req) => ipKey(req),
});
//# sourceMappingURL=rateLimit.js.map