import type { QaplaMapEngine } from '@/components/maps/MapContext';
import { MAP_MAX_ZOOM, MAP_MIN_ZOOM } from '@/lib/mapTiles';

let engine: QaplaMapEngine | null = null;

export function setActiveMapEngine(next: QaplaMapEngine | null) {
  engine = next;
}

export function zoomActiveMap(delta: number) {
  if (!engine) return;
  if (engine.engine === 'leaflet') {
    engine.map.setZoom(Math.min(MAP_MAX_ZOOM, Math.max(MAP_MIN_ZOOM, engine.map.getZoom() + delta)));
    return;
  }
  engine.map.easeTo({
    zoom: Math.min(16.5, Math.max(MAP_MIN_ZOOM, engine.map.getZoom() + delta)),
    duration: 220,
  });
}
