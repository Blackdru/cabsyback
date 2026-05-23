"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const node_test_1 = require("node:test");
const node_assert_1 = require("node:assert");
const fare_1 = require("./fare");
// These cover the bid-marketplace correctness layer. The 70%–150% bounds and
// the integer-paise rounding are locked by the master prompt; if any of these
// tests start failing, the auction's pricing contract is broken — investigate
// before touching the assertions.
(0, node_test_1.describe)('haversineKm', () => {
    (0, node_test_1.it)('returns 0 for identical points', () => {
        node_assert_1.strict.equal((0, fare_1.haversineKm)({ lat: 12.97, lng: 77.59 }, { lat: 12.97, lng: 77.59 }), 0);
    });
    (0, node_test_1.it)('measures Bangalore -> Chennai at ~290 km (within 5%)', () => {
        const km = (0, fare_1.haversineKm)({ lat: 12.9716, lng: 77.5946 }, // Bangalore
        { lat: 13.0827, lng: 80.2707 });
        node_assert_1.strict.ok(km > 275 && km < 305, `expected ~290km, got ${km}`);
    });
    (0, node_test_1.it)('measures 1 degree of latitude at the equator at ~111 km', () => {
        const km = (0, fare_1.haversineKm)({ lat: 0, lng: 0 }, { lat: 1, lng: 0 });
        node_assert_1.strict.ok(km > 110 && km < 112, `expected ~111km, got ${km}`);
    });
});
(0, node_test_1.describe)('calculateSuggestedFare', () => {
    (0, node_test_1.it)('clamps to FARE_MIN_PAISE for tiny rides', () => {
        node_assert_1.strict.equal((0, fare_1.calculateSuggestedFare)(0), fare_1.FARE_MIN_PAISE);
        node_assert_1.strict.equal((0, fare_1.calculateSuggestedFare)(0.5), fare_1.FARE_MIN_PAISE);
    });
    (0, node_test_1.it)('uses base + per-km × ceil(distance) for normal rides', () => {
        // 5 km → base (4000) + 5 × 1400 = 11000 paise
        node_assert_1.strict.equal((0, fare_1.calculateSuggestedFare)(5), fare_1.FARE_BASE_PAISE + 5 * fare_1.FARE_PER_KM_PAISE);
    });
    (0, node_test_1.it)('rounds up to 100-paise (₹1) granularity', () => {
        // 4.2 km → ceil(4.2) = 5 km, then 4000 + 5×1400 = 11000 (already a 100-multiple)
        const fare = (0, fare_1.calculateSuggestedFare)(4.2);
        node_assert_1.strict.equal(fare % 100, 0, `expected multiple of 100, got ${fare}`);
    });
    (0, node_test_1.it)('returns an integer (paise — no fractional currency)', () => {
        const fare = (0, fare_1.calculateSuggestedFare)(7.3);
        node_assert_1.strict.equal(Number.isInteger(fare), true);
    });
});
(0, node_test_1.describe)('bidFloor / bidCeiling (70% – 150% bounds)', () => {
    (0, node_test_1.it)('floor is 70% of suggested, rounded down to 100-paise', () => {
        // 10000 × 0.7 = 7000 (already on the 100-paise grid)
        node_assert_1.strict.equal((0, fare_1.bidFloor)(10000), 7000);
    });
    (0, node_test_1.it)('ceiling is 150% of suggested, rounded up to 100-paise', () => {
        // 10000 × 1.5 = 15000
        node_assert_1.strict.equal((0, fare_1.bidCeiling)(10000), 15000);
    });
    (0, node_test_1.it)('floor < ceiling for any positive suggested fare', () => {
        for (const sf of [6000, 8500, 12345, 25000]) {
            node_assert_1.strict.ok((0, fare_1.bidFloor)(sf) < (0, fare_1.bidCeiling)(sf), `floor < ceiling for ${sf}`);
        }
    });
});
(0, node_test_1.describe)('isBidWithinBounds', () => {
    const SUGGESTED = 10000; // ₹100
    (0, node_test_1.it)('accepts the suggested fare itself', () => {
        node_assert_1.strict.equal((0, fare_1.isBidWithinBounds)(SUGGESTED, SUGGESTED), true);
    });
    (0, node_test_1.it)('accepts the floor (exactly 70%)', () => {
        node_assert_1.strict.equal((0, fare_1.isBidWithinBounds)(7000, SUGGESTED), true);
    });
    (0, node_test_1.it)('accepts the ceiling (exactly 150%)', () => {
        node_assert_1.strict.equal((0, fare_1.isBidWithinBounds)(15000, SUGGESTED), true);
    });
    (0, node_test_1.it)('rejects below floor', () => {
        node_assert_1.strict.equal((0, fare_1.isBidWithinBounds)(6900, SUGGESTED), false);
        node_assert_1.strict.equal((0, fare_1.isBidWithinBounds)(0, SUGGESTED), false);
    });
    (0, node_test_1.it)('rejects above ceiling', () => {
        node_assert_1.strict.equal((0, fare_1.isBidWithinBounds)(15100, SUGGESTED), false);
        node_assert_1.strict.equal((0, fare_1.isBidWithinBounds)(99999, SUGGESTED), false);
    });
});
//# sourceMappingURL=fare.test.js.map