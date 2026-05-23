"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.SetFcmTokenSchema = exports.StartRideSchema = exports.HistoryQuerySchema = exports.CompleteRideSchema = exports.CancelRideSchema = exports.AcceptBidSchema = exports.ReviseBidSchema = exports.PlaceBidSchema = exports.LocationUpdateSchema = exports.RateRideSchema = exports.CreateRideSchema = exports.OnboardDriverSchema = exports.UpdateMeSchema = exports.RefreshSchema = exports.OtpVerifySchema = exports.OtpRequestSchema = exports.LatLngSchema = exports.PhoneSchema = void 0;
const zod_1 = require("zod");
const e164Regex = /^\+[1-9]\d{7,14}$/;
exports.PhoneSchema = zod_1.z
    .string()
    .trim()
    .regex(e164Regex, 'phone must be in E.164 format');
exports.LatLngSchema = zod_1.z.object({
    lat: zod_1.z.number().min(-90).max(90),
    lng: zod_1.z.number().min(-180).max(180),
});
const PlaceSchema = zod_1.z.object({
    lat: zod_1.z.number().min(-90).max(90),
    lng: zod_1.z.number().min(-180).max(180),
    address: zod_1.z.string().trim().min(1).max(500),
});
exports.OtpRequestSchema = zod_1.z.object({
    phone: exports.PhoneSchema,
});
exports.OtpVerifySchema = zod_1.z.object({
    phone: exports.PhoneSchema,
    otp: zod_1.z.string().trim().length(6, 'OTP must be 6 digits').regex(/^\d{6}$/, 'OTP must contain only digits'),
});
exports.RefreshSchema = zod_1.z.object({
    refreshToken: zod_1.z.string().trim().min(1),
});
exports.UpdateMeSchema = zod_1.z.object({
    name: zod_1.z.string().trim().min(1).max(60).optional(),
});
exports.OnboardDriverSchema = zod_1.z.object({
    licenseNo: zod_1.z.string().trim().min(1).max(50),
    vehicleNo: zod_1.z.string().trim().min(1).max(20),
    vehicleModel: zod_1.z.string().trim().min(1).max(80),
});
exports.CreateRideSchema = zod_1.z.object({
    pickup: PlaceSchema,
    drop: PlaceSchema,
});
exports.RateRideSchema = zod_1.z.object({
    stars: zod_1.z.number().int().min(1).max(5),
    comment: zod_1.z.string().trim().max(500).optional(),
});
exports.LocationUpdateSchema = exports.LatLngSchema;
exports.PlaceBidSchema = zod_1.z.object({
    rideId: zod_1.z.string().uuid(),
    amount: zod_1.z.number().int().positive(),
});
exports.ReviseBidSchema = zod_1.z.object({
    rideId: zod_1.z.string().uuid(),
    amount: zod_1.z.number().int().positive(),
});
exports.AcceptBidSchema = zod_1.z.object({
    rideId: zod_1.z.string().uuid(),
    bidId: zod_1.z.string().uuid(),
});
exports.CancelRideSchema = zod_1.z.object({
    rideId: zod_1.z.string().uuid(),
});
exports.CompleteRideSchema = zod_1.z.object({
    rideId: zod_1.z.string().uuid(),
});
exports.HistoryQuerySchema = zod_1.z.object({
    cursor: zod_1.z.string().uuid().optional(),
    limit: zod_1.z.coerce.number().int().min(1).max(50).optional(),
});
exports.StartRideSchema = zod_1.z.object({
    rideId: zod_1.z.string().uuid(),
});
exports.SetFcmTokenSchema = zod_1.z.object({
    token: zod_1.z.string().min(1),
});
//# sourceMappingURL=index.js.map