import type { Coords } from './types';

const MILES_PER_DEGREE_LAT = 69.0;

export function jitter(lat: number, lng: number, miles: number): Coords {
  if (miles <= 0) {
    throw new Error('jitter miles must be > 0');
  }

  const milesPerDegreeLng = MILES_PER_DEGREE_LAT * Math.cos((lat * Math.PI) / 180);

  const angle = Math.random() * 2 * Math.PI;
  const radius = Math.random() * miles;

  const dLat = (radius * Math.cos(angle)) / MILES_PER_DEGREE_LAT;
  const dLng = (radius * Math.sin(angle)) / milesPerDegreeLng;

  return { lat: lat + dLat, lng: lng + dLng };
}
