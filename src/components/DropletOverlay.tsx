import { useEffect, useMemo, useRef, useState } from 'react';
import L from 'leaflet';
import { Marker } from 'maplibre-gl';
import type { Merchant, OfferWithMerchant } from '@/lib/supabase';
import { invalidateMapSize, useQaplaMap } from '@/components/maps/MapContext';
import { groupPins, shouldCluster } from '@/lib/pinLayout';
import { sectorIdForCategory } from '@/lib/sectors';
import { SECTOR_PIN_ICONS } from '@/lib/sectorIcons';
import type { SavedAddress } from '@/lib/address';
import { hasValidCoords } from '@/lib/geo';
import { getMsRemaining } from '@/lib/utils';

export function MerchantPinLayer({
  offers,
  sheetOffset,
  origin = null,
  onInspectOffer,
  onPreviewOffer,
}: {
  offers: OfferWithMerchant[];
  sheetOffset: number;
  origin?: SavedAddress | null;
  onInspectOffer?: (offer: OfferWithMerchant) => void;
  onPreviewOffer?: (offer: OfferWithMerchant) => void;
}) {
  const engine = useQaplaMap();
  const [zoom, setZoom] = useState(15);

  useEffect(() => {
    if (!engine) return;
    const read = () => {
      setZoom(engine.map.getZoom());
    };
    read();
    engine.map.on('zoomend', read);
    return () => {
      engine.map.off('zoomend', read);
    };
  }, [engine]);

  const campaigns = useMemo(
    () => offers.filter((offer) => {
      const place = offer.qapla_merchants;
      const id = String(offer.id ?? '');
      if (id.startsWith('story') || id.startsWith('demo-story')) return false;
      return Boolean(offer.is_active && place && hasValidCoords(place) && getMsRemaining(offer.expires_at) > 0);
    }),
    [offers],
  );
  const byMerchant = useMemo(() => {
    const buckets = new Map<string, OfferWithMerchant[]>();
    for (const offer of campaigns) {
      const id = offer.qapla_merchants?.id || offer.merchant_id;
      if (!id) continue;
      const list = buckets.get(id) ?? [];
      list.push(offer);
      buckets.set(id, list);
    }
    return buckets;
  }, [campaigns]);
  const groups = useMemo(
    () => groupPins([...byMerchant.entries()].map(([id, list]) => ({
      id,
      lat: Number(list[0]?.qapla_merchants?.latitude),
      lng: Number(list[0]?.qapla_merchants?.longitude),
    })), zoom),
    [byMerchant, zoom],
  );

  return (
    <>
      {groups.map((group) => {
        if (shouldCluster(group, zoom)) {
          return (
            <ClusterOverlay
              key={`c-${group.id}`}
              lat={group.lat}
              lng={group.lng}
              count={group.members.length}
              sheetOffset={sheetOffset}
            />
          );
        }
        return group.spread.map((point) => {
          const pack = byMerchant.get(point.id) ?? [];
          const offer = pack[0];
          const place = offer?.qapla_merchants;
          if (!offer || !place) return null;
          const fresh = Date.now() - new Date(offer.created_at).getTime() < 6 * 3600000;
          return (
            <DropletOverlay
              key={place.id}
              count={pack.length}
              merchant={{
                ...place,
                latitude: point.lat,
                longitude: point.lng,
                is_featured: pack.some((item) => item.is_featured) || place.is_featured,
              }}
              offer={offer}
              origin={origin}
              hasDeal
              isFresh={fresh}
              sheetOffset={sheetOffset}
              onOpenProfile={() => (onPreviewOffer ?? onInspectOffer)?.(offer)}
              onInspectCampaign={() => (onPreviewOffer ?? onInspectOffer)?.(offer)}
            />
          );
        });
      })}
    </>
  );
}

function ClusterOverlay({
  lat,
  lng,
  count,
  sheetOffset,
}: {
  lat: number;
  lng: number;
  count: number;
  sheetOffset: number;
}) {
  const engine = useQaplaMap();

  useEffect(() => {
    if (!engine) return;
    const openCluster = () => {
      if (engine.engine === 'leaflet') {
        engine.map.setView([lat, lng], Math.min(engine.map.getZoom() + 1.6, 17), { animate: true });
        invalidateMapSize(engine);
        return;
      }
      engine.map.easeTo({
        center: [lng, lat],
        zoom: Math.min(engine.map.getZoom() + 1.6, 16.8),
        duration: 420,
        padding: popupPadding(sheetOffset),
      });
    };

    if (engine.engine === 'leaflet') {
      const marker = L.marker([lat, lng], {
        icon: L.divIcon({
          className: 'qapla-leaflet-drop',
          html: clusterHtml(count),
          iconSize: [46, 46],
          iconAnchor: [23, 23],
        }),
        zIndexOffset: 400,
      }).addTo(engine.map);
      marker.on('click', openCluster);
      return () => {
        marker.remove();
      };
    }

    const el = document.createElement('button');
    el.type = 'button';
    el.className = 'qapla-cluster';
    el.textContent = String(count);
    el.addEventListener('click', (event) => {
      event.stopPropagation();
      openCluster();
    });
    const marker = new Marker({ element: el, anchor: 'center' })
      .setLngLat([lng, lat])
      .addTo(engine.map);
    return () => {
      marker.remove();
    };
  }, [engine, lat, lng, count, sheetOffset]);

  return null;
}

export function DropletOverlay({
  merchant,
  offer = null,
  origin = null,
  hasDeal,
  isFresh,
  count = 1,
  sheetOffset: _sheetOffset = 260,
  onOpenProfile,
  onInspectCampaign,
}: {
  merchant: Merchant;
  offer?: OfferWithMerchant | null;
  origin?: SavedAddress | null;
  hasDeal: boolean;
  isFresh: boolean;
  count?: number;
  sheetOffset?: number;
  onOpenProfile: () => void;
  onInspectCampaign?: () => void;
}) {
  const engine = useQaplaMap();
  const openRef = useRef(onOpenProfile);
  openRef.current = onOpenProfile;
  void offer;
  void origin;
  void onInspectCampaign;

  useEffect(() => {
    if (!engine) return;
    const el = dropletElement(merchant, hasDeal, isFresh, count);

    if (engine.engine === 'leaflet') {
      const marker = L.marker([merchant.latitude, merchant.longitude], {
        icon: L.divIcon({
          className: 'qapla-leaflet-drop',
          html: el.outerHTML,
          iconSize: [56, 72],
          iconAnchor: [28, 66],
        }),
        zIndexOffset: 800,
        riseOnHover: true,
      }).addTo(engine.map);
      marker.on('click', (event) => {
        L.DomEvent.stop(event);
        openRef.current();
      });
      return () => {
        marker.remove();
      };
    }

    const wrap = document.createElement('div');
    wrap.appendChild(el);
    const marker = new Marker({ element: wrap, anchor: 'bottom' })
      .setLngLat([merchant.longitude, merchant.latitude])
      .addTo(engine.map);
    marker.getElement().addEventListener('click', (event) => {
      event.stopPropagation();
      openRef.current();
    });
    return () => {
      marker.remove();
    };
  }, [engine, merchant.id, merchant.latitude, merchant.longitude, merchant.name, merchant.category, merchant.phone, merchant.is_featured, merchant.is_verified, hasDeal, isFresh, count]);

  return null;
}

export function UserPulseMarker({ lat, lng }: { lat: number; lng: number; label?: string }) {
  const engine = useQaplaMap();

  useEffect(() => {
    if (!engine) return;
    const el = document.createElement('div');
    el.className = 'qapla-marker';
    el.innerHTML = '<div class="qapla-center-pulse"><div class="qapla-center-dot"></div></div>';

    if (engine.engine === 'leaflet') {
      const marker = L.marker([lat, lng], {
        icon: L.divIcon({
          className: 'qapla-leaflet-pulse',
          html: el.innerHTML,
          iconSize: [28, 28],
          iconAnchor: [14, 14],
        }),
        interactive: false,
      }).addTo(engine.map);
      return () => {
        marker.remove();
      };
    }

    const marker = new Marker({ element: el, anchor: 'center' })
      .setLngLat([lng, lat])
      .addTo(engine.map);
    return () => {
      marker.remove();
    };
  }, [engine, lat, lng]);

  return null;
}

function popupPadding(sheetOffset: number) {
  return {
    top: 96,
    bottom: Math.max(96, sheetOffset + 28),
    left: 28,
    right: 28,
  };
}

function clusterHtml(count: number) {
  return `<button type="button" class="qapla-cluster" aria-label="${count} kampanya">${count}</button>`;
}

function dropletElement(merchant: Merchant, hasDeal: boolean, isFresh: boolean, count = 1) {
  const el = document.createElement('button');
  el.type = 'button';
  const sector = sectorIdForCategory(merchant.category);
  el.className = `qapla-drop ${hasDeal ? 'is-deal' : ''} ${isFresh ? 'is-fresh' : ''} ${merchant.is_featured ? 'is-vip' : ''} is-${sector}`;
  el.setAttribute('aria-label', merchant.is_verified ? `${merchant.name}, onaylı firma` : merchant.name);
  el.innerHTML = `
    <span class="qapla-drop-orbit" aria-hidden="true"></span>
    <span class="qapla-drop-body" aria-hidden="true"></span>
    <span class="qapla-drop-core" aria-hidden="true">${SECTOR_PIN_ICONS[sector]}</span>
    ${merchant.is_verified ? '<span aria-hidden="true" style="position:absolute;right:-2px;top:6px;width:14px;height:14px;border-radius:999px;background:#10b981;color:#fff;font-size:9px;line-height:14px;font-weight:800;text-align:center;box-shadow:0 0 0 2px #fff">✓</span>' : ''}
    ${count > 1 ? `<span aria-hidden="true" style="position:absolute;left:-2px;top:6px;min-width:14px;height:14px;padding:0 3px;border-radius:999px;background:#10241f;color:#fff;font-size:9px;line-height:14px;font-weight:800;text-align:center;box-shadow:0 0 0 2px #fff">${count}</span>` : ''}
  `;
  return el;
}
