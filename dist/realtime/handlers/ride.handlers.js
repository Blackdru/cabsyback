"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
Object.defineProperty(exports, "__esModule", { value: true });
exports.registerRideHandlers = registerRideHandlers;
const zod_1 = require("zod");
const logger_1 = require("../../config/logger");
const errors_1 = require("../../errors");
const bidService = __importStar(require("../../modules/bids/bids.service"));
const rideService = __importStar(require("../../modules/rides/rides.service"));
const events_1 = require("../../shared/events");
const schemas_1 = require("../../shared/schemas");
function safeAck(ack, response) {
    if (typeof ack === 'function')
        ack(response);
}
const JoinRideSchema = zod_1.z.object({ rideId: zod_1.z.string().uuid() });
function registerRideHandlers(socket) {
    // Documented extension to the spec: lets a rider socket subscribe to its own
    // ride room. Riders create rides via REST and otherwise wouldn't be in the
    // ride room when bids start arriving.
    socket.on(events_1.ClientEvents.RiderJoinRide, async (payload, ack) => {
        const parsed = JoinRideSchema.safeParse(payload);
        if (!parsed.success) {
            safeAck(ack, {
                ok: false,
                error: {
                    code: 'VALIDATION_ERROR',
                    message: 'Invalid payload',
                    details: parsed.error.flatten(),
                },
            });
            return;
        }
        try {
            const ride = await rideService.loadRideById(parsed.data.rideId);
            if (ride.riderId !== socket.data.userId) {
                throw new errors_1.ForbiddenError('Not allowed to join this ride');
            }
            socket.join(events_1.Rooms.ride(ride.id));
            safeAck(ack, { ok: true });
        }
        catch (err) {
            if (err instanceof errors_1.AppError) {
                safeAck(ack, {
                    ok: false,
                    error: { code: err.code, message: err.message, details: err.details },
                });
                return;
            }
            logger_1.logger.error({ err, socketId: socket.id }, 'rider:joinRide failed');
            safeAck(ack, {
                ok: false,
                error: { code: 'INTERNAL', message: 'Internal error' },
            });
        }
    });
    socket.on(events_1.ClientEvents.RiderAcceptBid, async (payload, ack) => {
        const parsed = schemas_1.AcceptBidSchema.safeParse(payload);
        if (!parsed.success) {
            safeAck(ack, {
                ok: false,
                error: {
                    code: 'VALIDATION_ERROR',
                    message: 'Invalid payload',
                    details: parsed.error.flatten(),
                },
            });
            return;
        }
        try {
            // Defensive: ensure the rider socket is in the ride room before assignment
            // broadcasts go out. The canonical way is RiderJoinRide on bid screen open.
            socket.join(events_1.Rooms.ride(parsed.data.rideId));
            const result = await bidService.acceptBid(socket.data.userId, parsed.data.rideId, parsed.data.bidId);
            safeAck(ack, { ok: true, data: result });
        }
        catch (err) {
            if (err instanceof errors_1.AppError) {
                safeAck(ack, {
                    ok: false,
                    error: { code: err.code, message: err.message, details: err.details },
                });
                return;
            }
            logger_1.logger.error({ err, socketId: socket.id }, 'rider:acceptBid failed');
            safeAck(ack, {
                ok: false,
                error: { code: 'INTERNAL', message: 'Internal error' },
            });
        }
    });
    socket.on(events_1.ClientEvents.RiderCancelRide, async (payload, ack) => {
        const parsed = schemas_1.CancelRideSchema.safeParse(payload);
        if (!parsed.success) {
            safeAck(ack, {
                ok: false,
                error: {
                    code: 'VALIDATION_ERROR',
                    message: 'Invalid payload',
                    details: parsed.error.flatten(),
                },
            });
            return;
        }
        try {
            const result = await rideService.cancelRide(socket.data.userId, parsed.data.rideId);
            safeAck(ack, { ok: true, data: result });
        }
        catch (err) {
            if (err instanceof errors_1.AppError) {
                safeAck(ack, {
                    ok: false,
                    error: { code: err.code, message: err.message, details: err.details },
                });
                return;
            }
            logger_1.logger.error({ err, socketId: socket.id }, 'rider:cancelRide failed');
            safeAck(ack, {
                ok: false,
                error: { code: 'INTERNAL', message: 'Internal error' },
            });
        }
    });
    socket.on(events_1.ClientEvents.DriverStartRide, async (payload, ack) => {
        const parsed = schemas_1.StartRideSchema.safeParse(payload);
        if (!parsed.success) {
            safeAck(ack, {
                ok: false,
                error: {
                    code: 'VALIDATION_ERROR',
                    message: 'Invalid payload',
                    details: parsed.error.flatten(),
                },
            });
            return;
        }
        try {
            const result = await rideService.startRide(socket.data.userId, parsed.data.rideId);
            safeAck(ack, { ok: true, data: result });
        }
        catch (err) {
            if (err instanceof errors_1.AppError) {
                safeAck(ack, {
                    ok: false,
                    error: { code: err.code, message: err.message, details: err.details },
                });
                return;
            }
            logger_1.logger.error({ err, socketId: socket.id }, 'driver:startRide failed');
            safeAck(ack, {
                ok: false,
                error: { code: 'INTERNAL', message: 'Internal error' },
            });
        }
    });
    socket.on(events_1.ClientEvents.RideCompleteByDriver, async (payload, ack) => {
        const parsed = schemas_1.CompleteRideSchema.safeParse(payload);
        if (!parsed.success) {
            safeAck(ack, {
                ok: false,
                error: {
                    code: 'VALIDATION_ERROR',
                    message: 'Invalid payload',
                    details: parsed.error.flatten(),
                },
            });
            return;
        }
        try {
            const result = await rideService.completeRide(socket.data.userId, parsed.data.rideId);
            safeAck(ack, { ok: true, data: result });
        }
        catch (err) {
            if (err instanceof errors_1.AppError) {
                safeAck(ack, {
                    ok: false,
                    error: { code: err.code, message: err.message, details: err.details },
                });
                return;
            }
            logger_1.logger.error({ err, socketId: socket.id }, 'ride:completeByDriver failed');
            safeAck(ack, {
                ok: false,
                error: { code: 'INTERNAL', message: 'Internal error' },
            });
        }
    });
}
//# sourceMappingURL=ride.handlers.js.map