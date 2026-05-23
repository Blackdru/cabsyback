"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.Rooms = exports.ServerEvents = exports.ClientEvents = void 0;
exports.ClientEvents = {
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
};
exports.ServerEvents = {
    RideNewRequest: 'ride:newRequest',
    RideBidUpdate: 'ride:bidUpdate',
    RideAssigned: 'ride:assigned',
    RideBidLost: 'ride:bidLost',
    RideExpired: 'ride:expired',
    RideCancelled: 'ride:cancelled',
    RideStarted: 'ride:started',
    RideCompleted: 'ride:completed',
    DriverLocationUpdate: 'driver:locationUpdate',
};
exports.Rooms = {
    user: (userId) => `user:${userId}`,
    ride: (rideId) => `ride:${rideId}`,
    driversArea: (geoHash) => `drivers:area:${geoHash}`,
};
//# sourceMappingURL=events.js.map