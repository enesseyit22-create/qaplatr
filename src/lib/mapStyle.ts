import type { Map as MapLibreMap } from 'maplibre-gl';
import { OPENFREEMAP_POSITRON } from '@/lib/mapTiles';

export { OPENFREEMAP_POSITRON };

const HIDE_LAYER_IDS = new Set([
  'airport',
  'highway-shield-non-us',
  'highway-shield-us-interstate',
  'road_shield_us',
  'aeroway-taxiway',
  'aeroway-runway-casing',
  'aeroway-area',
  'aeroway-runway',
]);

export function applyQaplaMapStyle(map: MapLibreMap) {
  const style = map.getStyle();
  for (const layer of style.layers ?? []) {
    const id = layer.id;
    const sourceLayer = 'source-layer' in layer ? String(layer['source-layer'] ?? '') : '';
    if (
      HIDE_LAYER_IDS.has(id)
      || sourceLayer === 'poi'
      || sourceLayer === 'housenumber'
      || sourceLayer === 'aerodrome_label'
      || id.includes('poi')
      || id.includes('housenumber')
    ) {
      if (map.getLayer(id)) map.setLayoutProperty(id, 'visibility', 'none');
      continue;
    }
    if (layer.type === 'symbol' && (id.startsWith('label_') || id === 'airport')) {
      try {
        map.setPaintProperty(id, 'icon-opacity', 0);
      } catch {
        /* text-only layer */
      }
    }
  }

  const paint = (id: string, prop: string, value: unknown) => {
    if (!map.getLayer(id)) return;
    try {
      map.setPaintProperty(id, prop as never, value as never);
    } catch {
      /* skip */
    }
  };

  paint('background', 'background-color', '#edf2ef');
  paint('water', 'fill-color', '#b7d9d0');
  paint('park', 'fill-color', '#cfe3d6');
  paint('building', 'fill-color', '#ddd6cc');
  paint('building', 'fill-outline-color', '#c9c1b5');
  paint('landuse_residential', 'fill-color', '#e7ece8');
  paint('landcover_wood', 'fill-color', '#c5dccb');
  paint('highway_minor', 'line-color', '#ffffff');
  paint('highway_path', 'line-color', '#f4f1ea');
  paint('highway_major_inner', 'line-color', '#ffffff');
  paint('highway_major_casing', 'line-color', '#c5c0b6');
  paint('highway_major_subtle', 'line-color', '#d8d3c9');

  for (const layer of style.layers ?? []) {
    if (layer.type !== 'symbol' || !map.getLayer(layer.id)) continue;
    if (String(layer.id).includes('poi')) continue;
    try {
      map.setPaintProperty(layer.id, 'text-color' as never, '#35514b' as never);
      map.setPaintProperty(layer.id, 'text-halo-color' as never, '#f4f7f5' as never);
      map.setPaintProperty(layer.id, 'text-halo-width' as never, 1.15 as never);
    } catch {
      /* skip */
    }
  }

  const zoom = (id: string, min: number, max = 24) => {
    if (map.getLayer(id)) map.setLayerZoomRange(id, min, max);
  };

  zoom('highway_path', 14);
  zoom('highway_minor', 12);
  zoom('building', 14);
  zoom('railway', 15);
  zoom('railway_dashline', 15);
  zoom('highway-name-major', 12.6);
  zoom('highway-name-minor', 14.4);
  zoom('highway-name-path', 15.8);
  zoom('label_other', 15.2);
  zoom('label_village', 12.8);
  zoom('place_suburb', 12.4);
  zoom('place_neighbourhood', 13.6);
  zoom('building', 13.8);
  zoom('waterway_line_label', 14);
}
