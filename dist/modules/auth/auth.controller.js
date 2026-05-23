"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.refresh = exports.otpVerify = exports.otpRequest = void 0;
const auth_service_1 = require("./auth.service");
function asyncHandler(fn) {
    return (req, res, next) => {
        fn(req, res, next).catch(next);
    };
}
exports.otpRequest = asyncHandler(async (req, res) => {
    const { phone } = req.body;
    await (0, auth_service_1.requestOtp)(phone);
    res.status(200).json({
        ok: true,
        message: 'OTP sent successfully'
    });
});
exports.otpVerify = asyncHandler(async (req, res) => {
    const { phone, otp } = req.body;
    const { user, tokens } = await (0, auth_service_1.verifyOtpAndAuthenticate)(phone, otp);
    res.status(200).json({
        accessToken: tokens.accessToken,
        refreshToken: tokens.refreshToken,
        user,
    });
});
exports.refresh = asyncHandler(async (req, res) => {
    const { refreshToken: incomingRefresh } = req.body;
    const { accessToken, refreshToken } = await (0, auth_service_1.refreshAccess)(incomingRefresh);
    // Refresh-token rotation: client MUST replace its stored refresh token
    // with the one returned here. The next refresh will issue another rotation.
    res.status(200).json({ accessToken, refreshToken });
});
//# sourceMappingURL=auth.controller.js.map