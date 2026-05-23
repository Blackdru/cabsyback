export const ClientEvents = {
  DriverGoOnline: 'driver:goOnline',
  DriverGoOffline: 'driver:goOffline',
  DriverLocationUpdate: 'driver:locationUpdate',
  DriverPlaceBid: 'driver:placeBid',
  DriverReviseBid: 'driver:reviseBid',
  RiderAcceptBid: 'rider:acceptBid',
  RiderCancelRide: 'rider:cancelRide',
  RideCompleteByDriver: 'ride:completeByDriver',
  DriverStartRide: 'driver:startRide',
  // Documented extension: lets a rider socket subscribe to its own ride room
  // so it receives bid updates and assignment events. Riders create rides via
  // REST so they aren't auto-joined to ride rooms on connect.
  RiderJoinRide: 'rider:joinRide',
} as const;

export type ClientEventName = (typeof ClientEvents)[keyof typeof ClientEvents];

export const ServerEvents = {
  RideNewRequest: 'ride:newRequest',
  RideBidUpdate: 'ride:bidUpdate',
  RideAssigned: 'ride:assigned',
  RideBidLost: 'ride:bidLost',
  RideExpired: 'ride:expired',
  RideCancelled: 'ride:cancelled',
  RideStarted: 'ride:started',
  RideCompleted: 'ride:completed',
  DriverLocationUpdate: 'driver:locationUpdate',
} as const;

export type ServerEventName = (typeof ServerEvents)[keyof typeof ServerEvents];

export const Rooms = {
  user: (userId: string): string => `user:${userId}`,
  ride: (rideId: string): string => `ride:${rideId}`,
  driversArea: (geoHash: string): string => `drivers:area:${geoHash}`,
};
