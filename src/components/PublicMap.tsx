'use client';

import { useEffect, useRef } from 'react';
import maplibregl from 'maplibre-gl';
import 'maplibre-gl/dist/maplibre-gl.css';
import type { PublicLeader } from '@/lib/types';

const SA_CENTER: [number, number] = [-98.4936, 29.4241];
const DEFAULT_JITTER_MILES = 1.5;
const EARTH_RADIUS_MILES = 3959;

const MINISTRY_COLORS: Record<string, string> = {
  Family: '#2196F3',
  YoPro: '#FF9800',
  Campus: '#9C27B0',
  Singles: '#E91E63',
  Spanish: '#4CAF50',
};

// Generate a polygon approximation of a real-world circle so MapLibre
// renders it in geographic units (miles) rather than fixed pixels. 64 sides
// is enough for a smooth-looking circle at any zoom level.
function circlePolygon(
  lat: number,
  lng: number,
  miles: number,
  points = 64,
): [number, number][] {
  const angDist = miles / EARTH_RADIUS_MILES;
  const latRad = (lat * Math.PI) / 180;
  const lngRad = (lng * Math.PI) / 180;
  const coords: [number, number][] = [];
  for (let i = 0; i <= points; i++) {
    const bearing = (i * 2 * Math.PI) / points;
    const newLatRad = Math.asin(
      Math.sin(latRad) * Math.cos(angDist) +
        Math.cos(latRad) * Math.sin(angDist) * Math.cos(bearing),
    );
    const newLngRad =
      lngRad +
      Math.atan2(
        Math.sin(bearing) * Math.sin(angDist) * Math.cos(latRad),
        Math.cos(angDist) - Math.sin(latRad) * Math.sin(newLatRad),
      );
    coords.push([(newLngRad * 180) / Math.PI, (newLatRad * 180) / Math.PI]);
  }
  return coords;
}

export function PublicMap({ locations }: { locations: PublicLeader[] }) {
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<maplibregl.Map | null>(null);

  useEffect(() => {
    if (!containerRef.current || mapRef.current) return;

    const apiKey = process.env.NEXT_PUBLIC_MAPTILER_KEY;
    if (!apiKey) {
      console.error('NEXT_PUBLIC_MAPTILER_KEY not set');
      return;
    }

    const map = new maplibregl.Map({
      container: containerRef.current,
      style: `https://api.maptiler.com/maps/streets-v2/style.json?key=${apiKey}`,
      center: SA_CENTER,
      zoom: 10,
    });

    map.addControl(new maplibregl.NavigationControl(), 'top-right');
    mapRef.current = map;

    map.on('load', () => {
      // Fit to the bounds of all visible leaders, falling back to SA center
      // if the dataset is empty (e.g., everyone hidden via Tier-4 escape hatch).
      if (locations.length > 0) {
        const bounds = new maplibregl.LngLatBounds();
        locations.forEach((loc) => bounds.extend([loc.approxLng, loc.approxLat]));
        map.fitBounds(bounds, { padding: 60, maxZoom: 12 });
      }

      const features = locations.map((loc) => ({
        type: 'Feature' as const,
        geometry: {
          type: 'Polygon' as const,
          coordinates: [
            circlePolygon(
              loc.approxLat,
              loc.approxLng,
              loc.jitterMiles ?? DEFAULT_JITTER_MILES,
            ),
          ],
        },
        properties: {
          id: loc.id,
          ministry: loc.ministry,
          color: MINISTRY_COLORS[loc.ministry] ?? '#999',
        },
      }));

      map.addSource('ministry-areas', {
        type: 'geojson',
        data: { type: 'FeatureCollection', features },
      });

      map.addLayer({
        id: 'ministry-fill',
        type: 'fill',
        source: 'ministry-areas',
        paint: {
          'fill-color': ['get', 'color'],
          'fill-opacity': 0.18,
        },
      });

      map.addLayer({
        id: 'ministry-line',
        type: 'line',
        source: 'ministry-areas',
        paint: {
          'line-color': ['get', 'color'],
          'line-width': 2,
        },
      });
    });

    return () => {
      map.remove();
      mapRef.current = null;
    };
  }, [locations]);

  return <div ref={containerRef} className="w-full h-full" />;
}
