import { Router } from 'express';
import { requireAuth } from '../../middleware/auth';
import { idempotency } from '../../middleware/idempotency';
import { validate } from '../../middleware/validate';
import { CreateRideSchema, HistoryQuerySchema } from '../../shared/schemas';
import { createRide, getRide, getRideHistory } from './rides.controller';

const router = Router();

router.use(requireAuth);

// Idempotency-Key support on POST /rides: clients should send a UUID header
// so a network retry doesn't accidentally create a second ride.
router.post('/', idempotency, validate(CreateRideSchema), createRide);
// `/history` must be registered before `/:id` so it isn't shadowed by the param route.
router.get('/history', validate(HistoryQuerySchema, 'query'), getRideHistory);
router.get('/:id', getRide);

export default router;
