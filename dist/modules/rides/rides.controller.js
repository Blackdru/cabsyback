"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.getRideHistory = exports.getRide = exports.createRide = void 0;
const logger_1 = require("../../config/logger");
const dispatch_1 = require("../../services/dispatch");
const rides_service_1 = require("./rides.service");
function asyncHandler(fn) {
    return (req, res, next) => {
        fn(req, res, next).catch(next);
    };
}
exports.createRide = asyncHandler(async (req, res) => {
    const userId = req.user.userId;
    const body = req.body;
    const result = await (0, rides_service_1.createRide)(userId, body);
    // Fire-and-forget: dispatch should not block the rider's POST response.
    void (0, dispatch_1.dispatchRide)(result.rideId).catch((err) => {
        const message = err instanceof Error ? err.message : String(err);
        logger_1.logger.error({ err: message, rideId: result.rideId }, 'dispatchRide failed');
    });
    res.status(200).json(result);
});
exports.getRide = asyncHandler(async (req, res) => {
    const userId = req.user.userId;
    const rideId = req.params.id;
    if (!rideId) {
        res.status(400).json({ error: { code: 'BAD_REQUEST', message: 'Missing ride id' } });
        return;
    }
    const ride = await (0, rides_service_1.getRideForUser)(userId, rideId);
    res.status(200).json({ ride });
});
exports.getRideHistory = asyncHandler(async (req, res) => {
    const userId = req.user.userId;
    const query = req.query;
    const page = await (0, rides_service_1.getRideHistoryForUser)(userId, {
        cursor: query.cursor,
        limit: query.limit,
    });
    res.status(200).json(page);
});
//# sourceMappingURL=rides.controller.js.map