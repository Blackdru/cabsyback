"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.DirectionsUnavailableError = void 0;
exports.getDirections = getDirections;
const google_maps_services_js_1 = require("@googlemaps/google-maps-services-js");
const env_1 = require("../config/env");
const logger_1 = require("../config/logger");
const AppError_1 = require("../errors/AppError");
class DirectionsUnavailableError extends AppError_1.AppError {
    constructor(message = 'Failed to fetch route from Google Directions', details) {
        super(502, 'DIRECTIONS_UNAVAILABLE', message, details);
        this.name = 'DirectionsUnavailableError';
    }
}
exports.DirectionsUnavailableError = DirectionsUnavailableError;
const client = new google_maps_services_js_1.Client({});
async function getDirections(pickup, drop) {
    let response;
    try {
        response = await client.directions({
            params: {
                origin: { lat: pickup.lat, lng: pickup.lng },
                destination: { lat: drop.lat, lng: drop.lng },
                mode: google_maps_services_js_1.TravelMode.driving,
                units: google_maps_services_js_1.UnitSystem.metric,
                key: env_1.env.GOOGLE_MAPS_API_KEY,
            },
            timeout: 5000,
        });
    }
    catch (err) {
        logger_1.logger.error({ err: err instanceof Error ? err.message : String(err) }, 'getDirections: Google API call failed');
        throw new DirectionsUnavailableError();
    }
    const route = response.data.routes[0];
    const leg = route?.legs[0];
    if (!route || !leg) {
        throw new DirectionsUnavailableError('No route returned by Google Directions');
    }
    return {
        distanceKm: leg.distance.value / 1000,
        durationMinutes: Math.max(1, Math.ceil(leg.duration.value / 60)),
        polyline: route.overview_polyline.points,
    };
}
//# sourceMappingURL=maps.js.map