"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.pruneStaleDriversOnce = pruneStaleDriversOnce;
exports.startStaleDriverJob = startStaleDriverJob;
exports.stopStaleDriverJob = stopStaleDriverJob;
const logger_1 = require("../config/logger");
const geo_1 = require("../services/geo");
const lock_1 = require("./lock");
async function pruneStaleDriversOnce() {
    // Advisory lock: only one instance prunes at a time across the cluster.
    const removed = await (0, lock_1.withAdvisoryLock)(lock_1.LOCK_STALE_DRIVERS, () => (0, geo_1.pruneStaleDrivers)());
    if (removed && removed > 0) {
        logger_1.logger.debug({ removed }, 'staleDrivers tick removed entries');
    }
    return removed ?? 0;
}
function startStaleDriverJob(intervalMs = 15000) {
    return setInterval(() => {
        const startedAt = Date.now();
        void pruneStaleDriversOnce()
            .catch((err) => {
            const message = err instanceof Error ? err.message : String(err);
            logger_1.logger.warn({ err: message }, 'staleDrivers tick failed');
        })
            .finally(() => {
            const took = Date.now() - startedAt;
            if (took > intervalMs) {
                logger_1.logger.warn({ took, intervalMs }, 'staleDrivers tick exceeded interval');
            }
        });
    }, intervalMs);
}
function stopStaleDriverJob(handle) {
    clearInterval(handle);
}
//# sourceMappingURL=staleDrivers.js.map