"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.requestOtp = requestOtp;
exports.verifyOtp = verifyOtp;
exports.cleanupExpiredOtps = cleanupExpiredOtps;
const client_1 = require("../db/client");
const env_1 = require("../config/env");
const logger_1 = require("../config/logger");
const errors_1 = require("../errors");
const MAX_OTP_ATTEMPTS = 5;
const OTP_LENGTH = 6;
const OTP_EXPIRY_MINUTES = 10;
/**
 * Generate a random 6-digit OTP
 */
function generateOtp() {
    return Math.floor(100000 + Math.random() * 900000).toString();
}
/**
 * Send OTP via SMS using the Renflair SMS API
 */
async function sendOtpSms(phone, otp) {
    const { SMS_API_KEY, SMS_API_URL } = env_1.env;
    if (!SMS_API_KEY || !SMS_API_URL) {
        logger_1.logger.warn('SMS API not configured, OTP will not be sent');
        logger_1.logger.info(`[DEV MODE] OTP for ${phone}: ${otp}`);
        return;
    }
    try {
        // Renflair SMS API expects 10-digit Indian mobile number without country code
        // Convert +919133263911 to 9133263911
        let phoneNumber = phone.replace(/^\+91/, ''); // Remove +91 country code
        phoneNumber = phoneNumber.replace(/^\+/, ''); // Remove any other + prefix
        phoneNumber = phoneNumber.replace(/\s+/g, ''); // Remove spaces
        const url = `${SMS_API_URL}?API=${SMS_API_KEY}&PHONE=${phoneNumber}&OTP=${otp}`;
        logger_1.logger.info({ phone: phoneNumber, originalPhone: phone, url: SMS_API_URL }, 'Sending OTP SMS');
        const response = await fetch(url, {
            method: 'GET',
            headers: {
                'Accept': 'application/json',
            },
        });
        const result = await response.text();
        if (!response.ok) {
            logger_1.logger.error({ status: response.status, result, phone: phoneNumber }, 'SMS API returned error status');
            throw new Error(`SMS API returned status ${response.status}: ${result}`);
        }
        logger_1.logger.info({ phone: phoneNumber, result }, 'OTP SMS sent successfully');
    }
    catch (error) {
        logger_1.logger.error({ error, phone }, 'Failed to send OTP SMS');
        throw new Error('Failed to send OTP SMS. Please try again.');
    }
}
/**
 * Request OTP for a phone number
 * Uses UPSERT to handle concurrent requests safely
 */
async function requestOtp(phone) {
    const client = await client_1.pool.connect();
    try {
        await client.query('BEGIN');
        // Generate new OTP
        const otp = generateOtp();
        // Upsert: Insert new OTP or update existing unverified one
        // This handles race conditions and ensures only one unverified OTP exists
        await client.query(`INSERT INTO otp_verifications (phone, otp, expires_at, attempts)
       VALUES ($1, $2, now() + INTERVAL '${OTP_EXPIRY_MINUTES} minutes', 0)
       ON CONFLICT (phone) WHERE (verified = false)
       DO UPDATE SET 
         otp = EXCLUDED.otp,
         expires_at = EXCLUDED.expires_at,
         attempts = 0,
         created_at = now()`, [phone, otp]);
        await client.query('COMMIT');
        // Send OTP via SMS (after successful DB commit)
        await sendOtpSms(phone, otp);
        logger_1.logger.info({ phone }, 'OTP requested and sent');
    }
    catch (error) {
        await client.query('ROLLBACK').catch(() => { });
        logger_1.logger.error({ error, phone }, 'Failed to request OTP');
        throw error;
    }
    finally {
        client.release();
    }
}
/**
 * Verify OTP for a phone number
 * Returns true if OTP is valid, throws error otherwise
 */
async function verifyOtp(phone, otp) {
    const client = await client_1.pool.connect();
    try {
        await client.query('BEGIN');
        // Find the most recent unverified OTP for this phone
        const { rows } = await client.query(`SELECT id, phone, otp, verified, attempts, created_at, expires_at
       FROM otp_verifications
       WHERE phone = $1 AND verified = false
       ORDER BY created_at DESC
       LIMIT 1
       FOR UPDATE`, [phone]);
        const record = rows[0];
        if (!record) {
            await client.query('ROLLBACK');
            throw new errors_1.OtpInvalidError('No OTP found for this phone number');
        }
        // Check if OTP has expired
        if (new Date() > record.expires_at) {
            await client.query('ROLLBACK');
            throw new errors_1.OtpInvalidError('OTP has expired');
        }
        // Check if max attempts exceeded
        if (record.attempts >= MAX_OTP_ATTEMPTS) {
            await client.query('ROLLBACK');
            throw new errors_1.OtpInvalidError('Maximum verification attempts exceeded');
        }
        // Increment attempts
        await client.query(`UPDATE otp_verifications 
       SET attempts = attempts + 1 
       WHERE id = $1`, [record.id]);
        // Verify OTP
        if (record.otp !== otp) {
            await client.query('COMMIT');
            throw new errors_1.OtpInvalidError('Invalid OTP');
        }
        // Mark as verified (delete old verified OTPs first to avoid constraint issues)
        await client.query(`DELETE FROM otp_verifications 
       WHERE phone = $1 AND verified = true AND id != $2`, [phone, record.id]);
        await client.query(`UPDATE otp_verifications 
       SET verified = true, verified_at = now() 
       WHERE id = $1`, [record.id]);
        await client.query('COMMIT');
        logger_1.logger.info({ phone }, 'OTP verified successfully');
        return true;
    }
    catch (error) {
        await client.query('ROLLBACK').catch(() => { });
        if (error instanceof errors_1.OtpInvalidError) {
            throw error;
        }
        logger_1.logger.error({ error, phone }, 'Failed to verify OTP');
        throw new Error('Failed to verify OTP');
    }
    finally {
        client.release();
    }
}
/**
 * Cleanup expired OTPs (should be run periodically)
 */
async function cleanupExpiredOtps() {
    try {
        const { rowCount } = await client_1.pool.query(`DELETE FROM otp_verifications 
       WHERE expires_at < now() - INTERVAL '1 day'`);
        if (rowCount && rowCount > 0) {
            logger_1.logger.info({ count: rowCount }, 'Cleaned up expired OTPs');
        }
        return rowCount || 0;
    }
    catch (error) {
        logger_1.logger.error({ error }, 'Failed to cleanup expired OTPs');
        return 0;
    }
}
//# sourceMappingURL=otp.js.map