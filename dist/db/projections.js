"use strict";
// Hand-rolled SELECT projections that alias snake_case columns to camelCase,
// so raw pg result rows match the same shape the codebase already uses (and
// the mapRideRow / mapDriverRow / mapBidRow helpers can stay unchanged as we
// migrate off Drizzle).
Object.defineProperty(exports, "__esModule", { value: true });
exports.USER_COLS = exports.BID_COLS = exports.DRIVER_COLS = exports.RIDE_COLS = void 0;
exports.RIDE_COLS = `
  id,
  rider_id            AS "riderId",
  pickup_lat          AS "pickupLat",
  pickup_lng          AS "pickupLng",
  pickup_address      AS "pickupAddress",
  drop_lat            AS "dropLat",
  drop_lng            AS "dropLng",
  drop_address        AS "dropAddress",
  distance_km         AS "distanceKm",
  duration_minutes    AS "durationMinutes",
  polyline,
  suggested_fare      AS "suggestedFare",
  status,
  assigned_driver_id  AS "assignedDriverId",
  final_fare          AS "finalFare",
  bidding_ends_at     AS "biddingEndsAt",
  dispatch_expanded_at AS "dispatchExpandedAt",
  created_at          AS "createdAt",
  started_at          AS "startedAt",
  completed_at        AS "completedAt"
`.trim();
exports.DRIVER_COLS = `
  id,
  user_id        AS "userId",
  license_no     AS "licenseNo",
  vehicle_no     AS "vehicleNo",
  vehicle_model  AS "vehicleModel",
  status,
  rating,
  kyc_verified   AS "kycVerified",
  last_seen_at   AS "lastSeenAt",
  created_at     AS "createdAt"
`.trim();
exports.BID_COLS = `
  id,
  ride_id    AS "rideId",
  driver_id  AS "driverId",
  amount,
  status,
  created_at AS "createdAt",
  updated_at AS "updatedAt"
`.trim();
exports.USER_COLS = `
  id,
  phone,
  name,
  rating,
  fcm_token  AS "fcmToken",
  created_at AS "createdAt"
`.trim();
//# sourceMappingURL=projections.js.map