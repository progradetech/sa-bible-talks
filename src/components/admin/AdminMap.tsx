'use client';

import { useEffect, useRef } from 'react';
import maplibregl from 'maplibre-gl';
import 'maplibre-gl/dist/maplibre-gl.css';
import type { MapLeader, Ministry } from '@/lib/types';

const SA_CENTER: [number, number] = [-98.4936, 29.4241];
const DEFAULT_JITTER_MILES = 1.5;
const EARTH_RADIUS_MILES = 3959;

const MINISTRY_COLORS: Record<Ministry, string> = {
  Family: '#2196F3',
  YoPro: '#FF9800',
  Campus: '#9C27B0',
  Singles: '#E91E63',
  Spanish: '#4CAF50',
};

// 64-sided polygon approximation of a real-world circle (same as the public
// map) — redacted talks render as approximate areas, not pinpoints.
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

interface Props {
  leaders: MapLeader[];
  selectedLeaderId: string | null;
  onSelect: (id: string | null) => void;
}

export function AdminMap({ leaders, selectedLeaderId, onSelect }: Props) {
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<maplibregl.Map | null>(null);

  // onSelect and selectedLeaderId captured in refs so the MapLibre click
  // handler (attached once at init) can read latest values without forcing
  // the init useEffect to re-run on every render.
  const onSelectRef = useRef(onSelect);
  useEffect(() => {
    onSelectRef.current = onSelect;
  }, [onSelect]);

  const selectedLeaderIdRef = useRef(selectedLeaderId);
  useEffect(() => {
    selectedLeaderIdRef.current = selectedLeaderId;
  }, [selectedLeaderId]);

  // Initialize the map once. The leaders array is server-rendered and
  // stable across client re-renders.
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

    map.on('styleimagemissing', (e: { id: string }) => {
      if (map.hasImage(e.id)) return;
      map.addImage(e.id, { width: 1, height: 1, data: new Uint8Array(4) });
    });

    map.on('load', () => {
      if (leaders.length > 0) {
        const bounds = new maplibregl.LngLatBounds();
        leaders.forEach((l) => bounds.extend([l.exactLng, l.exactLat]));
        map.fitBounds(bounds, { padding: 80, maxZoom: 12 });
      }

      // Redacted talks (leader-role viewer, not their own) render as
      // approximate area circles like the public map; everything else keeps
      // the exact pinpoint.
      const pinFeatures = leaders
        .filter((l) => !l.redacted)
        .map((l) => ({
          type: 'Feature' as const,
          geometry: {
            type: 'Point' as const,
            coordinates: [l.exactLng, l.exactLat],
          },
          properties: {
            id: l.id,
            ministry: l.ministry,
            name: l.name,
            color: MINISTRY_COLORS[l.ministry] ?? '#999',
          },
        }));

      const areaFeatures = leaders
        .filter((l) => l.redacted)
        .map((l) => ({
          type: 'Feature' as const,
          geometry: {
            type: 'Polygon' as const,
            coordinates: [
              circlePolygon(
                l.approxLat,
                l.approxLng,
                l.jitterMiles ?? DEFAULT_JITTER_MILES,
              ),
            ],
          },
          properties: {
            id: l.id,
            color: MINISTRY_COLORS[l.ministry] ?? '#999',
          },
        }));

      map.addSource('leader-areas', {
        type: 'geojson',
        data: { type: 'FeatureCollection', features: areaFeatures },
      });
      map.addLayer({
        id: 'leader-areas-fill',
        type: 'fill',
        source: 'leader-areas',
        paint: { 'fill-color': ['get', 'color'], 'fill-opacity': 0.18 },
      });
      map.addLayer({
        id: 'leader-areas-line',
        type: 'line',
        source: 'leader-areas',
        paint: { 'line-color': ['get', 'color'], 'line-width': 2 },
      });

      map.addSource('leaders', {
        type: 'geojson',
        data: { type: 'FeatureCollection', features: pinFeatures },
      });

      map.addLayer({
        id: 'leader-points',
        type: 'circle',
        source: 'leaders',
        paint: {
          'circle-radius': 8,
          'circle-color': ['get', 'color'],
          'circle-stroke-color': '#ffffff',
          'circle-stroke-width': 2,
          'circle-opacity': 0.95,
        },
      });

      const handleFeatureClick = (e: maplibregl.MapLayerMouseEvent) => {
        const feature = e.features?.[0];
        const id = feature?.properties?.id as string | undefined;
        if (!id) return;
        // Toggle: clicking the already-selected pin deselects, matching
        // the sidebar's behavior.
        onSelectRef.current(selectedLeaderIdRef.current === id ? null : id);
      };
      map.on('click', 'leader-points', handleFeatureClick);
      map.on('click', 'leader-areas-fill', (e) => {
        // A pin rendered on top of an area wins the click — skip the area
        // handler so one click doesn't select-then-deselect.
        const pinsHit = map.queryRenderedFeatures(e.point, {
          layers: ['leader-points'],
        });
        if (pinsHit.length > 0) return;
        handleFeatureClick(e);
      });

      for (const layer of ['leader-points', 'leader-areas-fill']) {
        map.on('mouseenter', layer, () => {
          map.getCanvas().style.cursor = 'pointer';
        });
        map.on('mouseleave', layer, () => {
          map.getCanvas().style.cursor = '';
        });
      }
    });

    // MapLibre captures its container's dimensions at init time. If the
    // flex parent settles into its real size after the first render (or the
    // window resizes), the canvas needs to be told. ResizeObserver covers
    // both cases.
    const container = containerRef.current;
    const resizeObserver = new ResizeObserver(() => {
      map.resize();
    });
    resizeObserver.observe(container);

    return () => {
      resizeObserver.disconnect();
      map.remove();
      mapRef.current = null;
    };
  }, [leaders]);

  // Highlight the selected pin and pan to it.
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;

    const apply = () => {
      if (!map.getLayer('leader-points')) return;
      map.setPaintProperty('leader-points', 'circle-radius', [
        'case',
        ['==', ['get', 'id'], selectedLeaderId ?? ''],
        14,
        8,
      ]);
      map.setPaintProperty('leader-points', 'circle-stroke-width', [
        'case',
        ['==', ['get', 'id'], selectedLeaderId ?? ''],
        4,
        2,
      ]);
      if (map.getLayer('leader-areas-fill')) {
        map.setPaintProperty('leader-areas-fill', 'fill-opacity', [
          'case',
          ['==', ['get', 'id'], selectedLeaderId ?? ''],
          0.35,
          0.18,
        ]);
      }
      if (selectedLeaderId) {
        const leader = leaders.find((l) => l.id === selectedLeaderId);
        if (leader) {
          map.easeTo({
            center: [leader.exactLng, leader.exactLat],
            duration: 600,
          });
        }
      }
    };

    if (map.isStyleLoaded() && map.getLayer('leader-points')) {
      apply();
    } else {
      map.once('idle', apply);
    }
  }, [selectedLeaderId, leaders]);

  // `w-full h-full` rather than `absolute inset-0` — MapLibre adds a
  // `.maplibregl-map` class to its container which sets `position: relative`,
  // and that wins over our `absolute`. Once position becomes relative,
  // `inset-0` stops being a sizing constraint and the container collapses
  // to content height (0 before the canvas lays out). Explicit
  // dimensions sidestep the conflict.
  return <div ref={containerRef} className="w-full h-full" />;
}
