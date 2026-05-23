import { Router } from 'express';
import { requireAuth } from '../../middleware/auth';
import { validate } from '../../middleware/validate';
import { SetFcmTokenSchema, UpdateMeSchema } from '../../shared/schemas';
import { deleteMe, getMe, patchFcmToken, patchMe } from './users.controller';

const router = Router();

router.use(requireAuth);

router.get('/', getMe);
router.patch('/', validate(UpdateMeSchema), patchMe);
router.patch('/fcm-token', validate(SetFcmTokenSchema), patchFcmToken);
router.delete('/', deleteMe);

export default router;
