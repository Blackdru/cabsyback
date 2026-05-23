"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = require("express");
const validate_1 = require("../../middleware/validate");
const schemas_1 = require("../../shared/schemas");
const auth_controller_1 = require("./auth.controller");
const router = (0, express_1.Router)();
router.post('/otp/request', (0, validate_1.validate)(schemas_1.OtpRequestSchema), auth_controller_1.otpRequest);
router.post('/otp/verify', (0, validate_1.validate)(schemas_1.OtpVerifySchema), auth_controller_1.otpVerify);
router.post('/refresh', (0, validate_1.validate)(schemas_1.RefreshSchema), auth_controller_1.refresh);
exports.default = router;
//# sourceMappingURL=auth.routes.js.map