"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.FARE_MIN_PAISE = exports.FARE_PER_KM_PAISE = exports.FARE_BASE_PAISE = void 0;
exports.haversineKm = haversineKm;
exports.calculateSuggestedFare = calculateSuggestedFare;
exports.bidFloor = bidFloor;
exports.bidCeiling = bidCeiling;
exports.isBidWithinBounds = isBidWithinBounds;
exports.FARE_BASE_PAISE = 4000;
exports.FARE_PER_KM_PAISE = 1400;
exports.FARE_MIN_PAISE = 6000;
const PAISE_ROUNDING_UNIT = 100;
const EARTH_RADIUS_KM = 6371;
const BID_FLOOR_RATIO = 0.7;
const BID_CEILING_RATIO = 1.5;
const toRadians = (degrees) => (degrees * Math.PI) / 180;
function haversineKm(a, b) {
    const dLat = toRadians(b.lat - a.lat);
    const dLng = toRadians(b.lng - a.lng);
    const lat1 = toRadians(a.lat);
    const lat2 = toRadians(b.lat);
    const sinDLat = Math.sin(dLat / 2);
    const sinDLng = Math.sin(dLng / 2);
    const h = sinDLat * sinDLat + Math.cos(lat1) * Math.cos(lat2) * sinDLng * sinDLng;
    const c = 2 * Math.atan2(Math.sqrt(h), Math.sqrt(1 - h));
    return EARTH_RADIUS_KM * c;
}
function calculateSuggestedFare(distanceKm) {
    const distanceCeil = Math.ceil(Math.max(0, distanceKm));
    const raw = exports.FARE_BASE_PAISE + distanceCeil * exports.FARE_PER_KM_PAISE;
    const rounded = Math.ceil(raw / PAISE_ROUNDING_UNIT) * PAISE_ROUNDING_UNIT;
    return Math.max(exports.FARE_MIN_PAISE, rounded);
}
function bidFloor(suggestedFare) {
    const raw = suggestedFare * BID_FLOOR_RATIO;
    return Math.floor(raw / PAISE_ROUNDING_UNIT) * PAISE_ROUNDING_UNIT;
}
function bidCeiling(suggestedFare) {
    const raw = suggestedFare * BID_CEILING_RATIO;
    return Math.ceil(raw / PAISE_ROUNDING_UNIT) * PAISE_ROUNDING_UNIT;
}
function isBidWithinBounds(amount, suggestedFare) {
    return amount >= bidFloor(suggestedFare) && amount <= bidCeiling(suggestedFare);
}
//# sourceMappingURL=fare.js.map