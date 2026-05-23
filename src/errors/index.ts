import { AppError } from './AppError';

export { AppError };

export class BadRequestError extends AppError {
  constructor(message = 'Bad request', details?: unknown, code = 'BAD_REQUEST') {
    super(400, code, message, details);
    this.name = 'BadRequestError';
  }
}

export class ValidationError extends AppError {
  constructor(message = 'Invalid request', details?: unknown) {
    super(400, 'VALIDATION_ERROR', message, details);
    this.name = 'ValidationError';
  }
}

export class UnauthorizedError extends AppError {
  constructor(message = 'Authentication required', details?: unknown, code = 'UNAUTHORIZED') {
    super(401, code, message, details);
    this.name = 'UnauthorizedError';
  }
}

export class ForbiddenError extends AppError {
  constructor(message = 'Forbidden', details?: unknown) {
    super(403, 'FORBIDDEN', message, details);
    this.name = 'ForbiddenError';
  }
}

export class NotFoundError extends AppError {
  constructor(message = 'Resource not found', details?: unknown) {
    super(404, 'NOT_FOUND', message, details);
    this.name = 'NotFoundError';
  }
}

export class ConflictError extends AppError {
  constructor(message = 'Conflict', details?: unknown, code = 'CONFLICT') {
    super(409, code, message, details);
    this.name = 'ConflictError';
  }
}

export class RateLimitError extends AppError {
  constructor(message = 'Too many requests', details?: unknown) {
    super(429, 'RATE_LIMITED', message, details);
    this.name = 'RateLimitError';
  }
}

export class InternalError extends AppError {
  constructor(message = 'Internal server error', details?: unknown) {
    super(500, 'INTERNAL', message, details);
    this.name = 'InternalError';
  }
}

export class BidOutOfBoundsError extends BadRequestError {
  constructor(message = 'Bid is outside the allowed range', details?: unknown) {
    super(message, details, 'BID_OUT_OF_BOUNDS');
    this.name = 'BidOutOfBoundsError';
  }
}

export class BidNotLowerError extends BadRequestError {
  constructor(message = 'Revised bid must be lower than current bid', details?: unknown) {
    super(message, details, 'BID_NOT_LOWER');
    this.name = 'BidNotLowerError';
  }
}

export class RideNotBiddableError extends ConflictError {
  constructor(message = 'Ride is not accepting bids', details?: unknown) {
    super(message, details, 'RIDE_NOT_BIDDABLE');
    this.name = 'RideNotBiddableError';
  }
}

export class RideAlreadyAssignedError extends ConflictError {
  constructor(message = 'Ride has already been assigned', details?: unknown) {
    super(message, details, 'RIDE_ALREADY_ASSIGNED');
    this.name = 'RideAlreadyAssignedError';
  }
}

export class DriverOfflineError extends ConflictError {
  constructor(message = 'Driver is offline', details?: unknown) {
    super(message, details, 'DRIVER_OFFLINE');
    this.name = 'DriverOfflineError';
  }
}

export class OtpInvalidError extends UnauthorizedError {
  constructor(message = 'OTP is invalid or expired', details?: unknown) {
    super(message, details, 'OTP_INVALID');
    this.name = 'OtpInvalidError';
  }
}
