"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.requestOtp = requestOtp;
exports.verifyOtpAndAuthenticate = verifyOtpAndAuthenticate;
exports.refreshAccess = refreshAccess;
exports.deleteUserAccount = deleteUserAccount;
const client_1 = require("../../db/client");
const jwt_1 = require("../../utils/jwt");
const errors_1 = require("../../errors");
const otp_1 = require("../../services/otp");
function toUser(row) {
    return {
        id: row.id,
        phone: row.phone,
        name: row.name,
        rating: Number(row.rating),
        createdAt: row.createdAt.toISOString(),
    };
}
async function findUserByPhone(phone) {
    // Use direct PostgreSQL connection instead of Supabase client to avoid permission issues
    const { rows } = await client_1.pool.query(`SELECT id, phone, name, rating, created_at 
     FROM users 
     WHERE phone = $1 
     LIMIT 1`, [phone]);
    if (rows.length === 0)
        return undefined;
    const row = rows[0];
    if (!row)
        return undefined;
    return {
        id: row.id,
        phone: row.phone,
        name: row.name,
        rating: row.rating,
        createdAt: row.created_at,
    };
}
function isUniqueViolation(err) {
    return (typeof err === 'object' &&
        err !== null &&
        'code' in err &&
        err.code === '23505');
}
async function getOrCreateUserByPhone(phone) {
    const existing = await findUserByPhone(phone);
    if (existing)
        return existing;
    try {
        // Use INSERT ... ON CONFLICT to handle race conditions
        const { rows } = await client_1.pool.query(`INSERT INTO users (phone) 
       VALUES ($1)
       ON CONFLICT (phone) DO UPDATE SET phone = EXCLUDED.phone
       RETURNING id, phone, name, rating, created_at`, [phone]);
        const row = rows[0];
        if (!row)
            throw new Error('failed to insert or fetch user');
        return {
            id: row.id,
            phone: row.phone,
            name: row.name,
            rating: row.rating,
            createdAt: row.created_at,
        };
    }
    catch (err) {
        throw err;
    }
}
async function resolveRole(userId) {
    const { rows } = await client_1.pool.query('SELECT id FROM drivers WHERE user_id = $1 LIMIT 1', [userId]);
    return rows[0] ? 'driver' : 'rider';
}
/**
 * Request OTP for phone number
 * Sends OTP via SMS to the provided phone number
 */
async function requestOtp(phone) {
    await (0, otp_1.requestOtp)(phone);
}
/**
 * Verify OTP and authenticate user
 * Creates user if doesn't exist, returns user data and auth tokens
 */
async function verifyOtpAndAuthenticate(phone, otp) {
    // Verify the OTP
    await (0, otp_1.verifyOtp)(phone, otp);
    // Get or create user
    const userRow = await getOrCreateUserByPhone(phone);
    const role = await resolveRole(userRow.id);
    // Generate tokens
    const accessToken = (0, jwt_1.signAccessToken)({ sub: userRow.id, role });
    const refreshToken = (0, jwt_1.signRefreshToken)({ sub: userRow.id });
    return {
        user: toUser(userRow),
        tokens: { accessToken, refreshToken },
    };
}
async function refreshAccess(refreshToken) {
    // Refresh-token rotation: each successful refresh issues BOTH a new access
    // token AND a new refresh token. Clients must replace the stored refresh
    // token on every refresh response, otherwise the next refresh will fail.
    //
    // The previous refresh token remains technically valid until expiry; full
    // server-side revocation requires a token-version column or denylist
    // (deferred — the rotation alone closes the largest token-replay risk).
    let sub;
    try {
        ({ sub } = (0, jwt_1.verifyRefreshToken)(refreshToken));
    }
    catch {
        throw new errors_1.UnauthorizedError('Invalid refresh token', undefined, 'REFRESH_INVALID');
    }
    const { rows } = await client_1.pool.query('SELECT id FROM users WHERE id = $1 LIMIT 1', [sub]);
    const userRow = rows[0];
    if (!userRow) {
        throw new errors_1.UnauthorizedError('User not found', undefined, 'REFRESH_INVALID');
    }
    const role = await resolveRole(userRow.id);
    const accessToken = (0, jwt_1.signAccessToken)({ sub: userRow.id, role });
    const newRefreshToken = (0, jwt_1.signRefreshToken)({ sub: userRow.id });
    return { accessToken, refreshToken: newRefreshToken };
}
// Delete-my-account flow (GDPR / DPDP §16). Cascades through:
//   ride bids (FK ride_id ON DELETE CASCADE)
//   driver record (FK user_id ON DELETE CASCADE)
//   driver_online_sessions (FK driver_id ON DELETE CASCADE)
//   ratings (FK by_user_id, for_user_id — manual SET NULL via UPDATEs first)
// Rides are NOT deleted — they're historical records the assigned driver may
// still want for earnings reports. The user_id on rides is retained but the
// user row vanishes; treat the user as anonymized.
async function deleteUserAccount(userId) {
    const client = await client_1.pool.connect();
    try {
        await client.query('BEGIN');
        // Detach historical ratings before deleting users (the FK is NOT cascade
        // because we don't want to lose historical scores for the surviving user).
        await client.query(`UPDATE ratings SET comment = NULL WHERE by_user_id = $1 OR for_user_id = $1`, [userId]);
        // The cascade does the rest (driver, sessions, bids via ride cascade,
        // idempotency keys via FK on user_id ON DELETE CASCADE).
        const del = await client.query(`DELETE FROM users WHERE id = $1 RETURNING id`, [userId]);
        if (del.rows.length === 0) {
            await client.query('ROLLBACK');
            throw new errors_1.UnauthorizedError('User not found', undefined, 'NOT_FOUND');
        }
        await client.query('COMMIT');
    }
    catch (err) {
        await client.query('ROLLBACK').catch(() => { });
        throw err;
    }
    finally {
        client.release();
    }
}
//# sourceMappingURL=auth.service.js.map