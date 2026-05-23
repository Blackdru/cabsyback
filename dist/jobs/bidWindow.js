"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.expireBiddingRidesOnce = expireBiddingRidesOnce;
exports.startBidWindowJob = startBidWindowJob;
exports.stopBidWindowJob = stopBidWindowJob;
const client_1 = require("../db/client");
const logger_1 = require("../config/logger");
const socket_1 = require("../realtime/socket");
const events_1 = require("../shared/events");
const push_1 = require("../services/push");
const lock_1 = require("./lock");
async function expireBiddingRidesOnce() {
    // Advisory lock: at most one instance runs this section at a time.
    // Other instances skip — the next tick will retry safely.
    const result = await (0, lock_1.withAdvisoryLock)(lock_1.LOCK_BID_WINDOW, () => doExpireBiddingRides());
    return result ?? 0;
}
async function doExpireBiddingRides() {
    logger_1.logger.debug('bidWindow tick start');
    const now = new Date();
    const { rows: due } = await client_1.pool.query(`SELECT id, rider_id FROM rides
     WHERE status = 'bidding' AND bidding_ends_at < $1`, [now]);
    if (due.length === 0) {
        logger_1.logger.debug({ expired: 0 }, 'bidWindow tick end');
        return 0;
    }
    const expired = [];
    for (const candidate of due) {
        const client = await client_1.pool.connect();
        try {
            await client.query('BEGIN');
            // Re-check status under the transaction to avoid racing with rider:acceptBid
            // (which sets status=assigned) or with any other expiry tick.
            const fresh = await client.query(`SELECT id, status, rider_id FROM rides WHERE id = $1 LIMIT 1`, [candidate.id]);
            const row = fresh.rows[0];
            if (!row || row.status !== 'bidding') {
                await client.query('COMMIT');
                continue;
            }
            // Count bids inside the same tx so the no_bids/no_acceptance reason
            // accurately reflects the world at expiry time.
            const countRes = await client.query(`SELECT count(*)::int AS c FROM bids WHERE ride_id = $1`, [candidate.id]);
            const bidCount = countRes.rows[0]?.c ?? 0;
            await client.query(`UPDATE rides SET status = 'expired' WHERE id = $1`, [candidate.id]);
            await client.query(`UPDATE bids SET status = 'expired'
         WHERE ride_id = $1 AND status = 'active'`, [candidate.id]);
            await client.query('COMMIT');
            expired.push({ rideId: row.id, riderId: row.rider_id, bidCount });
        }
        catch (err) {
            await client.query('ROLLBACK').catch(() => { });
            const message = err instanceof Error ? err.message : String(err);
            logger_1.logger.warn({ err: message, rideId: candidate.id }, 'failed to expire ride');
        }
        finally {
            client.release();
        }
    }
    if (expired.length > 0) {
        try {
            const io = (0, socket_1.getIo)();
            for (const e of expired) {
                const reason = e.bidCount === 0 ? 'no_bids' : 'no_acceptance';
                const payload = { rideId: e.rideId, reason };
                io.to(events_1.Rooms.ride(e.rideId)).emit(events_1.ServerEvents.RideExpired, payload);
                io.to(events_1.Rooms.user(e.riderId)).emit(events_1.ServerEvents.RideExpired, payload);
                void (0, push_1.sendNotification)(e.riderId, {
                    title: reason === 'no_bids' ? 'No drivers available' : 'Bidding ended',
                    body: reason === 'no_bids'
                        ? 'Please try again.'
                        : 'No bid was accepted in time.',
                    data: { rideId: e.rideId },
                });
            }
        }
        catch (err) {
            const message = err instanceof Error ? err.message : String(err);
            logger_1.logger.warn({ err: message }, 'failed to broadcast ride expiry');
        }
    }
    logger_1.logger.debug({ expired: expired.length }, 'bidWindow tick end');
    return expired.length;
}
function startBidWindowJob(intervalMs = 5000) {
    return setInterval(() => {
        const startedAt = Date.now();
        void expireBiddingRidesOnce()
            .catch((err) => {
            const message = err instanceof Error ? err.message : String(err);
            logger_1.logger.warn({ err: message }, 'bidWindow tick failed');
        })
            .finally(() => {
            const took = Date.now() - startedAt;
            if (took > intervalMs) {
                logger_1.logger.warn({ took, intervalMs }, 'bidWindow tick exceeded interval');
            }
        });
    }, intervalMs);
}
function stopBidWindowJob(handle) {
    clearInterval(handle);
}
//# sourceMappingURL=bidWindow.js.map