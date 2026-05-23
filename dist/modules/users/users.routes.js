"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = require("express");
const auth_1 = require("../../middleware/auth");
const validate_1 = require("../../middleware/validate");
const schemas_1 = require("../../shared/schemas");
const users_controller_1 = require("./users.controller");
const router = (0, express_1.Router)();
router.use(auth_1.requireAuth);
router.get('/', users_controller_1.getMe);
router.patch('/', (0, validate_1.validate)(schemas_1.UpdateMeSchema), users_controller_1.patchMe);
router.patch('/fcm-token', (0, validate_1.validate)(schemas_1.SetFcmTokenSchema), users_controller_1.patchFcmToken);
router.delete('/', users_controller_1.deleteMe);
exports.default = router;
//# sourceMappingURL=users.routes.js.map