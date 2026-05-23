export type UserRole = 'rider' | 'driver';

export type RideStatus =
  | 'searching'
  | 'bidding'
  | 'assigned'
  | 'started'
  | 'completed'
  | 'cancelled'
  | 'expired';

export type BidStatus = 'active' | 'accepted' | 'rejected' | 'expired';

export type DriverStatus = 'offline' | 'online' | 'on_ride';

export type CancelledBy = 'rider' | 'driver' | 'system';

export interface LatLng {
  lat: number;
  lng: number;
}

export interface User {
  id: string;
  phone: string;
  name: string | null;
  rating: number;
  createdAt: string;
}

export interface Driver {
  id: string;
  userId: string;
  licenseNo: string;
  vehicleNo: string;
  vehicleModel: string;
  status: DriverStatus;
  rating: number;
  kycVerified: boolean;
}

export interface Ride {
  id: string;
  riderId: string;
  pickupLat: number;
  pickupLng: number;
  pickupAddress: string;
  dropLat: number;
  dropLng: number;
  dropAddress: string;
  distanceKm: number;
  durationMinutes: number | null;
  polyline: string | null;
  suggestedFare: number;
  status: RideStatus;
  assignedDriverId: string | null;
  finalFare: number | null;
  biddingEndsAt: string;
  createdAt: string;
  startedAt: string | null;
  completedAt: string | null;
}

export interface Bid {
  id: string;
  rideId: string;
  driverId: string;
  amount: number;
  status: BidStatus;
  createdAt: string;
  updatedAt: string;
}

export interface BidWithDriver extends Bid {
  driverName: string;
  driverRating: number;
  vehicleModel: string;
  etaMinutes: number;
}

export interface Rating {
  id: string;
  rideId: string;
  byUserId: string;
  forUserId: string;
  stars: number;
  comment: string | null;
}

export interface JwtPayload {
  sub: string;
  role: UserRole;
  iat: number;
  exp: number;
}

export interface AuthTokens {
  accessToken: string;
  refreshToken: string;
}

export interface RideNewRequestPayload {
  ride: Ride;
  suggestedFare: number;
  biddingEndsAt: string;
  // Rider identity surfaced to the driver's IncomingRide screen so they
  // can see who's calling before bidding. Name is nullable for users
  // who haven't filled in their profile yet.
  riderName: string | null;
  riderRating: number;
}

export interface RideBidUpdatePayload {
  rideId: string;
  bids: BidWithDriver[];
}

export interface RideAssignedPayload {
  ride: Ride;
  bid: Bid;
  driver: {
    id: string;
    userId: string;
    name: string;
    phone: string;
    rating: number;
    vehicleModel: string;
    vehicleNo: string;
  };
}

export interface RideStartedPayload {
  rideId: string;
  startedAt: string;
}

export interface RideCompletedPayload {
  rideId: string;
  completedAt: string;
  finalFare: number;
}

export interface RideBidLostPayload {
  rideId: string;
}

export interface RideExpiredPayload {
  rideId: string;
  reason: 'no_bids' | 'no_acceptance' | 'timeout';
}

export interface RideCancelledPayload {
  rideId: string;
  by: CancelledBy;
}

export interface DriverLocationBroadcastPayload {
  rideId: string;
  lat: number;
  lng: number;
}

export interface SocketAck<T = void> {
  ok: boolean;
  data?: T;
  error?: { code: string; message: string };
}
