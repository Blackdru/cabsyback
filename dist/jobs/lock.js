"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.LOCK_RADIUS_EXPANSION = exports.LOCK_STALE_DRIVERS = exports.LOCK_BID_WINDOW = void 0;
exports.withAdvisoryLock = withAdvisoryLock;
const client_1 = require("../db/client");
// Postgres session-level advisory lock. Returns true if this connection
// successfully claimed the lock; false if another instance already holds it.
//
// The caller MUST release the lock when done, even on errors. Use try/finally.
//
// Usage:
//   await withAdvisoryLock(LOCK_BID_WINDOW, async () => {
//     // ... critical section, runs at most once across all instances ...
//   });
//
// Why session-level (not transaction-level): jobs run multiple statements
// without an enclosing transaction. Session locks are tied to the connection;
// we explicitly release at the end of the section.
exports.LOCK_BID_WINDOW = 7_001;
exports.LOCK_STALE_DRIVERS = 7_002;
exports.LOCK_RADIUS_EXPANSION = 7_003;
async function withAdvisoryLock(lockKey, fn) {
    const client = await client_1.pool.connect();
    try {
        const tryRes = await client.query('SELECT pg_try_advisory_lock($1) AS locked', [lockKey]);
        const locked = tryRes.rows[0]?.locked === true;
        if (!locked) {
            // Another instance is currently running this section. Skip this tick.
            return null;
        }
        try {
            return await fn();
        }
        finally {
            await client.query('SELECT pg_advisory_unlock($1)', [lockKey]).catch(() => { });
        }
    }
    finally {
        client.release();
    }
}
//# sourceMappingURL=lock.js.map