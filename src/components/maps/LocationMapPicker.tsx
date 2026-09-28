import { useCallback, useEffect, useRef, useState } from 'react';
import { Loader2, Navigation } from 'lucide-react';
import { QaplaMapFrame } from '@/components/maps/QaplaMapFrame';
import { UserPulseMarker } from '@/components/DropletOverlay';
import { ISTANBUL_CENTER } from '@/lib/mapTiles';
import { requestDeviceLocation } from '@/lib/location';
import { hasValidCoords } from '@/lib/geo';

type LocationMapPickerProps = {
  latitude: number;
  longitude: number;
  onPick: (lat: number, lng: number) => void;
  autoLocate?: boolean;
  className?: string;
};

export function LocationMapPicker({
  latitude,
  longitude,
  onPick,
  autoLocate = false,
  className = 'h-56',
}: LocationMapPickerProps) {
  const [locating, setLocating] = useState(false);
  const autoDone = useRef(false);
  const center = hasValidCoords({ latitude, longitude })
    ? { lat: latitude, lng: longitude }
    : ISTANBUL_CENTER;

  const locate = useCallback(async () => {
    setLocating(true);
    try {
      const result = await requestDeviceLocation();
      if (result.ok) onPick(result.latitude, result.longitude);
    } finally {
      setLocating(false);
    }
  }, [onPick]);

  useEffect(() => {
    if (!autoLocate || autoDone.current) return;
    autoDone.current = true;
    void locate();
  }, [autoLocate, locate]);

  return (
    <div className={`explore-map relative h-56 min-h-[14rem] w-full overflow-hidden rounded-3xl border-2 border-mint-100 ${className}`}>
      <QaplaMapFrame center={center} zoom={15} onClick={onPick}>
        <UserPulseMarker lat={center.lat} lng={center.lng} label="Seçilen konum" />
      </QaplaMapFrame>
      <button
        type="button"
        onClick={() => void locate()}
        aria-label="Konumumu kullan"
        className="absolute bottom-3 right-3 z-[400] flex h-10 w-10 items-center justify-center rounded-full bg-white text-mint-700 shadow-soft"
      >
        {locating ? <Loader2 className="h-4 w-4 animate-spin" /> : <Navigation className="h-4 w-4" />}
      </button>
    </div>
  );
}

export { LocationMapPicker as CompanyMapPicker };
