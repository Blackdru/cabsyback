"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.errorHandler = void 0;
const logger_1 = require("../config/logger");
const env_1 = require("../config/env");
const errorHandler = (err, req, res, _next) => {
    const e = err;
    const status = typeof e.statusCode === 'number' ? e.statusCode : 500;
    const code = typeof e.code === 'string' && e.code.length > 0 ? e.code : 'INTERNAL_ERROR';
    const message = e.message || 'Internal server error';
    logger_1.logger.error({
        err: { message: e.message, code, status, stack: e.stack },
        method: req.method,
        url: req.url,
    }, 'request error');
    const body = {
        error: { code, message },
    };
    if (env_1.env.NODE_ENV !== 'production' && e.details !== undefined) {
        body.error.details = e.details;
    }
    res.status(status).json(body);
};
exports.errorHandler = errorHandler;
//# sourceMappingURL=error.js.map