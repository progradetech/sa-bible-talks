'use client';

import { useEffect, useRef } from 'react';
import maplibregl from 'maplibre-gl';
import 'maplibre-gl/dist/maplibre-gl.css';
import type { Ministry, PrivateLeader } from '@/lib/types';

const SA_CENTER: [number, number] = [-98.4936, 29.4241];

const MINISTRY_COLORS: Record<Ministry, string> = {
  Family: '#2196F3',
  YoPro: '#FF9800',
  Campus: '#9C27B0',
  Singles: '#E91E63',
  Spanish: '#4CAF50',
};

interface Props {
  leaders: PrivateLeader[];
  selectedLeaderId: string | null;
  onSelect: (id: string | null) => void;
}

export function AdminMap({ leaders, selectedLeaderId, onSelect }: Props) {
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<maplibregl.Map | null>(null);

  // onSelect captured in a ref so it can be called from MapLibre's click
  // handler without forcing the init useEffect to re-run on every render.
  const onSelectRef = useRef(onSelect);
  useEffect(() => {
    onSelectRef.current = onSelect;
  }, [onSelect]);

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

      const features = leaders.map((l) => ({
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

      map.addSource('leaders', {
        type: 'geojson',
        data: { type: 'FeatureCollection', features },
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

      map.on('click', 'leader-points', (e) => {
        const feature = e.features?.[0];
        const id = feature?.properties?.id as string | undefined;
        if (id) onSelectRef.current(id);
      });

      map.on('mouseenter', 'leader-points', () => {
        map.getCanvas().style.cursor = 'pointer';
      });
      map.on('mouseleave', 'leader-points', () => {
        map.getCanvas().style.cursor = '';
      });
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

  return <div ref={containerRef} className="absolute inset-0" />;
}
