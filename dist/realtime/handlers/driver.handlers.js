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
exports.registerDriverHandlers = registerDriverHandlers;
const logger_1 = require("../../config/logger");
const AppError_1 = require("../../errors/AppError");
const bidService = __importStar(require("../../modules/bids/bids.service"));
const driverService = __importStar(require("../../modules/drivers/drivers.service"));
const events_1 = require("../../shared/events");
const schemas_1 = require("../../shared/schemas");
function safeAck(ack, response) {
    if (typeof ack === 'function')
        ack(response);
}
const LOCATION_UPDATE_MIN_INTERVAL_MS = 1000;
function registerDriverHandlers(socket) {
    socket.on(events_1.ClientEvents.DriverGoOnline, async (_payload, ack) => {
        try {
            await driverService.goOnline(socket.data.userId);
            safeAck(ack, { ok: true });
        }
        catch (err) {
            if (err instanceof AppError_1.AppError) {
                safeAck(ack, {
                    ok: false,
                    error: { code: err.code, message: err.message, details: err.details },
                });
                return;
            }
            logger_1.logger.error({ err, socketId: socket.id }, 'driver:goOnline failed');
            safeAck(ack, {
                ok: false,
                error: { code: 'INTERNAL', message: 'Internal error' },
            });
        }
    });
    socket.on(events_1.ClientEvents.DriverGoOffline, async (_payload, ack) => {
        try {
            const userId = socket.data.userId;
            const driver = await driverService.getDriverByUserId(userId);
            if (driver) {
                await driverService.goOffline(userId);
                await bidService.withdrawAllBidsForDriver(driver.id);
            }
            safeAck(ack, { ok: true });
        }
        catch (err) {
            if (err instanceof AppError_1.AppError) {
                safeAck(ack, {
                    ok: false,
                    error: { code: err.code, message: err.message, details: err.details },
                });
                return;
            }
            logger_1.logger.error({ err, socketId: socket.id }, 'driver:goOffline failed');
            safeAck(ack, {
                ok: false,
                error: { code: 'INTERNAL', message: 'Internal error' },
            });
        }
    });
    socket.on(events_1.ClientEvents.DriverLocationUpdate, async (payload, ack) => {
        // Server-side rate limit: drop silently if a previous update landed within the window.
        const now = Date.now();
        const last = socket.data.lastLocationUpdateMs ?? 0;
        if (now - last < LOCATION_UPDATE_MIN_INTERVAL_MS) {
            return;
        }
        socket.data.lastLocationUpdateMs = now;
        const parsed = schemas_1.LocationUpdateSchema.safeParse(payload);
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
            await driverService.updateLocation(socket.data.userId, parsed.data);
            safeAck(ack, { ok: true });
        }
        catch (err) {
            if (err instanceof AppError_1.AppError) {
                safeAck(ack, {
                    ok: false,
                    error: { code: err.code, message: err.message, details: err.details },
                });
                return;
            }
            logger_1.logger.error({ err, socketId: socket.id }, 'driver:locationUpdate failed');
            safeAck(ack, {
                ok: false,
                error: { code: 'INTERNAL', message: 'Internal error' },
            });
        }
    });
}
//# sourceMappingURL=driver.handlers.js.map