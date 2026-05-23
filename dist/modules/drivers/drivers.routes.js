"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = require("express");
const auth_1 = require("../../middleware/auth");
const validate_1 = require("../../middleware/validate");
const schemas_1 = require("../../shared/schemas");
const drivers_controller_1 = require("./drivers.controller");
const router = (0, express_1.Router)();
router.post('/onboard', auth_1.requireAuth, (0, validate_1.validate)(schemas_1.OnboardDriverSchema), drivers_controller_1.onboard);
router.get('/me/earnings', auth_1.requireAuth, drivers_controller_1.getEarnings);
exports.default = router;
//# sourceMappingURL=drivers.routes.js.map