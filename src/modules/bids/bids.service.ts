import { pool } from '../../db/client';
import {
  BidNotLowerError,
  BidOutOfBoundsError,
  ConflictError,
  ForbiddenError,
  NotFoundError,
  RideAlreadyAssignedError,
  RideNotBiddableError,
} from '../../errors';
import { getIo } from '../../realtime/socket';
import { Rooms, ServerEvents } from '../../shared/events';
import { isBidWithinBounds } from '../../services/fare';
import type {
  Bid,
  BidWithDriver,
  Ride,
  RideAssignedPayload,
  RideBidLostPayload,
  RideBidUpdatePayload,
} from '../../shared/types';
import {
  acceptBidInTx,
  assignRideInTx,
  expireDriverActiveBids,
  findActiveBidForDriver,
  findDriverByUserId,
  findRideById,
  getAssignedDriverInfo,
  getBidByIdInTx,
  getBidsForRide as repoGetBidsForRide,
  getDriverByIdInTx,
  getDriverUserIdsByIds,
  insertBid,
  isUniqueViolation,
  lockRideForUpdate,
  mapBidRow,
  mapRideRow,
  rejectOtherBidsInTx,
  setDriverOnRideInTx,
  setRideStatusIfSearching,
  updateBidAmount,
} from './bids.repo';
import { sendNotification } from '../../services/push';

function broadcastBidUpdate(
  rideId: string,
  riderId: string,
  bidsList: BidWithDriver[],
): void {
  const payload: RideBidUpdatePayload = { rideId, bids: bidsList };
  const io = getIo();
  io.to(Rooms.ride(rideId)).emit(ServerEvents.RideBidUpdate, payload);
  io.to(Rooms.user(riderId)).emit(ServerEvents.RideBidUpdate, payload);
}

export async function getBidsForRide(rideId: string): Promise<BidWithDriver[]> {
  return repoGetBidsForRide(rideId);
}

export async function placeBid(
  userId: string,
  rideId: string,
  amount: number,
): Promise<{ bid: Bid; bids: BidWithDriver[] }> {
  const driverRow = await findDriverByUserId(userId);
  if (!driverRow) {
    throw new NotFoundError('Driver not found');
  }
  if (driverRow.status === 'on_ride' || driverRow.status === 'offline') {
    throw new ConflictError(
      'Driver is not online',
      undefined,
      driverRow.status === 'on_ride' ? 'DRIVER_ON_RIDE' : 'DRIVER_OFFLINE',
    );
  }

  const rideRow = await findRideById(rideId);
  if (!rideRow) {
    throw new NotFoundError('Ride not found');
  }
  if (rideRow.status !== 'searching' && rideRow.status !== 'bidding') {
    throw new RideNotBiddableError();
  }

  if (!isBidWithinBounds(amount, rideRow.suggestedFare)) {
    throw new BidOutOfBoundsError();
  }

  const now = new Date();
  if (!rideRow.biddingEndsAt || rideRow.biddingEndsAt <= now) {
    throw new RideNotBiddableError('Bidding window has closed');
  }

  let insertedRow;
  try {
    insertedRow = await insertBid({
      rideId,
      driverId: driverRow.id,
      amount,
    });
  } catch (err) {
    if (isUniqueViolation(err)) {
      throw new ConflictError(
        'Bid already placed; use revise',
        undefined,
        'BID_EXISTS',
      );
    }
    throw err;
  }

  if (rideRow.status === 'searching') {
    await setRideStatusIfSearching(rideId);
  }

  const bid = mapBidRow(insertedRow);
  const bidsList = await repoGetBidsForRide(rideId);
  broadcastBidUpdate(rideId, rideRow.riderId, bidsList);

  return { bid, bids: bidsList };
}

export async function reviseBid(
  userId: string,
  rideId: string,
  amount: number,
): Promise<{ bid: Bid; bids: BidWithDriver[] }> {
  const driverRow = await findDriverByUserId(userId);
  if (!driverRow) {
    throw new NotFoundError('Driver not found');
  }

  const existing = await findActiveBidForDriver(rideId, driverRow.id);
  if (!existing) {
    throw new NotFoundError('No active bid to revise');
  }

  if (amount >= existing.amount) {
    throw new BidNotLowerError();
  }

  const rideRow = await findRideById(rideId);
  if (!rideRow) {
    throw new NotFoundError('Ride not found');
  }

  if (!isBidWithinBounds(amount, rideRow.suggestedFare)) {
    throw new BidOutOfBoundsError();
  }

  if (rideRow.status !== 'bidding') {
    throw new RideNotBiddableError();
  }

  const now = new Date();
  if (!rideRow.biddingEndsAt || rideRow.biddingEndsAt <= now) {
    throw new RideNotBiddableError('Bidding window has closed');
  }

  const updatedRow = await updateBidAmount(existing.id, amount);
  if (!updatedRow) {
    // The bid was concurrently accepted/rejected/expired between our read and write.
    throw new ConflictError(
      'Bid is no longer active',
      undefined,
      'BID_NOT_ACTIVE',
    );
  }

  const bid = mapBidRow(updatedRow);
  const bidsList = await repoGetBidsForRide(rideId);
  broadcastBidUpdate(rideId, rideRow.riderId, bidsList);

  return { bid, bids: bidsList };
}

export async function acceptBid(
  userId: string,
  rideId: string,
  bidId: string,
): Promise<{ ride: Ride; winningBid: Bid }> {
  const tx = await pool.connect();
  let result: {
    ride: Ride;
    winningBid: Bid;
    winningDriverId: string;
    rejectedDriverIds: string[];
  };
  try {
    await tx.query('BEGIN');

    // SELECT FOR UPDATE on the ride is the linchpin: it serializes any concurrent
    // acceptBid attempts on the same ride so only one wins, the rest see the
    // already-assigned status and bail out cleanly.
    const rideRow = await lockRideForUpdate(tx, rideId);
    if (!rideRow) {
      throw new NotFoundError('Ride not found');
    }
    if (rideRow.riderId !== userId) {
      throw new ForbiddenError('Only the rider can accept bids on this ride');
    }
    if (rideRow.status === 'assigned') {
      throw new RideAlreadyAssignedError();
    }
    if (rideRow.status !== 'bidding') {
      throw new RideNotBiddableError();
    }

    const bidRow = await getBidByIdInTx(tx, bidId);
    if (!bidRow || bidRow.rideId !== rideId) {
      throw new NotFoundError('Bid not found');
    }
    if (bidRow.status !== 'active') {
      throw new ConflictError(
        'Bid is no longer active',
        undefined,
        'BID_NOT_ACTIVE',
      );
    }

    const driverRow = await getDriverByIdInTx(tx, bidRow.driverId);
    if (!driverRow || driverRow.status !== 'online') {
      throw new ConflictError(
        'Driver no longer available',
        undefined,
        'DRIVER_UNAVAILABLE',
      );
    }

    const updatedRideRow = await assignRideInTx(
      tx,
      rideId,
      bidRow.driverId,
      bidRow.amount,
    );
    if (!updatedRideRow) {
      throw new NotFoundError('Ride not found');
    }

    const acceptedRow = await acceptBidInTx(tx, bidRow.id);
    if (!acceptedRow) {
      throw new ConflictError(
        'Bid could not be accepted',
        undefined,
        'BID_ACCEPT_FAILED',
      );
    }

    const rejected = await rejectOtherBidsInTx(tx, rideId, bidRow.id);
    await setDriverOnRideInTx(tx, bidRow.driverId);

    await tx.query('COMMIT');

    result = {
      ride: mapRideRow(updatedRideRow),
      winningBid: mapBidRow(acceptedRow),
      winningDriverId: bidRow.driverId,
      rejectedDriverIds: rejected.map((r) => r.driverId),
    };
  } catch (err) {
    await tx.query('ROLLBACK').catch(() => {});
    throw err;
  } finally {
    tx.release();
  }

  // Post-commit: enrich + broadcast. Failures here must NOT undo the transaction.
  const driverInfo = await getAssignedDriverInfo(result.winningDriverId);
  const io = getIo();

  if (driverInfo) {
    const assignedPayload: RideAssignedPayload = {
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
    io.to(Rooms.ride(rideId)).emit(ServerEvents.RideAssigned, assignedPayload);
    io.to(Rooms.user(result.ride.riderId)).emit(
      ServerEvents.RideAssigned,
      assignedPayload,
    );
    io.to(Rooms.user(driverInfo.userId)).emit(
      ServerEvents.RideAssigned,
      assignedPayload,
    );

    // Best-effort push: rider + driver. Errors are swallowed by sendNotification.
    void sendNotification(result.ride.riderId, {
      title: 'Driver assigned',
      body: `${driverInfo.name || 'Your driver'} is on the way.`,
      data: { rideId },
    });
    void sendNotification(driverInfo.userId, {
      title: 'Ride accepted',
      body: 'Head to pickup.',
      data: { rideId },
    });
  }

  if (result.rejectedDriverIds.length > 0) {
    const userIds = await getDriverUserIdsByIds(result.rejectedDriverIds);
    const lostPayload: RideBidLostPayload = { rideId };
    for (const driverUserId of userIds.values()) {
      io.to(Rooms.user(driverUserId)).emit(
        ServerEvents.RideBidLost,
        lostPayload,
      );
    }
  }

  return { ride: result.ride, winningBid: result.winningBid };
}

export async function withdrawAllBidsForDriver(driverId: string): Promise<void> {
  const expired = await expireDriverActiveBids(driverId);
  if (expired.length === 0) return;

  // De-dupe affected rides so we re-broadcast each list at most once.
  const affectedRideIds = Array.from(new Set(expired.map((e) => e.rideId)));

  for (const rideId of affectedRideIds) {
    const rideRow = await findRideById(rideId);
    if (!rideRow) continue;
    const bidsList = await repoGetBidsForRide(rideId);
    broadcastBidUpdate(rideId, rideRow.riderId, bidsList);
  }
}
