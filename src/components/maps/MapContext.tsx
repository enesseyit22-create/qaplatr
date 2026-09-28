import { createContext, useContext } from 'react';
import type { Map as LeafletMap } from 'leaflet';
import type { Map as MapLibreMap } from 'maplibre-gl';

export type QaplaMapEngine =
  | { engine: 'maplibre'; map: MapLibreMap }
  | { engine: 'leaflet'; map: LeafletMap };

export const QaplaMapContext = createContext<QaplaMapEngine | null>(null);

export function useQaplaMap() {
  return useContext(QaplaMapContext);
}

export function invalidateMapSize(engine: QaplaMapEngine | null) {
  if (!engine) return;
  try {
    if (engine.engine === 'leaflet') {
      const map = engine.map as LeafletMap & { _loaded?: boolean };
      if (!map || map._loaded === false) return;
      map.invalidateSize({ animate: false, pan: false });
      return;
    }
    engine.map.resize();
  } catch {
    /* map already torn down */
  }
}
