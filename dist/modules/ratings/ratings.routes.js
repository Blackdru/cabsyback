"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = require("express");
const auth_1 = require("../../middleware/auth");
const validate_1 = require("../../middleware/validate");
const schemas_1 = require("../../shared/schemas");
const ratings_controller_1 = require("./ratings.controller");
const router = (0, express_1.Router)();
router.post('/:id/rate', auth_1.requireAuth, (0, validate_1.validate)(schemas_1.RateRideSchema), ratings_controller_1.rate);
exports.default = router;
//# sourceMappingURL=ratings.routes.js.map