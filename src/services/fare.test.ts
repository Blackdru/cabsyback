import { describe, it } from 'node:test';
import { strict as assert } from 'node:assert';
import {
  bidCeiling,
  bidFloor,
  calculateSuggestedFare,
  FARE_BASE_PAISE,
  FARE_MIN_PAISE,
  FARE_PER_KM_PAISE,
  haversineKm,
  isBidWithinBounds,
} from './fare';

// These cover the bid-marketplace correctness layer. The 70%–150% bounds and
// the integer-paise rounding are locked by the master prompt; if any of these
// tests start failing, the auction's pricing contract is broken — investigate
// before touching the assertions.

describe('haversineKm', () => {
  it('returns 0 for identical points', () => {
    assert.equal(haversineKm({ lat: 12.97, lng: 77.59 }, { lat: 12.97, lng: 77.59 }), 0);
  });

  it('measures Bangalore -> Chennai at ~290 km (within 5%)', () => {
    const km = haversineKm(
      { lat: 12.9716, lng: 77.5946 }, // Bangalore
      { lat: 13.0827, lng: 80.2707 }, // Chennai
    );
    assert.ok(km > 275 && km < 305, `expected ~290km, got ${km}`);
  });

  it('measures 1 degree of latitude at the equator at ~111 km', () => {
    const km = haversineKm({ lat: 0, lng: 0 }, { lat: 1, lng: 0 });
    assert.ok(km > 110 && km < 112, `expected ~111km, got ${km}`);
  });
});

describe('calculateSuggestedFare', () => {
  it('clamps to FARE_MIN_PAISE for tiny rides', () => {
    assert.equal(calculateSuggestedFare(0), FARE_MIN_PAISE);
    assert.equal(calculateSuggestedFare(0.5), FARE_MIN_PAISE);
  });

  it('uses base + per-km × ceil(distance) for normal rides', () => {
    // 5 km → base (4000) + 5 × 1400 = 11000 paise
    assert.equal(calculateSuggestedFare(5), FARE_BASE_PAISE + 5 * FARE_PER_KM_PAISE);
  });

  it('rounds up to 100-paise (₹1) granularity', () => {
    // 4.2 km → ceil(4.2) = 5 km, then 4000 + 5×1400 = 11000 (already a 100-multiple)
    const fare = calculateSuggestedFare(4.2);
    assert.equal(fare % 100, 0, `expected multiple of 100, got ${fare}`);
  });

  it('returns an integer (paise — no fractional currency)', () => {
    const fare = calculateSuggestedFare(7.3);
    assert.equal(Number.isInteger(fare), true);
  });
});

describe('bidFloor / bidCeiling (70% – 150% bounds)', () => {
  it('floor is 70% of suggested, rounded down to 100-paise', () => {
    // 10000 × 0.7 = 7000 (already on the 100-paise grid)
    assert.equal(bidFloor(10000), 7000);
  });

  it('ceiling is 150% of suggested, rounded up to 100-paise', () => {
    // 10000 × 1.5 = 15000
    assert.equal(bidCeiling(10000), 15000);
  });

  it('floor < ceiling for any positive suggested fare', () => {
    for (const sf of [6000, 8500, 12345, 25000]) {
      assert.ok(bidFloor(sf) < bidCeiling(sf), `floor < ceiling for ${sf}`);
    }
  });
});

describe('isBidWithinBounds', () => {
  const SUGGESTED = 10000; // ₹100

  it('accepts the suggested fare itself', () => {
    assert.equal(isBidWithinBounds(SUGGESTED, SUGGESTED), true);
  });

  it('accepts the floor (exactly 70%)', () => {
    assert.equal(isBidWithinBounds(7000, SUGGESTED), true);
  });

  it('accepts the ceiling (exactly 150%)', () => {
    assert.equal(isBidWithinBounds(15000, SUGGESTED), true);
  });

  it('rejects below floor', () => {
    assert.equal(isBidWithinBounds(6900, SUGGESTED), false);
    assert.equal(isBidWithinBounds(0, SUGGESTED), false);
  });

  it('rejects above ceiling', () => {
    assert.equal(isBidWithinBounds(15100, SUGGESTED), false);
    assert.equal(isBidWithinBounds(99999, SUGGESTED), false);
  });
});
