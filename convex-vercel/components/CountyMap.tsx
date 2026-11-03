'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import Map, { Source, Layer } from 'react-map-gl/maplibre';
import type { MapRef, LayerProps, MapMouseEvent } from 'react-map-gl/maplibre';
import 'maplibre-gl/dist/maplibre-gl.css';
import type * as GeoJSON from 'geojson';
import {
  fetchCountyFeatures,
  getStateBounds,
  type CountyFeatureProps,
  type CountyData,
} from '@/lib/usCounties';
import { MATH_COLOR_STEPS } from '@/lib/palette';
import { MAP_STYLE, useResolvedTheme } from '@/lib/theme';
import MathLegend from './MathLegend';
import MapTip, { TipRow } from './MapTip';

/** Minimal school shape needed for map markers. */
export interface SchoolPoint {
  school_name: string;
  lat?: number | null;
  lon?: number | null;
  math_pct_prof?: number | null;
  pct_high_income?: number | null;
  enrollment?: number | null;
}

type HoverInfo =
  | ({ kind: 'county'; x: number; y: number } & CountyFeatureProps)
  | {
      kind: 'school';
      x: number;
      y: number;
      name: string;
      math?: number | null;
      income?: number | null;
      enrollment?: number | null;
    };

interface CountyMapProps {
  stateAbbr: string;
  countyStats: CountyData[];
  onBack: () => void;
  onCountySelect?: (fips: string) => void;
  /** Currently drilled-in county (5-digit FIPS); enables school markers. */
  selectedCounty?: string | null;
  /** Schools to plot when a county is selected. */
  schools?: SchoolPoint[];
  /** Called with the school name when a marker is clicked. */
  onSchoolSelect?: (name: string) => void;
}

/** Bounding box of a single Polygon/MultiPolygon feature. */
function featureBounds(
  geometry: GeoJSON.Geometry
): [[number, number], [number, number]] | null {
  let minLon = Infinity, minLat = Infinity, maxLon = -Infinity, maxLat = -Infinity;
  const visit = (coords: any) => {
    if (typeof coords[0] === 'number') {
      const [lon, lat] = coords as [number, number];
      if (lon < minLon) minLon = lon;
      if (lat < minLat) minLat = lat;
      if (lon > maxLon) maxLon = lon;
      if (lat > maxLat) maxLat = lat;
    } else {
      for (const c of coords) visit(c);
    }
  };
  if (geometry.type === 'Polygon' || geometry.type === 'MultiPolygon') {
    visit(geometry.coordinates);
  } else {
    return null;
  }
  if (!isFinite(minLon)) return null;
  return [[minLon, minLat], [maxLon, maxLat]];
}

export default function CountyMap({
  stateAbbr,
  countyStats,
  onBack,
  onCountySelect,
  selectedCounty,
  schools,
  onSchoolSelect,
}: CountyMapProps) {
  const mapRef = useRef<MapRef>(null);
  const [geojson, setGeojson] = useState<GeoJSON.FeatureCollection<GeoJSON.Geometry, CountyFeatureProps> | null>(null);
  const [bounds, setBounds] = useState<[[number, number], [number, number]] | null>(null);
  const [hoverInfo, setHoverInfo] = useState<HoverInfo | null>(null);
  const [fetchError, setFetchError] = useState<string | null>(null);
  const theme = useResolvedTheme();
  const noData = theme === 'dark' ? '#3a3731' : '#d9d2c4';
  const line = theme === 'dark' ? '#12110f' : '#fffdf8';
  const accent = theme === 'dark' ? '#9d8cff' : '#4b2fc4';

  useEffect(() => {
    // Cancellation guard: rapid state switches can resolve out of order;
    // ignore stale results so an older state's counties can't overwrite
    // the currently selected state's map.
    let cancelled = false;
    setFetchError(null);
    setGeojson(null);
    fetchCountyFeatures(stateAbbr, countyStats)
      .then(fc => {
        if (cancelled) return;
        setGeojson(fc);
        setBounds(getStateBounds(fc.features));
      })
      .catch((err: Error) => { if (!cancelled) setFetchError(err.message); });
    return () => { cancelled = true; };
  }, [stateAbbr, countyStats]);

  // Zoom into the selected county; zoom back out on deselect
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !geojson) return;
    if (selectedCounty) {
      const feature = geojson.features.find(f => f.properties.fips === selectedCounty);
      const b = feature ? featureBounds(feature.geometry) : null;
      if (b) map.fitBounds(b, { padding: 60, duration: 700 });
    } else if (bounds) {
      map.fitBounds(bounds, { padding: 40, duration: 700 });
    }
  }, [selectedCounty, geojson, bounds]);

  // County fill: dim non-selected counties when drilled in so schools stand out
  const countiesFillLayer: LayerProps = useMemo(() => ({
    id: 'counties-fill',
    type: 'fill',
    paint: {
      'fill-color': [
        'step',
        ['coalesce', ['get', 'avg_math_pct_prof'], -1],
        noData,
        ...MATH_COLOR_STEPS,
      ] as any,
      'fill-opacity': selectedCounty
        ? (['case', ['==', ['get', 'fips'], selectedCounty], 0.35, 0.12] as any)
        : 0.8,
    },
  }), [selectedCounty, noData]);

  const countiesBorderLayer: LayerProps = useMemo(() => ({
    id: 'counties-border',
    type: 'line',
    paint: { 'line-color': line, 'line-width': 0.5 },
  }), [line]);

  // Accent outline on the drilled-in county
  const selectedBorderLayer: LayerProps | null = useMemo(() => {
    if (!selectedCounty) return null;
    return {
      id: 'selected-county-border',
      type: 'line',
      filter: ['==', ['get', 'fips'], selectedCounty] as any,
      paint: {
        'line-color': accent,
        'line-width': 2.5,
      },
    };
  }, [selectedCounty, accent]);

  // School markers (only when drilled into a county)
  const schoolsGeojson = useMemo(() => {
    if (!selectedCounty || !schools?.length) return null;
    const features = schools
      .filter(s => s.lat != null && s.lon != null)
      .map(s => ({
        type: 'Feature' as const,
        geometry: { type: 'Point' as const, coordinates: [s.lon!, s.lat!] },
        properties: {
          name: s.school_name,
          math: s.math_pct_prof ?? null,
          income: s.pct_high_income ?? null,
          enrollment: s.enrollment ?? null,
        },
      }));
    if (features.length === 0) return null;
    return { type: 'FeatureCollection' as const, features };
  }, [selectedCounty, schools]);

  const schoolsCircleLayer: LayerProps = {
    id: 'schools-circle',
    type: 'circle',
    paint: {
      'circle-radius': ['interpolate', ['linear'], ['zoom'], 6, 4, 10, 7, 13, 10] as any,
      'circle-color': [
        'step',
        ['coalesce', ['get', 'math'], -1],
        noData,
        ...MATH_COLOR_STEPS,
      ] as any,
      'circle-stroke-color': line,
      'circle-stroke-width': 1.5,
      'circle-opacity': 0.95,
    },
  };

  const onMouseMove = useCallback((e: MapMouseEvent) => {
    const feature = e.features?.[0];
    if (!feature) { setHoverInfo(null); return; }
    if (feature.layer?.id === 'schools-circle') {
      const p = feature.properties as any;
      setHoverInfo({
        kind: 'school',
        x: e.point.x,
        y: e.point.y,
        name: p.name,
        math: p.math ?? null,
        income: p.income ?? null,
        enrollment: p.enrollment ?? null,
      });
      return;
    }
    const p = feature.properties as CountyFeatureProps;
    setHoverInfo({ kind: 'county', x: e.point.x, y: e.point.y, ...p });
  }, []);

  const onMouseLeave = useCallback(() => setHoverInfo(null), []);

  const onClick = useCallback((e: MapMouseEvent) => {
    const feature = e.features?.[0];
    if (!feature) return;
    if (feature.layer?.id === 'schools-circle') {
      const name = (feature.properties as any)?.name;
      if (name && onSchoolSelect) onSchoolSelect(name);
      return;
    }
    if (!onCountySelect) return;
    const fips = (feature.properties as CountyFeatureProps).fips;
    if (fips) onCountySelect(fips);
  }, [onCountySelect, onSchoolSelect]);

  if (fetchError) {
    return (
      <div className="card flex h-full w-full items-center justify-center text-sm text-negative">
        Failed to load map: {fetchError}
      </div>
    );
  }

  if (!geojson || !bounds) {
    return <div className="skeleton h-full w-full" />;
  }

  return (
    <div className="card relative h-full w-full overflow-hidden">
      <Map
        ref={mapRef}
        initialViewState={{
          bounds,
          fitBoundsOptions: { padding: 40 },
        }}
        mapStyle={MAP_STYLE[theme]}
        interactiveLayerIds={schoolsGeojson ? ['schools-circle', 'counties-fill'] : ['counties-fill']}
        onMouseMove={onMouseMove}
        onMouseLeave={onMouseLeave}
        onClick={onClick}
        cursor={hoverInfo ? 'pointer' : 'grab'}
        style={{ width: '100%', height: '100%' }}
        attributionControl={false}
      >
        <Source id="counties" type="geojson" data={geojson}>
          <Layer {...countiesFillLayer} />
          <Layer {...countiesBorderLayer} />
          {selectedBorderLayer && <Layer {...selectedBorderLayer} />}
        </Source>
        {schoolsGeojson && (
          <Source id="schools" type="geojson" data={schoolsGeojson}>
            <Layer {...schoolsCircleLayer} />
          </Source>
        )}
      </Map>

      <button
        onClick={onBack}
        className="absolute left-3 top-3 z-10 inline-flex items-center gap-1.5 rounded-full border border-line bg-surface/90 px-3.5 py-1.5 text-sm font-medium shadow-sm backdrop-blur transition-colors hover:border-line-strong"
      >
        <span aria-hidden>←</span> United States
      </button>

      {hoverInfo && (
        hoverInfo.kind === 'school' ? (
          <MapTip x={hoverInfo.x} y={hoverInfo.y} title={hoverInfo.name} hint="Click to find in table">
            <TipRow label="Math proficient" value={hoverInfo.math != null ? `${Number(hoverInfo.math).toFixed(1)}%` : '—'} />
            <TipRow label="High income" value={hoverInfo.income != null ? `${Number(hoverInfo.income).toFixed(1)}%` : '—'} />
            <TipRow label="Enrollment" value={hoverInfo.enrollment != null ? Number(hoverInfo.enrollment).toLocaleString() : '—'} />
          </MapTip>
        ) : (
          <MapTip
            x={hoverInfo.x}
            y={hoverInfo.y}
            title={hoverInfo.name}
            subtitle={`FIPS ${hoverInfo.fips}`}
            hint={hoverInfo.fips === selectedCounty ? undefined : 'Click to see schools'}
          >
            <TipRow label="Math proficient" value={hoverInfo.avg_math_pct_prof != null ? `${hoverInfo.avg_math_pct_prof.toFixed(1)}%` : '—'} />
            <TipRow label="Pearson r" value={hoverInfo.pearson_r != null ? hoverInfo.pearson_r.toFixed(3) : '—'} />
            <TipRow label="Schools" value={hoverInfo.school_count != null ? hoverInfo.school_count.toLocaleString() : '—'} />
          </MapTip>
        )
      )}

      <MathLegend title={selectedCounty ? 'School math proficient, %' : 'Gr. 8 math proficient, %'} />
    </div>
  );
}
