"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.requireAuth = requireAuth;
const jwt_1 = require("../utils/jwt");
function requireAuth(req, _res, next) {
    try {
        const header = req.headers.authorization;
        if (!header || !header.startsWith('Bearer ')) {
            throw new Error('Missing bearer token');
        }
        const token = header.slice('Bearer '.length).trim();
        if (!token) {
            throw new Error('Empty bearer token');
        }
        const payload = (0, jwt_1.verifyAccessToken)(token);
        req.user = { userId: payload.sub, role: payload.role };
        next();
    }
    catch {
        // TODO: replace with AppError once src/errors/ lands
        const err = new Error('Authentication required');
        err.statusCode = 401;
        err.code = 'UNAUTHORIZED';
        next(err);
    }
}
//# sourceMappingURL=auth.js.map