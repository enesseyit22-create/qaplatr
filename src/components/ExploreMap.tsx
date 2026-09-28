import { useEffect } from 'react';
import type { Merchant, OfferWithMerchant } from '@/lib/supabase';
import { MapZoomControls } from '@/components/MapZoomControls';
import { MerchantPinLayer, UserPulseMarker } from '@/components/DropletOverlay';
import { invalidateMapSize, useQaplaMap } from '@/components/maps/MapContext';
import { setActiveMapEngine } from '@/lib/mapControl';
import type { SavedAddress } from '@/lib/address';
import { hasValidCoords } from '@/lib/geo';
import { ISTANBUL_CENTER } from '@/lib/mapTiles';
import { QaplaMapFrame, type MapFlyTo } from '@/components/maps/QaplaMapFrame';

type ExploreMapProps = {
  merchants: Merchant[];
  offers?: OfferWithMerchant[];
  userAddress: SavedAddress | null;
  sheetOffset: number;
  locating?: boolean;
  gesturesLocked?: boolean;
  locateBottom?: number;
  controlsHidden?: boolean;
  flyTo?: MapFlyTo | null;
  onPickLocation: (lat: number, lng: number) => void;
  onRequestLocation?: () => void;
  onSelectMerchant?: (merchant: Merchant) => void;
  onInspectOffer?: (offer: OfferWithMerchant) => void;
};

export function ExploreMap({
  merchants,
  offers = [],
  userAddress,
  sheetOffset,
  locating = false,
  gesturesLocked = false,
  locateBottom = 180,
  controlsHidden = false,
  flyTo = null,
  onPickLocation,
  onRequestLocation,
  onSelectMerchant,
  onInspectOffer,
}: ExploreMapProps) {
  const center = userAddress && hasValidCoords(userAddress)
    ? { lat: userAddress.latitude, lng: userAddress.longitude }
    : ISTANBUL_CENTER;

  const pins = merchants.filter(hasValidCoords);

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
          onPickLocation(lat, lng);
        }}
      >
        <MapSizeSync sheetOffset={sheetOffset} />
        <UserPulseMarker lat={center.lat} lng={center.lng} label={userAddress?.label ?? 'Konum'} />
        <MerchantPinLayer
          merchants={pins}
          offers={offers}
          sheetOffset={sheetOffset}
          origin={userAddress}
          onSelectMerchant={onSelectMerchant}
          onInspectOffer={onInspectOffer}
        />
      </QaplaMapFrame>
      <MapZoomControls locating={locating} bottom={locateBottom} hidden={controlsHidden} onLocate={onRequestLocation} />
    </div>
  );
}

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
