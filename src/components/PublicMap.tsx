'use client';

import { useEffect, useRef, useState } from 'react';
import Script from 'next/script';
import maplibregl from 'maplibre-gl';
import 'maplibre-gl/dist/maplibre-gl.css';
import type { Language, Ministry, PublicLeader } from '@/lib/types';
import { LegendOverlay } from './LegendOverlay';
import { VisitorRequestModal } from './VisitorRequestModal';

const SA_CENTER: [number, number] = [-98.4936, 29.4241];
const DEFAULT_JITTER_MILES = 1.5;
const EARTH_RADIUS_MILES = 3959;

const ALL_MINISTRIES: Ministry[] = ['Family', 'YoPro', 'Campus', 'Singles', 'Spanish'];
const ALL_LANGUAGES: Language[] = ['English', 'Spanish', 'Bilingual'];

const MINISTRY_COLORS: Record<Ministry, string> = {
  Family: '#2196F3',
  YoPro: '#FF9800',
  Campus: '#9C27B0',
  Singles: '#E91E63',
  Spanish: '#4CAF50',
};

// 64-sided polygon approximation of a real-world circle so MapLibre renders
// in geographic units (miles), not fixed pixels.
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

function buildFilterExpression(
  activeMinistries: Set<Ministry>,
  activeLanguages: Set<Language>,
  kidFriendlyOnly: boolean,
): maplibregl.FilterSpecification {
  const conditions: maplibregl.ExpressionSpecification[] = [
    ['in', ['get', 'ministry'], ['literal', Array.from(activeMinistries)]],
    ['in', ['get', 'language'], ['literal', Array.from(activeLanguages)]],
  ];
  if (kidFriendlyOnly) {
    conditions.push(['==', ['get', 'kidFriendly'], true]);
  }
  return ['all', ...conditions];
}

function escapeHTML(s: string): string {
  return s.replace(
    /[&<>"']/g,
    (c) =>
      ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!,
  );
}

function buildPopupHTML(props: Record<string, unknown>): string {
  const groupName = (props.groupName as string) || '';
  const ministry = (props.ministry as string) || '';
  const meetingInfo = (props.meetingInfo as string) || '';
  const language = (props.language as string) || '';
  const kidFriendly = props.kidFriendly === true || props.kidFriendly === 'true';
  const color = (props.color as string) || '#999';

  let html = '';
  if (groupName) {
    html += `<div style="font-weight:600;font-size:15px;margin-bottom:6px;color:#111;">${escapeHTML(groupName)}</div>`;
  }
  html += `<div style="font-size:13px;color:#444;line-height:1.4;">`;
  html += `<span style="color:${color};font-weight:600;">${escapeHTML(ministry)} ministry</span>`;
  if (meetingInfo) html += ` &middot; ${escapeHTML(meetingInfo)}`;
  html += `</div>`;

  const tags: string[] = [];
  if (language && language !== 'English') tags.push(language);
  if (kidFriendly) tags.push('Kid-friendly');
  if (tags.length > 0) {
    html += `<div style="font-size:12px;color:#666;margin-top:4px;">${tags.map(escapeHTML).join(' &middot; ')}</div>`;
  }

  const id = (props.id as string) || '';
  if (id) {
    html += `<button data-request-leader-id="${escapeHTML(id)}" style="margin-top:12px;width:100%;background:${color};color:white;border:none;padding:8px 12px;border-radius:6px;font-size:13px;font-weight:600;cursor:pointer;">Request to Visit</button>`;
  }

  html += `<div style="font-size:11px;color:#999;margin-top:10px;font-style:italic;">Approximate area</div>`;
  return html;
}

export function PublicMap({ locations }: { locations: PublicLeader[] }) {
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<maplibregl.Map | null>(null);

  const [activeMinistries, setActiveMinistries] = useState<Set<Ministry>>(
    () => new Set(ALL_MINISTRIES),
  );
  const [activeLanguages, setActiveLanguages] = useState<Set<Language>>(
    () => new Set(ALL_LANGUAGES),
  );
  const [kidFriendlyOnly, setKidFriendlyOnly] = useState(false);
  const [requestLeaderId, setRequestLeaderId] = useState<string | null>(null);

  // Document-level click delegation for the "Request to Visit" button
  // inside MapLibre popup HTML (which is rendered as raw HTML, not React).
  useEffect(() => {
    const handleClick = (e: MouseEvent) => {
      const target = e.target as HTMLElement | null;
      if (!target) return;
      const button = target.closest<HTMLElement>('[data-request-leader-id]');
      if (!button) return;
      const leaderId = button.getAttribute('data-request-leader-id');
      if (!leaderId) return;
      e.preventDefault();
      setRequestLeaderId(leaderId);
      // Close any open MapLibre popups so they don't sit behind the modal.
      document
        .querySelectorAll<HTMLElement>('.maplibregl-popup-close-button')
        .forEach((el) => el.click());
    };
    document.addEventListener('click', handleClick);
    return () => document.removeEventListener('click', handleClick);
  }, []);

  // Initialize map once. The locations prop is a stable server-rendered value;
  // re-renders from filter state changes don't re-create the map.
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

    // The MapTiler streets-v2 style occasionally references icon names that
    // resolve to empty strings for some POI categories. MapLibre logs a warning
    // for each missing image; supply a 1×1 transparent placeholder so the
    // console stays quiet without changing the rendered map.
    map.on('styleimagemissing', (e: { id: string }) => {
      if (map.hasImage(e.id)) return;
      map.addImage(e.id, { width: 1, height: 1, data: new Uint8Array(4) });
    });

    map.on('load', () => {
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
          language: loc.language,
          kidFriendly: loc.kidFriendly,
          meetingInfo: loc.meetingInfo ?? '',
          groupName: loc.groupName ?? '',
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
        paint: { 'fill-color': ['get', 'color'], 'fill-opacity': 0.18 },
      });

      map.addLayer({
        id: 'ministry-line',
        type: 'line',
        source: 'ministry-areas',
        paint: { 'line-color': ['get', 'color'], 'line-width': 2 },
      });

      // Click → popup
      map.on('click', 'ministry-fill', (e) => {
        const feature = e.features?.[0];
        if (!feature) return;
        const popupMaxWidth = window.innerWidth < 480 ? '85vw' : '280px';
        new maplibregl.Popup({ closeButton: true, closeOnClick: true, maxWidth: popupMaxWidth })
          .setLngLat(e.lngLat)
          .setHTML(buildPopupHTML(feature.properties))
          .addTo(map);
      });

      // Cursor feedback on hover
      map.on('mouseenter', 'ministry-fill', () => {
        map.getCanvas().style.cursor = 'pointer';
      });
      map.on('mouseleave', 'ministry-fill', () => {
        map.getCanvas().style.cursor = '';
      });
    });

    return () => {
      map.remove();
      mapRef.current = null;
    };
  }, [locations]);

  // Apply filter expression whenever toggles change.
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;

    const apply = () => {
      if (!map.getLayer('ministry-fill')) return;
      const expr = buildFilterExpression(activeMinistries, activeLanguages, kidFriendlyOnly);
      map.setFilter('ministry-fill', expr);
      map.setFilter('ministry-line', expr);
    };

    if (map.isStyleLoaded() && map.getLayer('ministry-fill')) {
      apply();
    } else {
      map.once('idle', apply);
    }
  }, [activeMinistries, activeLanguages, kidFriendlyOnly]);

  const toggleMinistry = (m: Ministry) => {
    setActiveMinistries((prev) => {
      const next = new Set(prev);
      if (next.has(m)) next.delete(m);
      else next.add(m);
      return next;
    });
  };

  const toggleLanguage = (l: Language) => {
    setActiveLanguages((prev) => {
      const next = new Set(prev);
      if (next.has(l)) next.delete(l);
      else next.add(l);
      return next;
    });
  };

  return (
    <>
      <Script
        src="https://challenges.cloudflare.com/turnstile/v0/api.js"
        strategy="afterInteractive"
      />
      <div ref={containerRef} className="w-full h-full" />
      <LegendOverlay
        activeMinistries={activeMinistries}
        onToggleMinistry={toggleMinistry}
        activeLanguages={activeLanguages}
        onToggleLanguage={toggleLanguage}
        kidFriendlyOnly={kidFriendlyOnly}
        onKidFriendlyToggle={setKidFriendlyOnly}
        ministryColors={MINISTRY_COLORS}
      />
      <VisitorRequestModal
        leaderId={requestLeaderId}
        onClose={() => setRequestLeaderId(null)}
      />
    </>
  );
}
