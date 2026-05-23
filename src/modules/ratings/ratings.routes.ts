import { Router } from 'express';
import { requireAuth } from '../../middleware/auth';
import { validate } from '../../middleware/validate';
import { RateRideSchema } from '../../shared/schemas';
import { rate } from './ratings.controller';

const router = Router();

router.post('/:id/rate', requireAuth, validate(RateRideSchema), rate);

export default router;
