"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.getBidsForRide = getBidsForRide;
exports.placeBid = placeBid;
exports.reviseBid = reviseBid;
exports.acceptBid = acceptBid;
exports.withdrawAllBidsForDriver = withdrawAllBidsForDriver;
const client_1 = require("../../db/client");
const errors_1 = require("../../errors");
const socket_1 = require("../../realtime/socket");
const events_1 = require("../../shared/events");
const fare_1 = require("../../services/fare");
const bids_repo_1 = require("./bids.repo");
const push_1 = require("../../services/push");
function broadcastBidUpdate(rideId, riderId, bidsList) {
    const payload = { rideId, bids: bidsList };
    const io = (0, socket_1.getIo)();
    io.to(events_1.Rooms.ride(rideId)).emit(events_1.ServerEvents.RideBidUpdate, payload);
    io.to(events_1.Rooms.user(riderId)).emit(events_1.ServerEvents.RideBidUpdate, payload);
}
async function getBidsForRide(rideId) {
    return (0, bids_repo_1.getBidsForRide)(rideId);
}
async function placeBid(userId, rideId, amount) {
    const driverRow = await (0, bids_repo_1.findDriverByUserId)(userId);
    if (!driverRow) {
        throw new errors_1.NotFoundError('Driver not found');
    }
    if (driverRow.status === 'on_ride' || driverRow.status === 'offline') {
        throw new errors_1.ConflictError('Driver is not online', undefined, driverRow.status === 'on_ride' ? 'DRIVER_ON_RIDE' : 'DRIVER_OFFLINE');
    }
    const rideRow = await (0, bids_repo_1.findRideById)(rideId);
    if (!rideRow) {
        throw new errors_1.NotFoundError('Ride not found');
    }
    if (rideRow.status !== 'searching' && rideRow.status !== 'bidding') {
        throw new errors_1.RideNotBiddableError();
    }
    if (!(0, fare_1.isBidWithinBounds)(amount, rideRow.suggestedFare)) {
        throw new errors_1.BidOutOfBoundsError();
    }
    const now = new Date();
    if (!rideRow.biddingEndsAt || rideRow.biddingEndsAt <= now) {
        throw new errors_1.RideNotBiddableError('Bidding window has closed');
    }
    let insertedRow;
    try {
        insertedRow = await (0, bids_repo_1.insertBid)({
            rideId,
            driverId: driverRow.id,
            amount,
        });
    }
    catch (err) {
        if ((0, bids_repo_1.isUniqueViolation)(err)) {
            throw new errors_1.ConflictError('Bid already placed; use revise', undefined, 'BID_EXISTS');
        }
        throw err;
    }
    if (rideRow.status === 'searching') {
        await (0, bids_repo_1.setRideStatusIfSearching)(rideId);
    }
    const bid = (0, bids_repo_1.mapBidRow)(insertedRow);
    const bidsList = await (0, bids_repo_1.getBidsForRide)(rideId);
    broadcastBidUpdate(rideId, rideRow.riderId, bidsList);
    return { bid, bids: bidsList };
}
async function reviseBid(userId, rideId, amount) {
    const driverRow = await (0, bids_repo_1.findDriverByUserId)(userId);
    if (!driverRow) {
        throw new errors_1.NotFoundError('Driver not found');
    }
    const existing = await (0, bids_repo_1.findActiveBidForDriver)(rideId, driverRow.id);
    if (!existing) {
        throw new errors_1.NotFoundError('No active bid to revise');
    }
    if (amount >= existing.amount) {
        throw new errors_1.BidNotLowerError();
    }
    const rideRow = await (0, bids_repo_1.findRideById)(rideId);
    if (!rideRow) {
        throw new errors_1.NotFoundError('Ride not found');
    }
    if (!(0, fare_1.isBidWithinBounds)(amount, rideRow.suggestedFare)) {
        throw new errors_1.BidOutOfBoundsError();
    }
    if (rideRow.status !== 'bidding') {
        throw new errors_1.RideNotBiddableError();
    }
    const now = new Date();
    if (!rideRow.biddingEndsAt || rideRow.biddingEndsAt <= now) {
        throw new errors_1.RideNotBiddableError('Bidding window has closed');
    }
    const updatedRow = await (0, bids_repo_1.updateBidAmount)(existing.id, amount);
    if (!updatedRow) {
        // The bid was concurrently accepted/rejected/expired between our read and write.
        throw new errors_1.ConflictError('Bid is no longer active', undefined, 'BID_NOT_ACTIVE');
    }
    const bid = (0, bids_repo_1.mapBidRow)(updatedRow);
    const bidsList = await (0, bids_repo_1.getBidsForRide)(rideId);
    broadcastBidUpdate(rideId, rideRow.riderId, bidsList);
    return { bid, bids: bidsList };
}
async function acceptBid(userId, rideId, bidId) {
    const tx = await client_1.pool.connect();
    let result;
    try {
        await tx.query('BEGIN');
        // SELECT FOR UPDATE on the ride is the linchpin: it serializes any concurrent
        // acceptBid attempts on the same ride so only one wins, the rest see the
        // already-assigned status and bail out cleanly.
        const rideRow = await (0, bids_repo_1.lockRideForUpdate)(tx, rideId);
        if (!rideRow) {
            throw new errors_1.NotFoundError('Ride not found');
        }
        if (rideRow.riderId !== userId) {
            throw new errors_1.ForbiddenError('Only the rider can accept bids on this ride');
        }
        if (rideRow.status === 'assigned') {
            throw new errors_1.RideAlreadyAssignedError();
        }
        if (rideRow.status !== 'bidding') {
            throw new errors_1.RideNotBiddableError();
        }
        const bidRow = await (0, bids_repo_1.getBidByIdInTx)(tx, bidId);
        if (!bidRow || bidRow.rideId !== rideId) {
            throw new errors_1.NotFoundError('Bid not found');
        }
        if (bidRow.status !== 'active') {
            throw new errors_1.ConflictError('Bid is no longer active', undefined, 'BID_NOT_ACTIVE');
        }
        const driverRow = await (0, bids_repo_1.getDriverByIdInTx)(tx, bidRow.driverId);
        if (!driverRow || driverRow.status !== 'online') {
            throw new errors_1.ConflictError('Driver no longer available', undefined, 'DRIVER_UNAVAILABLE');
        }
        const updatedRideRow = await (0, bids_repo_1.assignRideInTx)(tx, rideId, bidRow.driverId, bidRow.amount);
        if (!updatedRideRow) {
            throw new errors_1.NotFoundError('Ride not found');
        }
        const acceptedRow = await (0, bids_repo_1.acceptBidInTx)(tx, bidRow.id);
        if (!acceptedRow) {
            throw new errors_1.ConflictError('Bid could not be accepted', undefined, 'BID_ACCEPT_FAILED');
        }
        const rejected = await (0, bids_repo_1.rejectOtherBidsInTx)(tx, rideId, bidRow.id);
        await (0, bids_repo_1.setDriverOnRideInTx)(tx, bidRow.driverId);
        await tx.query('COMMIT');
        result = {
            ride: (0, bids_repo_1.mapRideRow)(updatedRideRow),
            winningBid: (0, bids_repo_1.mapBidRow)(acceptedRow),
            winningDriverId: bidRow.driverId,
            rejectedDriverIds: rejected.map((r) => r.driverId),
        };
    }
    catch (err) {
        await tx.query('ROLLBACK').catch(() => { });
        throw err;
    }
    finally {
        tx.release();
    }
    // Post-commit: enrich + broadcast. Failures here must NOT undo the transaction.
    const driverInfo = await (0, bids_repo_1.getAssignedDriverInfo)(result.winningDriverId);
    const io = (0, socket_1.getIo)();
    if (driverInfo) {
        const assignedPayload = {
            ride: result.ride,
            bid: result.winningBid,
            driver: {
                id: driverInfo.id,
                userId: driverInfo.userId,
                name: driverInfo.name,
                phone: driverInfo.phone,
                rating: driverInfo.rating,
                vehicleModel: driverInfo.vehicleModel,
                vehicleNo: driverInfo.vehicleNo,
            },
        };
        io.to(events_1.Rooms.ride(rideId)).emit(events_1.ServerEvents.RideAssigned, assignedPayload);
        io.to(events_1.Rooms.user(result.ride.riderId)).emit(events_1.ServerEvents.RideAssigned, assignedPayload);
        io.to(events_1.Rooms.user(driverInfo.userId)).emit(events_1.ServerEvents.RideAssigned, assignedPayload);
        // Best-effort push: rider + driver. Errors are swallowed by sendNotification.
        void (0, push_1.sendNotification)(result.ride.riderId, {
            title: 'Driver assigned',
            body: `${driverInfo.name || 'Your driver'} is on the way.`,
            data: { rideId },
        });
        void (0, push_1.sendNotification)(driverInfo.userId, {
            title: 'Ride accepted',
            body: 'Head to pickup.',
            data: { rideId },
        });
    }
    if (result.rejectedDriverIds.length > 0) {
        const userIds = await (0, bids_repo_1.getDriverUserIdsByIds)(result.rejectedDriverIds);
        const lostPayload = { rideId };
        for (const driverUserId of userIds.values()) {
            io.to(events_1.Rooms.user(driverUserId)).emit(events_1.ServerEvents.RideBidLost, lostPayload);
        }
    }
    return { ride: result.ride, winningBid: result.winningBid };
}
async function withdrawAllBidsForDriver(driverId) {
    const expired = await (0, bids_repo_1.expireDriverActiveBids)(driverId);
    if (expired.length === 0)
        return;
    // De-dupe affected rides so we re-broadcast each list at most once.
    const affectedRideIds = Array.from(new Set(expired.map((e) => e.rideId)));
    for (const rideId of affectedRideIds) {
        const rideRow = await (0, bids_repo_1.findRideById)(rideId);
        if (!rideRow)
            continue;
        const bidsList = await (0, bids_repo_1.getBidsForRide)(rideId);
        broadcastBidUpdate(rideId, rideRow.riderId, bidsList);
    }
}
//# sourceMappingURL=bids.service.js.map