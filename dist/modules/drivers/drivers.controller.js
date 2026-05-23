"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.onboard = onboard;
exports.getEarnings = getEarnings;
const drivers_service_1 = require("./drivers.service");
async function onboard(req, res, next) {
    try {
        const userId = req.user.userId;
        const body = req.body;
        const driver = await (0, drivers_service_1.onboard)(userId, body);
        res.status(201).json({ driver });
    }
    catch (err) {
        next(err);
    }
}
async function getEarnings(req, res, next) {
    try {
        const userId = req.user.userId;
        const earnings = await (0, drivers_service_1.getEarnings)(userId);
        res.status(200).json({ earnings });
    }
    catch (err) {
        next(err);
    }
}
//# sourceMappingURL=drivers.controller.js.map