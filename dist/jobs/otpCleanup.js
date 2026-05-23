"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.startOtpCleanupJob = startOtpCleanupJob;
exports.stopOtpCleanupJob = stopOtpCleanupJob;
const logger_1 = require("../config/logger");
const otp_1 = require("../services/otp");
const CLEANUP_INTERVAL_MS = 60 * 60 * 1000; // 1 hour
async function runCleanup() {
    try {
        const count = await (0, otp_1.cleanupExpiredOtps)();
        if (count > 0) {
            logger_1.logger.info({ count }, 'OTP cleanup completed');
        }
    }
    catch (error) {
        logger_1.logger.error({ error }, 'OTP cleanup failed');
    }
}
function startOtpCleanupJob() {
    logger_1.logger.info('starting OTP cleanup job');
    const handle = setInterval(() => {
        void runCleanup();
    }, CLEANUP_INTERVAL_MS);
    // Run immediately on startup
    void runCleanup();
    return handle;
}
function stopOtpCleanupJob(handle) {
    clearInterval(handle);
    logger_1.logger.info('OTP cleanup job stopped');
}
//# sourceMappingURL=otpCleanup.js.map