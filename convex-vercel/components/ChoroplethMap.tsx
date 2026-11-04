'use client';

import { useCallback, useEffect, useState } from 'react';
import Map, { Source, Layer } from 'react-map-gl/maplibre';
import type { LayerProps, MapMouseEvent } from 'react-map-gl/maplibre';
import 'maplibre-gl/dist/maplibre-gl.css';
import type * as GeoJSON from 'geojson';
import {
  fetchUSStateFeatures,
  type StateFeatureProps,
  type StateData,
} from '@/lib/usStates';
import { MATH_COLOR_STEPS } from '@/lib/palette';
import { MAP_STYLE, useResolvedTheme } from '@/lib/theme';
import MathLegend from './MathLegend';
import MapTip, { TipRow } from './MapTip';

function statesFillLayer(noData: string): LayerProps {
  return {
    id: 'states-fill',
    type: 'fill',
    paint: {
      'fill-color': [
        'step',
        ['coalesce', ['get', 'avg_math_pct_prof'], -1],
        noData,
        ...MATH_COLOR_STEPS,
      ] as any,
      'fill-opacity': 0.8,
    },
  };
}

function statesBorderLayer(line: string): LayerProps {
  return {
    id: 'states-border',
    type: 'line',
    paint: { 'line-color': line, 'line-width': 0.9 },
  };
}

interface HoverInfo extends StateFeatureProps {
  x: number;
  y: number;
}

interface ChoroplethMapProps {
  stateStats: StateData[];
  onStateSelect: (abbr: string) => void;
}

export default function ChoroplethMap({ stateStats, onStateSelect }: ChoroplethMapProps) {
  const [geojson, setGeojson] = useState<GeoJSON.FeatureCollection<GeoJSON.Geometry, StateFeatureProps> | null>(null);
  const [hoverInfo, setHoverInfo] = useState<HoverInfo | null>(null);
  const [fetchError, setFetchError] = useState<string | null>(null);
  const theme = useResolvedTheme();
  const noData = theme === 'dark' ? '#3a3731' : '#d9d2c4';
  const line = theme === 'dark' ? '#12110f' : '#fffdf8';

  useEffect(() => {
    // Cancellation guard: if stateStats changes (or we unmount) before the
    // fetch resolves, ignore the stale result so it can't clobber newer state.
    let cancelled = false;
    setFetchError(null);
    fetchUSStateFeatures(stateStats)
      .then(fc => { if (!cancelled) setGeojson(fc); })
      .catch((err: Error) => { if (!cancelled) setFetchError(err.message); });
    return () => { cancelled = true; };
  }, [stateStats]);

  const onMouseMove = useCallback((e: MapMouseEvent) => {
    const feature = e.features?.[0];
    if (!feature) { setHoverInfo(null); return; }
    const p = feature.properties as StateFeatureProps;
    setHoverInfo({ x: e.point.x, y: e.point.y, ...p });
  }, []);

  const onMouseLeave = useCallback(() => setHoverInfo(null), []);

  const onClick = useCallback(
    (e: MapMouseEvent) => {
      const feature = e.features?.[0];
      if (!feature) return;
      const abbr = (feature.properties as StateFeatureProps).abbr;
      if (abbr) onStateSelect(abbr);
    },
    [onStateSelect]
  );

  if (fetchError) {
    return (
      <div className="card flex h-full w-full items-center justify-center text-sm text-negative">
        Failed to load map: {fetchError}
      </div>
    );
  }

  if (!geojson) {
    return <div className="skeleton h-full w-full" />;
  }

  return (
    <div className="card relative h-full w-full overflow-hidden">
      <Map
        initialViewState={{ latitude: 38.5, longitude: -96, zoom: 3 }}
        mapStyle={MAP_STYLE[theme]}
        interactiveLayerIds={['states-fill']}
        onMouseMove={onMouseMove}
        onMouseLeave={onMouseLeave}
        onClick={onClick}
        cursor={hoverInfo ? 'pointer' : 'grab'}
        style={{ width: '100%', height: '100%' }}
        attributionControl={false}
      >
        <Source id="states" type="geojson" data={geojson}>
          <Layer {...statesFillLayer(noData)} />
          <Layer {...statesBorderLayer(line)} />
        </Source>
      </Map>

      {hoverInfo && (
        <MapTip x={hoverInfo.x} y={hoverInfo.y} title={hoverInfo.name} hint="Click to explore counties">
          <TipRow label="Math proficient" value={hoverInfo.avg_math_pct_prof != null ? `${hoverInfo.avg_math_pct_prof.toFixed(1)}%` : '—'} />
          <TipRow label="Pearson r" value={hoverInfo.pearson_r != null ? hoverInfo.pearson_r.toFixed(3) : '—'} />
          <TipRow label="Schools" value={hoverInfo.school_count != null ? hoverInfo.school_count.toLocaleString() : '—'} />
        </MapTip>
      )}

      <MathLegend title="Gr. 8 math proficient, %" />
    </div>
  );
}
