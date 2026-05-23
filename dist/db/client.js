"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.pool = void 0;
const pg_1 = require("pg");
const env_1 = require("../config/env");
const logger_1 = require("../config/logger");
exports.pool = new pg_1.Pool({
    connectionString: env_1.env.DATABASE_URL,
    max: env_1.env.PG_POOL_MAX,
    // Per-statement timeout enforced by Postgres so a slow query can't block
    // a connection indefinitely and exhaust the pool. Tunable for analytics-style
    // aggregates (getEarnings) and dispatch jobs.
    statement_timeout: env_1.env.PG_STATEMENT_TIMEOUT_MS,
});
exports.pool.on('error', (err) => {
    logger_1.logger.warn({ err: err.message }, 'pg pool error');
});
void (async () => {
    try {
        const client = await exports.pool.connect();
        try {
            await client.query('SELECT 1');
            logger_1.logger.info({ poolMax: env_1.env.PG_POOL_MAX }, 'postgres connected');
        }
        finally {
            client.release();
        }
    }
    catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        logger_1.logger.warn({ err: message }, 'postgres initial connection failed; continuing without db');
    }
})();
//# sourceMappingURL=client.js.map