import { useEffect, useRef, useState, type ReactNode } from 'react';
import { MapContainer, TileLayer, useMap, useMapEvents } from 'react-leaflet';
import { Map as MapLibreMap, setWorkerUrl, type MapMouseEvent } from 'maplibre-gl';
import mapWorkerUrl from 'maplibre-gl/dist/maplibre-gl-worker.mjs?url';
import { applyQaplaMapStyle } from '@/lib/mapStyle';
import { forceHttpsUrl, getMapTileConfig, getRasterMapStyle, MAP_MAX_ZOOM, MAP_MIN_ZOOM, MAP_NATIVE_ZOOM, OPENFREEMAP_POSITRON } from '@/lib/mapTiles';
import { shouldUseLeafletMap } from '@/lib/mapEngine';
import { invalidateMapSize, QaplaMapContext, type QaplaMapEngine } from '@/components/maps/MapContext';

function httpsAssetUrl(url: string) {
  const absolute = new URL(url, window.location.href).href;
  return forceHttpsUrl(absolute);
}

try {
  setWorkerUrl(httpsAssetUrl(mapWorkerUrl));
} catch {
  /* worker url is optional on some WebViews */
}

export type LatLng = { lat: number; lng: number };

export type MapFlyTo = {
  lat: number;
  lng: number;
  zoom?: number;
  token: number;
};

type QaplaMapFrameProps = {
  center: LatLng;
  zoom?: number;
  className?: string;
  locked?: boolean;
  onClick?: (lat: number, lng: number) => void;
  children?: ReactNode;
  followCenter?: boolean;
  paddingBottom?: number;
  flyTo?: MapFlyTo | null;
};

function bindSizeWatchers(invalidate: () => void) {
  invalidate();
  const delays = [50, 150, 400, 900, 1600];
  const timers = delays.map((ms) => window.setTimeout(invalidate, ms));
  window.addEventListener('resize', invalidate);
  window.addEventListener('orientationchange', invalidate);
  window.visualViewport?.addEventListener('resize', invalidate);
  return () => {
    timers.forEach((id) => window.clearTimeout(id));
    window.removeEventListener('resize', invalidate);
    window.removeEventListener('orientationchange', invalidate);
    window.visualViewport?.removeEventListener('resize', invalidate);
  };
}

export function QaplaMapFrame({
  center,
  zoom = 15,
  className = '',
  locked = false,
  onClick,
  children,
  followCenter = false,
  paddingBottom = 0,
  flyTo = null,
}: QaplaMapFrameProps) {
  const [useLeaflet] = useState(() => shouldUseLeafletMap());

  return (
    <div className={`explore-map-host ${className}`}>
      {useLeaflet ? (
        <LeafletFrame
          center={center}
          zoom={zoom}
          locked={locked}
          onClick={onClick}
          followCenter={followCenter}
          paddingBottom={paddingBottom}
          flyTo={flyTo}
        >
          {children}
        </LeafletFrame>
      ) : (
        <MapLibreFrame
          center={center}
          zoom={zoom}
          locked={locked}
          onClick={onClick}
          followCenter={followCenter}
          paddingBottom={paddingBottom}
          flyTo={flyTo}
        >
          {children}
        </MapLibreFrame>
      )}
    </div>
  );
}

function MapLibreFrame({
  center,
  zoom,
  locked,
  onClick,
  children,
  followCenter,
  paddingBottom = 0,
  flyTo = null,
}: QaplaMapFrameProps) {
  const hostRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<MapLibreMap | null>(null);
  const [engine, setEngine] = useState<QaplaMapEngine | null>(null);
  const onClickRef = useRef(onClick);
  onClickRef.current = onClick;

  useEffect(() => {
    if (!hostRef.current || mapRef.current) return;
    const instance = new MapLibreMap({
      container: hostRef.current,
      style: OPENFREEMAP_POSITRON,
      center: [center.lng, center.lat],
      zoom,
      minZoom: MAP_MIN_ZOOM,
      maxZoom: 16.5,
      attributionControl: { compact: true },
      dragRotate: false,
      transformRequest: (url) => ({ url: forceHttpsUrl(url) }),
    });
    mapRef.current = instance;
    let usedRaster = false;
    let alive = true;
    const safeResize = () => {
      if (!alive || mapRef.current !== instance) return;
      try {
        instance.resize();
      } catch {
        /* removed */
      }
    };
    const onError = () => {
      if (!alive || usedRaster) return;
      usedRaster = true;
      try {
        instance.setStyle(getRasterMapStyle());
      } catch {
        /* style already gone */
      }
    };
    const ready = () => {
      if (!alive) return;
      if (!usedRaster) applyQaplaMapStyle(instance);
      safeResize();
      setEngine({ engine: 'maplibre', map: instance });
    };
    instance.on('error', onError);
    instance.on('load', ready);
    instance.on('idle', safeResize);
    instance.on('click', (event: MapMouseEvent) => {
      const original = event.originalEvent.target as HTMLElement | null;
      if (original?.closest('.qapla-drop, .qapla-info-card, .maplibregl-popup, .leaflet-popup')) return;
      onClickRef.current?.(event.lngLat.lat, event.lngLat.lng);
    });
    const stopWatch = bindSizeWatchers(safeResize);
    const observer = new ResizeObserver(safeResize);
    observer.observe(hostRef.current);
    return () => {
      alive = false;
      stopWatch();
      observer.disconnect();
      instance.off('error', onError);
      instance.off('load', ready);
      instance.off('idle', safeResize);
      mapRef.current = null;
      try {
        instance.remove();
      } catch {
        /* already removed */
      }
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    const instance = mapRef.current;
    if (!instance || !followCenter) return;
    instance.easeTo({
      center: [center.lng, center.lat],
      zoom: 15,
      duration: 650,
      padding: { top: 80, bottom: Math.max(24, paddingBottom * 0.35), left: 0, right: 0 },
    });
    instance.resize();
  }, [center.lat, center.lng, followCenter, paddingBottom]);

  useEffect(() => {
    const instance = mapRef.current;
    if (!instance || !flyTo) return;
    instance.easeTo({
      center: [flyTo.lng, flyTo.lat],
      zoom: flyTo.zoom ?? 15,
      duration: 700,
      padding: { top: 88, bottom: Math.max(96, paddingBottom * 0.45), left: 24, right: 24 },
    });
    instance.resize();
  }, [flyTo?.token, flyTo?.lat, flyTo?.lng, flyTo?.zoom, paddingBottom]);

  useEffect(() => {
    mapRef.current?.resize();
  }, [paddingBottom]);

  useEffect(() => {
    const instance = mapRef.current;
    if (!instance) return;
    const enable = !locked;
    instance.dragPan[enable ? 'enable' : 'disable']();
    instance.scrollZoom[enable ? 'enable' : 'disable']();
    instance.doubleClickZoom[enable ? 'enable' : 'disable']();
    instance.touchZoomRotate[enable ? 'enable' : 'disable']();
    instance.keyboard[enable ? 'enable' : 'disable']();
    instance.boxZoom[enable ? 'enable' : 'disable']();
  }, [locked]);

  return (
    <>
      <div ref={hostRef} className="qapla-map-surface" />
      {engine ? <QaplaMapContext.Provider value={engine}>{children}</QaplaMapContext.Provider> : null}
    </>
  );
}

function LeafletFrame({
  center,
  zoom = 15,
  locked = false,
  onClick,
  children,
  followCenter = false,
  paddingBottom = 0,
  flyTo = null,
}: QaplaMapFrameProps) {
  const tiles = getMapTileConfig();
  const [engine, setEngine] = useState<QaplaMapEngine | null>(null);

  return (
    <MapContainer
      className="qapla-map-surface qapla-leaflet"
      center={[center.lat, center.lng]}
      zoom={zoom}
      minZoom={MAP_MIN_ZOOM}
      maxZoom={MAP_MAX_ZOOM}
      zoomControl={false}
      attributionControl
      dragging={!locked}
      scrollWheelZoom={!locked}
      doubleClickZoom={!locked}
      touchZoom={!locked}
      bounceAtZoomLimits
      keyboard={!locked}
      style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', flex: 1 }}
    >
      <TileLayer
        url={tiles.url}
        attribution={tiles.attribution}
        maxZoom={MAP_MAX_ZOOM}
        maxNativeZoom={MAP_NATIVE_ZOOM}
        minZoom={MAP_MIN_ZOOM}
        detectRetina={false}
        crossOrigin
      />
      <LeafletRuntime
        center={center}
        locked={locked}
        followCenter={followCenter}
        paddingBottom={paddingBottom}
        flyTo={flyTo}
        onClick={onClick}
        onReady={setEngine}
      />
      {engine ? <QaplaMapContext.Provider value={engine}>{children}</QaplaMapContext.Provider> : null}
    </MapContainer>
  );
}

function LeafletRuntime({
  center,
  locked,
  followCenter,
  paddingBottom = 0,
  flyTo = null,
  onClick,
  onReady,
}: {
  center: LatLng;
  locked: boolean;
  followCenter: boolean;
  paddingBottom?: number;
  flyTo?: MapFlyTo | null;
  onClick?: (lat: number, lng: number) => void;
  onReady: (engine: QaplaMapEngine) => void;
}) {
  const map = useMap();
  const onClickRef = useRef(onClick);
  onClickRef.current = onClick;

  useEffect(() => {
    let alive = true;
    onReady({ engine: 'leaflet', map });
    const invalidate = () => {
      if (!alive) return;
      invalidateMapSize({ engine: 'leaflet', map });
    };
    const stop = bindSizeWatchers(invalidate);
    const observer = new ResizeObserver(invalidate);
    observer.observe(map.getContainer());
    map.whenReady(invalidate);
    return () => {
      alive = false;
      stop();
      observer.disconnect();
    };
  }, [map]);

  useEffect(() => {
    if (locked) {
      map.dragging.disable();
      map.scrollWheelZoom.disable();
      map.doubleClickZoom.disable();
      map.touchZoom.disable();
      map.keyboard.disable();
    } else {
      map.dragging.enable();
      map.scrollWheelZoom.enable();
      map.doubleClickZoom.enable();
      map.touchZoom.enable();
      map.keyboard.enable();
    }
  }, [locked, map]);

  useEffect(() => {
    if (!followCenter) return;
    map.setView([center.lat, center.lng], 15, { animate: true });
    map.invalidateSize({ animate: false, pan: false });
  }, [center.lat, center.lng, followCenter, map]);

  useEffect(() => {
    if (!flyTo) return;
    map.setView([flyTo.lat, flyTo.lng], flyTo.zoom ?? 15, { animate: true });
    map.invalidateSize({ animate: false, pan: false });
  }, [flyTo?.token, flyTo?.lat, flyTo?.lng, flyTo?.zoom, map]);

  useEffect(() => {
    let alive = true;
    const invalidate = () => {
      if (!alive) return;
      try {
        map.invalidateSize({ animate: false, pan: false });
      } catch {
        /* unmounted */
      }
    };
    invalidate();
    const timers = [40, 180, 480].map((ms) => window.setTimeout(invalidate, ms));
    return () => {
      alive = false;
      timers.forEach((id) => window.clearTimeout(id));
    };
  }, [paddingBottom, map]);

  useMapEvents({
    click(event) {
      const original = event.originalEvent.target as HTMLElement | null;
      if (original?.closest('.qapla-drop, .qapla-info-card, .leaflet-popup')) return;
      onClickRef.current?.(event.latlng.lat, event.latlng.lng);
    },
  });

  return null;
}
