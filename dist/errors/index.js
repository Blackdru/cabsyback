"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.OtpInvalidError = exports.DriverOfflineError = exports.RideAlreadyAssignedError = exports.RideNotBiddableError = exports.BidNotLowerError = exports.BidOutOfBoundsError = exports.InternalError = exports.RateLimitError = exports.ConflictError = exports.NotFoundError = exports.ForbiddenError = exports.UnauthorizedError = exports.ValidationError = exports.BadRequestError = exports.AppError = void 0;
const AppError_1 = require("./AppError");
Object.defineProperty(exports, "AppError", { enumerable: true, get: function () { return AppError_1.AppError; } });
class BadRequestError extends AppError_1.AppError {
    constructor(message = 'Bad request', details, code = 'BAD_REQUEST') {
        super(400, code, message, details);
        this.name = 'BadRequestError';
    }
}
exports.BadRequestError = BadRequestError;
class ValidationError extends AppError_1.AppError {
    constructor(message = 'Invalid request', details) {
        super(400, 'VALIDATION_ERROR', message, details);
        this.name = 'ValidationError';
    }
}
exports.ValidationError = ValidationError;
class UnauthorizedError extends AppError_1.AppError {
    constructor(message = 'Authentication required', details, code = 'UNAUTHORIZED') {
        super(401, code, message, details);
        this.name = 'UnauthorizedError';
    }
}
exports.UnauthorizedError = UnauthorizedError;
class ForbiddenError extends AppError_1.AppError {
    constructor(message = 'Forbidden', details) {
        super(403, 'FORBIDDEN', message, details);
        this.name = 'ForbiddenError';
    }
}
exports.ForbiddenError = ForbiddenError;
class NotFoundError extends AppError_1.AppError {
    constructor(message = 'Resource not found', details) {
        super(404, 'NOT_FOUND', message, details);
        this.name = 'NotFoundError';
    }
}
exports.NotFoundError = NotFoundError;
class ConflictError extends AppError_1.AppError {
    constructor(message = 'Conflict', details, code = 'CONFLICT') {
        super(409, code, message, details);
        this.name = 'ConflictError';
    }
}
exports.ConflictError = ConflictError;
class RateLimitError extends AppError_1.AppError {
    constructor(message = 'Too many requests', details) {
        super(429, 'RATE_LIMITED', message, details);
        this.name = 'RateLimitError';
    }
}
exports.RateLimitError = RateLimitError;
class InternalError extends AppError_1.AppError {
    constructor(message = 'Internal server error', details) {
        super(500, 'INTERNAL', message, details);
        this.name = 'InternalError';
    }
}
exports.InternalError = InternalError;
class BidOutOfBoundsError extends BadRequestError {
    constructor(message = 'Bid is outside the allowed range', details) {
        super(message, details, 'BID_OUT_OF_BOUNDS');
        this.name = 'BidOutOfBoundsError';
    }
}
exports.BidOutOfBoundsError = BidOutOfBoundsError;
class BidNotLowerError extends BadRequestError {
    constructor(message = 'Revised bid must be lower than current bid', details) {
        super(message, details, 'BID_NOT_LOWER');
        this.name = 'BidNotLowerError';
    }
}
exports.BidNotLowerError = BidNotLowerError;
class RideNotBiddableError extends ConflictError {
    constructor(message = 'Ride is not accepting bids', details) {
        super(message, details, 'RIDE_NOT_BIDDABLE');
        this.name = 'RideNotBiddableError';
    }
}
exports.RideNotBiddableError = RideNotBiddableError;
class RideAlreadyAssignedError extends ConflictError {
    constructor(message = 'Ride has already been assigned', details) {
        super(message, details, 'RIDE_ALREADY_ASSIGNED');
        this.name = 'RideAlreadyAssignedError';
    }
}
exports.RideAlreadyAssignedError = RideAlreadyAssignedError;
class DriverOfflineError extends ConflictError {
    constructor(message = 'Driver is offline', details) {
        super(message, details, 'DRIVER_OFFLINE');
        this.name = 'DriverOfflineError';
    }
}
exports.DriverOfflineError = DriverOfflineError;
class OtpInvalidError extends UnauthorizedError {
    constructor(message = 'OTP is invalid or expired', details) {
        super(message, details, 'OTP_INVALID');
        this.name = 'OtpInvalidError';
    }
}
exports.OtpInvalidError = OtpInvalidError;
//# sourceMappingURL=index.js.map