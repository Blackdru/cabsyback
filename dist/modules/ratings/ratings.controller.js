"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.rate = rate;
const ratings_service_1 = require("./ratings.service");
async function rate(req, res, next) {
    try {
        const userId = req.user.userId;
        const rideId = req.params.id;
        if (!rideId) {
            res.status(400).json({ error: { code: 'VALIDATION_ERROR', message: 'rideId required' } });
            return;
        }
        const { stars, comment } = req.body;
        const rating = await (0, ratings_service_1.rateRide)(userId, rideId, stars, comment);
        res.status(201).json({ rating });
    }
    catch (err) {
        next(err);
    }
}
//# sourceMappingURL=ratings.controller.js.map