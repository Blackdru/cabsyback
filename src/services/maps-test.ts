/**
 * Test script to verify Google Maps API configuration
 * Run with: npx tsx src/services/maps-test.ts
 */

import { getDirections } from './maps';
import { env } from '../config/env';
import { logger } from '../config/logger';

async function testGoogleMapsAPI() {
  console.log('\n=== Google Maps API Test ===\n');
  
  // Check if API key is configured
  if (!env.GOOGLE_MAPS_API_KEY) {
    console.error('❌ GOOGLE_MAPS_API_KEY is not configured in .env file');
    process.exit(1);
  }
  
  console.log('✓ API Key is configured');
  console.log(`  Key: ${env.GOOGLE_MAPS_API_KEY.substring(0, 10)}...`);
  
  // Test coordinates (Bangalore, India - common test locations)
  const testCases = [
    {
      name: 'Bangalore Airport to MG Road',
      pickup: { lat: 13.1986, lng: 77.7066 }, // Bangalore Airport
      drop: { lat: 12.9716, lng: 77.5946 },   // MG Road, Bangalore
    },
    {
      name: 'Short distance (2km)',
      pickup: { lat: 12.9716, lng: 77.5946 },
      drop: { lat: 12.9850, lng: 77.6100 },
    },
    {
      name: 'Very close locations (should warn)',
      pickup: { lat: 12.9716, lng: 77.5946 },
      drop: { lat: 12.9717, lng: 77.5947 },
    },
  ];
  
  for (const testCase of testCases) {
    console.log(`\n--- Testing: ${testCase.name} ---`);
    console.log(`Pickup: ${testCase.pickup.lat}, ${testCase.pickup.lng}`);
    console.log(`Drop: ${testCase.drop.lat}, ${testCase.drop.lng}`);
    
    try {
      const result = await getDirections(testCase.pickup, testCase.drop);
      console.log('✓ Success!');
      console.log(`  Distance: ${result.distanceKm.toFixed(2)} km`);
      console.log(`  Duration: ${result.durationMinutes} minutes`);
      console.log(`  Polyline: ${result.polyline.substring(0, 50)}...`);
    } catch (error) {
      console.error('❌ Failed:', error instanceof Error ? error.message : String(error));
    }
  }
  
  console.log('\n=== Test Complete ===\n');
}

// Run the test
testGoogleMapsAPI().catch((error) => {
  console.error('Test failed with error:', error);
  process.exit(1);
});
