import { Router } from 'express';
import { requireAuth } from '../../middleware/auth';
import { validate } from '../../middleware/validate';
import { OnboardDriverSchema } from '../../shared/schemas';
import { getEarnings, onboard } from './drivers.controller';

const router = Router();

router.post('/onboard', requireAuth, validate(OnboardDriverSchema), onboard);
router.get('/me/earnings', requireAuth, getEarnings);

export default router;
