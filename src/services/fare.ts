import type { LatLng } from '../shared/types';

export const FARE_BASE_PAISE = 4000;
export const FARE_PER_KM_PAISE = 1400;
export const FARE_MIN_PAISE = 6000;

const PAISE_ROUNDING_UNIT = 100;
const EARTH_RADIUS_KM = 6371;
const BID_FLOOR_RATIO = 0.7;
const BID_CEILING_RATIO = 1.5;

const toRadians = (degrees: number): number => (degrees * Math.PI) / 180;

export function haversineKm(a: LatLng, b: LatLng): number {
  const dLat = toRadians(b.lat - a.lat);
  const dLng = toRadians(b.lng - a.lng);
  const lat1 = toRadians(a.lat);
  const lat2 = toRadians(b.lat);

  const sinDLat = Math.sin(dLat / 2);
  const sinDLng = Math.sin(dLng / 2);

  const h =
    sinDLat * sinDLat + Math.cos(lat1) * Math.cos(lat2) * sinDLng * sinDLng;
  const c = 2 * Math.atan2(Math.sqrt(h), Math.sqrt(1 - h));

  return EARTH_RADIUS_KM * c;
}

export function calculateSuggestedFare(distanceKm: number): number {
  const distanceCeil = Math.ceil(Math.max(0, distanceKm));
  const raw = FARE_BASE_PAISE + distanceCeil * FARE_PER_KM_PAISE;
  const rounded = Math.ceil(raw / PAISE_ROUNDING_UNIT) * PAISE_ROUNDING_UNIT;
  return Math.max(FARE_MIN_PAISE, rounded);
}

export function bidFloor(suggestedFare: number): number {
  const raw = suggestedFare * BID_FLOOR_RATIO;
  return Math.floor(raw / PAISE_ROUNDING_UNIT) * PAISE_ROUNDING_UNIT;
}

export function bidCeiling(suggestedFare: number): number {
  const raw = suggestedFare * BID_CEILING_RATIO;
  return Math.ceil(raw / PAISE_ROUNDING_UNIT) * PAISE_ROUNDING_UNIT;
}

export function isBidWithinBounds(
  amount: number,
  suggestedFare: number,
): boolean {
  return amount >= bidFloor(suggestedFare) && amount <= bidCeiling(suggestedFare);
}
