import crypto from 'node:crypto';
import fs from 'node:fs/promises';
import path from 'node:path';
import { Pool } from 'pg';
import { env } from '../config/env';
import { logger } from '../config/logger';

// Hand-rolled migration runner. Replaces drizzle-kit per master prompt's NO ORM rule.
//
// Conventions:
//   - Migration files live in src/db/migrations and are named "NNNN_*.sql".
//   - They run in lexicographic order, each in its own transaction.
//   - Applied filenames + a sha256 of their contents are recorded in the
//     "_migrations" table so reruns are no-ops.
//   - Use --baseline to mark all current files as applied without running them
//     (one-time on environments that already have the schema from drizzle-kit).

const MIGRATIONS_DIR = path.resolve(__dirname, 'migrations');
const TRACKING_TABLE = '_migrations';

interface MigrationFile {
  filename: string;
  contents: string;
  checksum: string;
}

async function loadMigrationFiles(): Promise<MigrationFile[]> {
  const entries = await fs.readdir(MIGRATIONS_DIR);
  const sqlFiles = entries.filter((f) => f.endsWith('.sql')).sort();
  const files: MigrationFile[] = [];
  for (const filename of sqlFiles) {
    const contents = await fs.readFile(path.join(MIGRATIONS_DIR, filename), 'utf8');
    const checksum = crypto.createHash('sha256').update(contents).digest('hex');
    files.push({ filename, contents, checksum });
  }
  return files;
}

async function ensureTrackingTable(pool: Pool): Promise<void> {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS ${TRACKING_TABLE} (
      filename text PRIMARY KEY,
      checksum text NOT NULL,
      applied_at timestamptz NOT NULL DEFAULT now()
    )
  `);
}

async function getApplied(pool: Pool): Promise<Map<string, string>> {
  const { rows } = await pool.query<{ filename: string; checksum: string }>(
    `SELECT filename, checksum FROM ${TRACKING_TABLE}`,
  );
  return new Map(rows.map((r) => [r.filename, r.checksum]));
}

async function applyMigration(pool: Pool, file: MigrationFile): Promise<void> {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    await client.query(file.contents);
    await client.query(
      `INSERT INTO ${TRACKING_TABLE} (filename, checksum) VALUES ($1, $2)`,
      [file.filename, file.checksum],
    );
    await client.query('COMMIT');
    logger.info({ filename: file.filename }, 'migration applied');
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
}

async function baselineMigrations(pool: Pool, files: MigrationFile[]): Promise<void> {
  for (const file of files) {
    await pool.query(
      `INSERT INTO ${TRACKING_TABLE} (filename, checksum) VALUES ($1, $2)
       ON CONFLICT (filename) DO NOTHING`,
      [file.filename, file.checksum],
    );
  }
  logger.info({ count: files.length }, 'migrations baselined (recorded as applied without running)');
}

async function main(): Promise<void> {
  const baseline = process.argv.includes('--baseline');

  const pool = new Pool({
    connectionString: env.DATABASE_DIRECT_URL,
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
      logger.info('no pending migrations');
      return;
    }

    logger.info({ count: pending.length }, 'applying pending migrations');
    for (const file of pending) {
      await applyMigration(pool, file);
    }
    logger.info('migrations complete');
  } finally {
    await pool.end();
  }
}

main().catch((err) => {
  logger.error({ err: err instanceof Error ? err.message : String(err) }, 'migration failed');
  process.exit(1);
});
