"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.startAllJobs = startAllJobs;
exports.stopAllJobs = stopAllJobs;
const logger_1 = require("../config/logger");
const bidWindow_1 = require("./bidWindow");
const staleDrivers_1 = require("./staleDrivers");
const radiusExpansion_1 = require("./radiusExpansion");
const otpCleanup_1 = require("./otpCleanup");
function startAllJobs() {
    const handles = {
        bidWindow: (0, bidWindow_1.startBidWindowJob)(),
        staleDrivers: (0, staleDrivers_1.startStaleDriverJob)(),
        radiusExpansion: (0, radiusExpansion_1.startRadiusExpansionJob)(),
        otpCleanup: (0, otpCleanup_1.startOtpCleanupJob)(),
    };
    logger_1.logger.info('background jobs started');
    return handles;
}
function stopAllJobs(handles) {
    (0, bidWindow_1.stopBidWindowJob)(handles.bidWindow);
    (0, staleDrivers_1.stopStaleDriverJob)(handles.staleDrivers);
    (0, radiusExpansion_1.stopRadiusExpansionJob)(handles.radiusExpansion);
    (0, otpCleanup_1.stopOtpCleanupJob)(handles.otpCleanup);
    logger_1.logger.info('background jobs stopped');
}
//# sourceMappingURL=scheduler.js.map