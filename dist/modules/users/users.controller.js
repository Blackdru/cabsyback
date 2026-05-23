"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.getMe = getMe;
exports.patchMe = patchMe;
exports.patchFcmToken = patchFcmToken;
exports.deleteMe = deleteMe;
const auth_service_1 = require("../auth/auth.service");
const users_service_1 = require("./users.service");
async function getMe(req, res, next) {
    try {
        const userId = req.user.userId;
        const user = await (0, users_service_1.getUserById)(userId);
        res.status(200).json({ user });
    }
    catch (err) {
        next(err);
    }
}
async function patchMe(req, res, next) {
    try {
        const userId = req.user.userId;
        const body = req.body;
        const user = await (0, users_service_1.updateUser)(userId, body);
        res.status(200).json({ user });
    }
    catch (err) {
        next(err);
    }
}
async function patchFcmToken(req, res, next) {
    try {
        const userId = req.user.userId;
        const body = req.body;
        await (0, users_service_1.setFcmToken)(userId, body.token);
        res.status(204).send();
    }
    catch (err) {
        next(err);
    }
}
// DELETE /me — Right-to-erasure flow (GDPR / DPDP §16). Cascades user data.
// Historical rides are retained but the user row is deleted; the assigned
// driver's earnings reports remain intact.
async function deleteMe(req, res, next) {
    try {
        const userId = req.user.userId;
        await (0, auth_service_1.deleteUserAccount)(userId);
        res.status(204).send();
    }
    catch (err) {
        next(err);
    }
}
//# sourceMappingURL=users.controller.js.map