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
exports.registerBidHandlers = registerBidHandlers;
const logger_1 = require("../../config/logger");
const AppError_1 = require("../../errors/AppError");
const bidService = __importStar(require("../../modules/bids/bids.service"));
const events_1 = require("../../shared/events");
const schemas_1 = require("../../shared/schemas");
function safeAck(ack, response) {
    if (typeof ack === 'function')
        ack(response);
}
function registerBidHandlers(socket) {
    socket.on(events_1.ClientEvents.DriverPlaceBid, async (payload, ack) => {
        const parsed = schemas_1.PlaceBidSchema.safeParse(payload);
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
            const result = await bidService.placeBid(socket.data.userId, parsed.data.rideId, parsed.data.amount);
            // Once the driver has bid, server-side join them to the ride room so they
            // receive subsequent ride:bidUpdate broadcasts (and ride:bidLost).
            socket.join(events_1.Rooms.ride(parsed.data.rideId));
            safeAck(ack, { ok: true, data: result });
        }
        catch (err) {
            if (err instanceof AppError_1.AppError) {
                safeAck(ack, {
                    ok: false,
                    error: { code: err.code, message: err.message, details: err.details },
                });
                return;
            }
            logger_1.logger.error({ err, socketId: socket.id }, 'driver:placeBid failed');
            safeAck(ack, {
                ok: false,
                error: { code: 'INTERNAL', message: 'Internal error' },
            });
        }
    });
    socket.on(events_1.ClientEvents.DriverReviseBid, async (payload, ack) => {
        const parsed = schemas_1.ReviseBidSchema.safeParse(payload);
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
            const result = await bidService.reviseBid(socket.data.userId, parsed.data.rideId, parsed.data.amount);
            safeAck(ack, { ok: true, data: result });
        }
        catch (err) {
            if (err instanceof AppError_1.AppError) {
                safeAck(ack, {
                    ok: false,
                    error: { code: err.code, message: err.message, details: err.details },
                });
                return;
            }
            logger_1.logger.error({ err, socketId: socket.id }, 'driver:reviseBid failed');
            safeAck(ack, {
                ok: false,
                error: { code: 'INTERNAL', message: 'Internal error' },
            });
        }
    });
}
//# sourceMappingURL=bid.handlers.js.map