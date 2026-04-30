import type { Coords } from './types';

const MAPTILER_KEY = process.env.MAPTILER_GEOCODE_KEY;

const SA_CENTER: Coords = { lat: 29.4241, lng: -98.4936 };

const ZIP_COORDS: Record<string, Coords> = {
  '78023': { lat: 29.578, lng: -98.687 },
  '78249': { lat: 29.56, lng: -98.614 },
  '78260': { lat: 29.623, lng: -98.488 },
  '78258': { lat: 29.622, lng: -98.489 },
  '78261': { lat: 29.652, lng: -98.463 },
  '78209': { lat: 29.476, lng: -98.457 },
  '78250': { lat: 29.51, lng: -98.612 },
  '78253': { lat: 29.52, lng: -98.68 },
  '78266': { lat: 29.661, lng: -98.44 },
  '78254': { lat: 29.54, lng: -98.66 },
  '78251': { lat: 29.46, lng: -98.65 },
  '78223': { lat: 29.37, lng: -98.43 },
  '78218': { lat: 29.54, lng: -98.4 },
  '78213': { lat: 29.52, lng: -98.52 },
  '78006': { lat: 29.79, lng: -98.73 },
  '78227': { lat: 29.38, lng: -98.57 },
  '78221': { lat: 29.35, lng: -98.52 },
  '78232': { lat: 29.6, lng: -98.47 },
  '78255': { lat: 29.59, lng: -98.65 },
};

export type GeocodeConfidence = 'exact' | 'zip' | 'fallback';

export interface GeocodeResult {
  lat: number;
  lng: number;
  confidence: GeocodeConfidence;
}

function extractZip(address: string): string | null {
  const match = address.match(/\b(78\d{3})\b/);
  if (match) return match[1];
  if (/helotes/i.test(address)) return '78023';
  if (/boerne/i.test(address)) return '78006';
  return null;
}

async function maptilerSearch(query: string): Promise<Coords | null> {
  if (!MAPTILER_KEY) return null;

  const url = `https://api.maptiler.com/geocoding/${encodeURIComponent(
    query,
  )}.json?key=${MAPTILER_KEY}&country=us&limit=1&proximity=${SA_CENTER.lng},${SA_CENTER.lat}`;

  try {
    const res = await fetch(url, { method: 'GET' });
    if (!res.ok) return null;
    const json = (await res.json()) as { features?: Array<{ center?: [number, number] }> };
    const center = json.features?.[0]?.center;
    if (!center) return null;
    return { lng: center[0], lat: center[1] };
  } catch {
    return null;
  }
}

export async function geocode(address: string): Promise<GeocodeResult | null> {
  const direct = await maptilerSearch(address);
  if (direct) return { ...direct, confidence: 'exact' };

  const zip = extractZip(address);
  if (zip && ZIP_COORDS[zip]) {
    return { ...ZIP_COORDS[zip], confidence: 'zip' };
  }

  return { ...SA_CENTER, confidence: 'fallback' };
}
