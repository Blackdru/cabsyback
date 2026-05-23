"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = require("express");
const auth_1 = require("../../middleware/auth");
const idempotency_1 = require("../../middleware/idempotency");
const validate_1 = require("../../middleware/validate");
const schemas_1 = require("../../shared/schemas");
const rides_controller_1 = require("./rides.controller");
const router = (0, express_1.Router)();
router.use(auth_1.requireAuth);
// Idempotency-Key support on POST /rides: clients should send a UUID header
// so a network retry doesn't accidentally create a second ride.
router.post('/', idempotency_1.idempotency, (0, validate_1.validate)(schemas_1.CreateRideSchema), rides_controller_1.createRide);
// `/history` must be registered before `/:id` so it isn't shadowed by the param route.
router.get('/history', (0, validate_1.validate)(schemas_1.HistoryQuerySchema, 'query'), rides_controller_1.getRideHistory);
router.get('/:id', rides_controller_1.getRide);
exports.default = router;
//# sourceMappingURL=rides.routes.js.map