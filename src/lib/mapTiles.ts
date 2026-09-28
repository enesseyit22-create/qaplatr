export const ISTANBUL_CENTER = { lat: 40.9888, lng: 29.0288 };
export const MAP_MIN_ZOOM = 5;
export const MAP_MAX_ZOOM = 19;
export const MAP_NATIVE_ZOOM = 19;

export type MapTileConfig = {
  url: string;
  attribution: string;
  subdomains?: string;
};

export function forceHttpsUrl(url: string) {
  if (url.startsWith('http://')) return `https://${url.slice('http://'.length)}`;
  return url;
}

/** Official OSM raster tiles — HTTPS, zoom 0–19. Avoids Esri “Map data not yet available”. */
export function getMapTileConfig(): MapTileConfig {
  return {
    url: 'https://tile.openstreetmap.org/{z}/{x}/{y}.png',
    attribution: '&copy; OpenStreetMap',
  };
}

export const OPENFREEMAP_POSITRON = 'https://tiles.openfreemap.org/styles/positron';

export function getRasterMapStyle() {
  const tiles = getMapTileConfig();
  return {
    version: 8 as const,
    sources: {
      osm: {
        type: 'raster' as const,
        tiles: [tiles.url],
        tileSize: 256,
        maxzoom: MAP_NATIVE_ZOOM,
        attribution: tiles.attribution,
      },
    },
    layers: [
      { id: 'background', type: 'background' as const, paint: { 'background-color': '#eef3f1' } },
      { id: 'osm', type: 'raster' as const, source: 'osm' },
    ],
  };
}
