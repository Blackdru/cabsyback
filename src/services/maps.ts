import { Client, TravelMode, UnitSystem } from '@googlemaps/google-maps-services-js';
import { env } from '../config/env';
import { logger } from '../config/logger';
import { AppError } from '../errors/AppError';
import type { LatLng } from '../shared/types';

export class DirectionsUnavailableError extends AppError {
  constructor(message = 'Failed to fetch route from Google Directions', details?: unknown) {
    super(502, 'DIRECTIONS_UNAVAILABLE', message, details);
    this.name = 'DirectionsUnavailableError';
  }
}

export interface DirectionsResult {
  distanceKm: number;
  durationMinutes: number;
  polyline: string;
}

const client = new Client({});

/**
 * Calculate straight-line distance between two points using Haversine formula
 */
function haversineDistanceKm(pickup: LatLng, drop: LatLng): number {
  const R = 6371; // Earth's radius in km
  const dLat = ((drop.lat - pickup.lat) * Math.PI) / 180;
  const dLng = ((drop.lng - pickup.lng) * Math.PI) / 180;
  const lat1 = (pickup.lat * Math.PI) / 180;
  const lat2 = (drop.lat * Math.PI) / 180;

  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLng / 2) * Math.sin(dLng / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return R * c;
}

/**
 * Generate a simple straight-line polyline between two points
 */
function generateStraightPolyline(pickup: LatLng, drop: LatLng): string {
  // Simple polyline encoding for a straight line
  // This is a fallback - in production you'd want proper polyline encoding
  return `${pickup.lat},${pickup.lng}|${drop.lat},${drop.lng}`;
}

export async function getDirections(
  pickup: LatLng,
  drop: LatLng,
): Promise<DirectionsResult> {
  // Validate coordinates
  if (
    !pickup.lat || !pickup.lng || !drop.lat || !drop.lng ||
    Math.abs(pickup.lat) > 90 || Math.abs(drop.lat) > 90 ||
    Math.abs(pickup.lng) > 180 || Math.abs(drop.lng) > 180
  ) {
    logger.error({ pickup, drop }, 'Invalid coordinates provided');
    throw new DirectionsUnavailableError('Invalid coordinates provided');
  }

  // Check if pickup and drop are too close (less than 100 meters)
  const straightLineDistance = haversineDistanceKm(pickup, drop);
  if (straightLineDistance < 0.1) {
    logger.warn({ pickup, drop, distance: straightLineDistance }, 'Pickup and drop locations are too close');
    throw new DirectionsUnavailableError('Pickup and drop locations must be at least 100 meters apart');
  }

  let response;
  try {
    logger.info({ pickup, drop }, 'Requesting directions from Google Maps API');
    
    response = await client.directions({
      params: {
        origin: { lat: pickup.lat, lng: pickup.lng },
        destination: { lat: drop.lat, lng: drop.lng },
        mode: TravelMode.driving,
        units: UnitSystem.metric,
        key: env.GOOGLE_MAPS_API_KEY,
        alternatives: false, // Get only the best route
      },
      timeout: 10000, // Increased timeout to 10 seconds
    });
  } catch (err) {
    const errorMessage = err instanceof Error ? err.message : String(err);
    logger.error({ 
      err: errorMessage, 
      pickup, 
      drop,
      apiKey: env.GOOGLE_MAPS_API_KEY ? 'present' : 'missing'
    }, 'getDirections: Google API call failed');
    
    // Fallback to straight-line calculation
    logger.warn('Falling back to straight-line distance calculation');
    const fallbackDistance = straightLineDistance;
    const fallbackDuration = Math.max(1, Math.ceil((fallbackDistance / 40) * 60)); // Assume 40 km/h average
    
    return {
      distanceKm: fallbackDistance,
      durationMinutes: fallbackDuration,
      polyline: generateStraightPolyline(pickup, drop),
    };
  }

  // Check API response status
  if (response.data.status !== 'OK') {
    logger.error({ 
      status: response.data.status, 
      errorMessage: response.data.error_message,
      pickup,
      drop
    }, 'Google Directions API returned non-OK status');
    
    // Fallback to straight-line calculation
    logger.warn('Falling back to straight-line distance calculation due to API error');
    const fallbackDistance = straightLineDistance;
    const fallbackDuration = Math.max(1, Math.ceil((fallbackDistance / 40) * 60));
    
    return {
      distanceKm: fallbackDistance,
      durationMinutes: fallbackDuration,
      polyline: generateStraightPolyline(pickup, drop),
    };
  }

  const route = response.data.routes[0];
  const leg = route?.legs[0];
  
  if (!route || !leg || !leg.distance || !leg.duration) {
    logger.error({ 
      routeExists: !!route, 
      legExists: !!leg,
      pickup,
      drop
    }, 'No valid route returned by Google Directions');
    
    // Fallback to straight-line calculation
    logger.warn('Falling back to straight-line distance calculation - no route found');
    const fallbackDistance = straightLineDistance;
    const fallbackDuration = Math.max(1, Math.ceil((fallbackDistance / 40) * 60));
    
    return {
      distanceKm: fallbackDistance,
      durationMinutes: fallbackDuration,
      polyline: generateStraightPolyline(pickup, drop),
    };
  }

  logger.info({ 
    distanceKm: leg.distance.value / 1000,
    durationMinutes: Math.ceil(leg.duration.value / 60)
  }, 'Successfully retrieved directions from Google Maps API');

  return {
    distanceKm: leg.distance.value / 1000,
    durationMinutes: Math.max(1, Math.ceil(leg.duration.value / 60)),
    polyline: route.overview_polyline.points,
  };
}
