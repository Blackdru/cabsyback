import { z } from 'zod';

const e164Regex = /^\+[1-9]\d{7,14}$/;

export const PhoneSchema = z
  .string()
  .trim()
  .regex(e164Regex, 'phone must be in E.164 format');

export const LatLngSchema = z.object({
  lat: z.number().min(-90).max(90),
  lng: z.number().min(-180).max(180),
});
export type LatLngInput = z.infer<typeof LatLngSchema>;

const PlaceSchema = z.object({
  lat: z.number().min(-90).max(90),
  lng: z.number().min(-180).max(180),
  address: z.string().trim().min(1).max(500),
});

export const OtpRequestSchema = z.object({
  phone: PhoneSchema,
});
export type OtpRequestInput = z.infer<typeof OtpRequestSchema>;

export const OtpVerifySchema = z.object({
  phone: PhoneSchema,
  otp: z.string().trim().length(6, 'OTP must be 6 digits').regex(/^\d{6}$/, 'OTP must contain only digits'),
});
export type OtpVerifyInput = z.infer<typeof OtpVerifySchema>;

export const RefreshSchema = z.object({
  refreshToken: z.string().trim().min(1),
});
export type RefreshInput = z.infer<typeof RefreshSchema>;

export const UpdateMeSchema = z.object({
  name: z.string().trim().min(1).max(60).optional(),
});
export type UpdateMeInput = z.infer<typeof UpdateMeSchema>;

export const OnboardDriverSchema = z.object({
  licenseNo: z.string().trim().min(1).max(50),
  vehicleNo: z.string().trim().min(1).max(20),
  vehicleModel: z.string().trim().min(1).max(80),
});
export type OnboardDriverInput = z.infer<typeof OnboardDriverSchema>;

export const CreateRideSchema = z.object({
  pickup: PlaceSchema,
  drop: PlaceSchema,
});
export type CreateRideInput = z.infer<typeof CreateRideSchema>;

export const RateRideSchema = z.object({
  stars: z.number().int().min(1).max(5),
  comment: z.string().trim().max(500).optional(),
});
export type RateRideInput = z.infer<typeof RateRideSchema>;

export const LocationUpdateSchema = LatLngSchema;
export type LocationUpdateInput = z.infer<typeof LocationUpdateSchema>;

export const PlaceBidSchema = z.object({
  rideId: z.string().uuid(),
  amount: z.number().int().positive(),
});
export type PlaceBidInput = z.infer<typeof PlaceBidSchema>;

export const ReviseBidSchema = z.object({
  rideId: z.string().uuid(),
  amount: z.number().int().positive(),
});
export type ReviseBidInput = z.infer<typeof ReviseBidSchema>;

export const AcceptBidSchema = z.object({
  rideId: z.string().uuid(),
  bidId: z.string().uuid(),
});
export type AcceptBidInput = z.infer<typeof AcceptBidSchema>;

export const CancelRideSchema = z.object({
  rideId: z.string().uuid(),
});
export type CancelRideInput = z.infer<typeof CancelRideSchema>;

export const CompleteRideSchema = z.object({
  rideId: z.string().uuid(),
});
export type CompleteRideInput = z.infer<typeof CompleteRideSchema>;

export const HistoryQuerySchema = z.object({
  cursor: z.string().uuid().optional(),
  limit: z.coerce.number().int().min(1).max(50).optional(),
});
export type HistoryQueryInput = z.infer<typeof HistoryQuerySchema>;

export const StartRideSchema = z.object({
  rideId: z.string().uuid(),
});
export type StartRideInput = z.infer<typeof StartRideSchema>;

export const SetFcmTokenSchema = z.object({
  token: z.string().min(1),
});
export type SetFcmTokenInput = z.infer<typeof SetFcmTokenSchema>;
