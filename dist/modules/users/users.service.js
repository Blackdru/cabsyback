"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.getUserById = getUserById;
exports.updateUser = updateUser;
exports.setFcmToken = setFcmToken;
const client_1 = require("../../db/client");
const errors_1 = require("../../errors");
function toUserFromPg(row) {
    return {
        id: row.id,
        phone: row.phone,
        name: row.name,
        rating: Number(row.rating),
        createdAt: row.created_at.toISOString(),
    };
}
async function getUserById(userId) {
    const { rows } = await client_1.pool.query(`SELECT id, phone, name, rating, created_at 
     FROM users 
     WHERE id = $1 
     LIMIT 1`, [userId]);
    if (rows.length === 0) {
        throw new errors_1.NotFoundError('User not found');
    }
    const row = rows[0];
    if (!row) {
        throw new errors_1.NotFoundError('User not found');
    }
    return toUserFromPg(row);
}
async function updateUser(userId, patch) {
    if (patch.name === undefined) {
        return getUserById(userId);
    }
    const { rows } = await client_1.pool.query(`UPDATE users SET name = $1 WHERE id = $2
     RETURNING id, phone, name, rating, created_at`, [patch.name, userId]);
    const row = rows[0];
    if (!row) {
        throw new errors_1.NotFoundError('User not found');
    }
    return toUserFromPg(row);
}
async function setFcmToken(userId, token) {
    const { rows } = await client_1.pool.query(`UPDATE users SET fcm_token = $1 WHERE id = $2 RETURNING id`, [token, userId]);
    if (rows.length === 0) {
        throw new errors_1.NotFoundError('User not found');
    }
}
//# sourceMappingURL=users.service.js.map