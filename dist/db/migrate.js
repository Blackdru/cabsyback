"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const node_crypto_1 = __importDefault(require("node:crypto"));
const promises_1 = __importDefault(require("node:fs/promises"));
const node_path_1 = __importDefault(require("node:path"));
const pg_1 = require("pg");
const env_1 = require("../config/env");
const logger_1 = require("../config/logger");
// Hand-rolled migration runner. Replaces drizzle-kit per master prompt's NO ORM rule.
//
// Conventions:
//   - Migration files live in src/db/migrations and are named "NNNN_*.sql".
//   - They run in lexicographic order, each in its own transaction.
//   - Applied filenames + a sha256 of their contents are recorded in the
//     "_migrations" table so reruns are no-ops.
//   - Use --baseline to mark all current files as applied without running them
//     (one-time on environments that already have the schema from drizzle-kit).
const MIGRATIONS_DIR = node_path_1.default.resolve(__dirname, 'migrations');
const TRACKING_TABLE = '_migrations';
async function loadMigrationFiles() {
    const entries = await promises_1.default.readdir(MIGRATIONS_DIR);
    const sqlFiles = entries.filter((f) => f.endsWith('.sql')).sort();
    const files = [];
    for (const filename of sqlFiles) {
        const contents = await promises_1.default.readFile(node_path_1.default.join(MIGRATIONS_DIR, filename), 'utf8');
        const checksum = node_crypto_1.default.createHash('sha256').update(contents).digest('hex');
        files.push({ filename, contents, checksum });
    }
    return files;
}
async function ensureTrackingTable(pool) {
    await pool.query(`
    CREATE TABLE IF NOT EXISTS ${TRACKING_TABLE} (
      filename text PRIMARY KEY,
      checksum text NOT NULL,
      applied_at timestamptz NOT NULL DEFAULT now()
    )
  `);
}
async function getApplied(pool) {
    const { rows } = await pool.query(`SELECT filename, checksum FROM ${TRACKING_TABLE}`);
    return new Map(rows.map((r) => [r.filename, r.checksum]));
}
async function applyMigration(pool, file) {
    const client = await pool.connect();
    try {
        await client.query('BEGIN');
        await client.query(file.contents);
        await client.query(`INSERT INTO ${TRACKING_TABLE} (filename, checksum) VALUES ($1, $2)`, [file.filename, file.checksum]);
        await client.query('COMMIT');
        logger_1.logger.info({ filename: file.filename }, 'migration applied');
    }
    catch (err) {
        await client.query('ROLLBACK');
        throw err;
    }
    finally {
        client.release();
    }
}
async function baselineMigrations(pool, files) {
    for (const file of files) {
        await pool.query(`INSERT INTO ${TRACKING_TABLE} (filename, checksum) VALUES ($1, $2)
       ON CONFLICT (filename) DO NOTHING`, [file.filename, file.checksum]);
    }
    logger_1.logger.info({ count: files.length }, 'migrations baselined (recorded as applied without running)');
}
async function main() {
    const baseline = process.argv.includes('--baseline');
    const pool = new pg_1.Pool({
        connectionString: env_1.env.DATABASE_DIRECT_URL,
        max: 1,
    });
    try {
        const files = await loadMigrationFiles();
        await ensureTrackingTable(pool);
        if (baseline) {
            await baselineMigrations(pool, files);
            return;
        }
        const applied = await getApplied(pool);
        const pending = files.filter((f) => !applied.has(f.filename));
        if (pending.length === 0) {
            logger_1.logger.info('no pending migrations');
            return;
        }
        logger_1.logger.info({ count: pending.length }, 'applying pending migrations');
        for (const file of pending) {
            await applyMigration(pool, file);
        }
        logger_1.logger.info('migrations complete');
    }
    finally {
        await pool.end();
    }
}
main().catch((err) => {
    logger_1.logger.error({ err: err instanceof Error ? err.message : String(err) }, 'migration failed');
    process.exit(1);
});
//# sourceMappingURL=migrate.js.map