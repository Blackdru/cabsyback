import type { NextFunction, Request, RequestHandler, Response } from 'express';
import { refreshAccess, requestOtp, verifyOtpAndAuthenticate } from './auth.service';
import type { OtpVerifyInput, RefreshInput, OtpRequestInput } from '../../shared/schemas';

function asyncHandler(
  fn: (req: Request, res: Response, next: NextFunction) => Promise<void>,
): RequestHandler {
  return (req, res, next) => {
    fn(req, res, next).catch(next);
  };
}

export const otpRequest: RequestHandler = asyncHandler(async (req, res) => {
  const { phone } = req.body as OtpRequestInput;
  await requestOtp(phone);
  res.status(200).json({ 
    ok: true,
    message: 'OTP sent successfully'
  });
});

export const otpVerify: RequestHandler = asyncHandler(async (req, res) => {
  const { phone, otp } = req.body as OtpVerifyInput;
  const { user, tokens } = await verifyOtpAndAuthenticate(phone, otp);
  res.status(200).json({
    accessToken: tokens.accessToken,
    refreshToken: tokens.refreshToken,
    user,
  });
});

export const refresh: RequestHandler = asyncHandler(async (req, res) => {
  const { refreshToken: incomingRefresh } = req.body as RefreshInput;
  const { accessToken, refreshToken } = await refreshAccess(incomingRefresh);
  // Refresh-token rotation: client MUST replace its stored refresh token
  // with the one returned here. The next refresh will issue another rotation.
  res.status(200).json({ accessToken, refreshToken });
});
