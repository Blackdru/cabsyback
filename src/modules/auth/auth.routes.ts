import { Router } from 'express';
import { validate } from '../../middleware/validate';
import { OtpRequestSchema, OtpVerifySchema, RefreshSchema } from '../../shared/schemas';
import { otpRequest, otpVerify, refresh } from './auth.controller';

const router = Router();

router.post('/otp/request', validate(OtpRequestSchema), otpRequest);
router.post('/otp/verify', validate(OtpVerifySchema), otpVerify);
router.post('/refresh', validate(RefreshSchema), refresh);

export default router;
