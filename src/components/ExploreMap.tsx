import { memo, useEffect, useRef } from 'react';
import type { OfferWithMerchant } from '@/lib/supabase';
import { MerchantPinLayer, UserPulseMarker } from '@/components/DropletOverlay';
import { invalidateMapSize, useQaplaMap } from '@/components/maps/MapContext';
import { setActiveMapEngine } from '@/lib/mapControl';
import type { SavedAddress } from '@/lib/address';
import { hasValidCoords } from '@/lib/geo';
import { ISTANBUL_CENTER } from '@/lib/mapTiles';
import { QaplaMapFrame, type MapFlyTo } from '@/components/maps/QaplaMapFrame';

type ExploreMapProps = {
  offers?: OfferWithMerchant[];
  userAddress: SavedAddress | null;
  sheetOffset: number;
  gesturesLocked?: boolean;
  flyTo?: MapFlyTo | null;
  onPickLocation: (lat: number, lng: number) => void;
  onInspectOffer?: (offer: OfferWithMerchant) => void;
  onPreviewOffer?: (offer: OfferWithMerchant) => void;
};

export const ExploreMap = memo(function ExploreMap({
  offers = [],
  userAddress,
  sheetOffset,
  gesturesLocked = false,
  flyTo = null,
  onPickLocation,
  onInspectOffer,
  onPreviewOffer,
}: ExploreMapProps) {
  const center = userAddress && hasValidCoords(userAddress)
    ? { lat: userAddress.latitude, lng: userAddress.longitude }
    : ISTANBUL_CENTER;
  const skipPick = useRef(false);

  return (
    <div className={`explore-map absolute inset-0 z-[1] h-full w-full ${gesturesLocked ? 'is-sheet-dragging' : ''}`}>
      <QaplaMapFrame
        center={center}
        zoom={15}
        followCenter={false}
        locked={gesturesLocked}
        paddingBottom={sheetOffset}
        flyTo={flyTo}
        onClick={(lat, lng) => {
          if (gesturesLocked) return;
          if (skipPick.current) {
            skipPick.current = false;
            return;
          }
          onPickLocation(lat, lng);
        }}
      >
        <MapSizeSync sheetOffset={sheetOffset} />
        <UserPulseMarker lat={center.lat} lng={center.lng} label={userAddress?.label ?? 'Konum'} />
        <MerchantPinLayer
          offers={offers}
          sheetOffset={sheetOffset}
          origin={userAddress}
          onInspectOffer={onInspectOffer}
          onPreviewOffer={(offer) => {
            skipPick.current = true;
            window.setTimeout(() => {
              skipPick.current = false;
            }, 280);
            onPreviewOffer?.(offer);
          }}
        />
      </QaplaMapFrame>
    </div>
  );
});

function MapSizeSync({ sheetOffset }: { sheetOffset: number }) {
  const map = useQaplaMap();
  useEffect(() => {
    setActiveMapEngine(map);
    return () => setActiveMapEngine(null);
  }, [map]);
  useEffect(() => {
    invalidateMapSize(map);
  }, [map, sheetOffset]);
  return null;
}
