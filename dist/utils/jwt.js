"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.signAccessToken = signAccessToken;
exports.signRefreshToken = signRefreshToken;
exports.verifyAccessToken = verifyAccessToken;
exports.verifyRefreshToken = verifyRefreshToken;
const jsonwebtoken_1 = __importDefault(require("jsonwebtoken"));
const env_1 = require("../config/env");
function decodeKey(raw) {
    const trimmed = raw.trim();
    if (trimmed.includes('-----BEGIN')) {
        return trimmed.replace(/\\n/g, '\n');
    }
    return Buffer.from(trimmed, 'base64').toString('utf8');
}
// Check if we should use RS256 (asymmetric) or HS256 (symmetric)
const useAsymmetric = !!(env_1.env.JWT_PRIVATE_KEY && env_1.env.JWT_PUBLIC_KEY);
function getPrivateKey() {
    if (!env_1.env.JWT_PRIVATE_KEY) {
        throw new Error('JWT_PRIVATE_KEY is not configured');
    }
    return decodeKey(env_1.env.JWT_PRIVATE_KEY);
}
function getPublicKey() {
    if (!env_1.env.JWT_PUBLIC_KEY) {
        throw new Error('JWT_PUBLIC_KEY is not configured');
    }
    return decodeKey(env_1.env.JWT_PUBLIC_KEY);
}
// Fallback to JWT_SECRET for development (HS256)
function getSecret() {
    const secret = process.env.JWT_SECRET;
    if (!secret) {
        throw new Error('JWT_SECRET is not configured');
    }
    return secret;
}
function signAccessToken(payload) {
    const options = {
        algorithm: useAsymmetric ? 'RS256' : 'HS256',
        expiresIn: env_1.env.JWT_ACCESS_TTL,
        subject: payload.sub,
    };
    const secret = useAsymmetric ? getPrivateKey() : getSecret();
    return jsonwebtoken_1.default.sign({ role: payload.role }, secret, options);
}
function signRefreshToken(payload) {
    const options = {
        algorithm: useAsymmetric ? 'RS256' : 'HS256',
        expiresIn: env_1.env.JWT_REFRESH_TTL,
        subject: payload.sub,
        audience: 'refresh',
    };
    const secret = useAsymmetric ? getPrivateKey() : getSecret();
    return jsonwebtoken_1.default.sign({}, secret, options);
}
function verifyAccessToken(token) {
    const secret = useAsymmetric ? getPublicKey() : getSecret();
    const algorithm = useAsymmetric ? 'RS256' : 'HS256';
    const decoded = jsonwebtoken_1.default.verify(token, secret, { algorithms: [algorithm] });
    if (typeof decoded === 'string' || decoded === null) {
        throw new Error('Invalid token payload');
    }
    const sub = decoded.sub;
    const role = decoded.role;
    if (typeof sub !== 'string' || (role !== 'rider' && role !== 'driver')) {
        throw new Error('Invalid access token payload');
    }
    return { sub, role };
}
function verifyRefreshToken(token) {
    const secret = useAsymmetric ? getPublicKey() : getSecret();
    const algorithm = useAsymmetric ? 'RS256' : 'HS256';
    const decoded = jsonwebtoken_1.default.verify(token, secret, {
        algorithms: [algorithm],
        audience: 'refresh',
    });
    if (typeof decoded === 'string' || decoded === null) {
        throw new Error('Invalid token payload');
    }
    const sub = decoded.sub;
    if (typeof sub !== 'string') {
        throw new Error('Invalid refresh token payload');
    }
    return { sub };
}
//# sourceMappingURL=jwt.js.map