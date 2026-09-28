import { useEffect, useState } from 'react';
import { Store, Ticket } from 'lucide-react';
import type { Merchant, OfferWithMerchant } from '@/lib/supabase';
import { distanceMeters, formatDistance, hasValidCoords } from '@/lib/geo';
import type { SavedAddress } from '@/lib/address';
import { formatTimeRemaining, getMsRemaining } from '@/lib/utils';

export function MapPlaceCard({
  merchant,
  offer,
  origin,
  onInspectCampaign,
  onOpenProfile,
}: {
  merchant: Merchant;
  offer?: OfferWithMerchant | null;
  origin: SavedAddress | null;
  onInspectCampaign: () => void;
  onOpenProfile: () => void;
}) {
  const [, setTick] = useState(0);
  useEffect(() => {
    const id = window.setInterval(() => setTick((value) => value + 1), 1000);
    return () => window.clearInterval(id);
  }, []);
  const live = Boolean(offer && offer.is_active && getMsRemaining(offer.expires_at) > 0);
  const distance = origin && hasValidCoords(origin) && hasValidCoords(merchant)
    ? formatDistance(distanceMeters(origin.latitude, origin.longitude, merchant.latitude, merchant.longitude))
    : merchant.distance_m
      ? formatDistance(merchant.distance_m)
      : null;

  const open = () => {
    if (live) onInspectCampaign();
    else onOpenProfile();
  };

  return (
    <button
      type="button"
      onClick={open}
      className="qapla-info-card w-[min(280px,calc(100vw-2rem))] overflow-hidden rounded-2xl bg-white p-3.5 text-left shadow-lg ring-1 ring-[#00A884]/20"
    >
      <div className="flex items-start gap-3">
        <div
          className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl text-lg font-extrabold text-white shadow-md"
          style={{ background: '#00A884' }}
        >
          {(merchant.name || '?').slice(0, 1).toLocaleUpperCase('tr')}
        </div>
        <div className="min-w-0 flex-1">
          <h3 className="truncate text-[15px] font-extrabold text-slate-900">{merchant.name}</h3>
          <p className="mt-0.5 text-[11px] font-semibold text-slate-400">{merchant.category || 'İşletme'}</p>
          {live && offer ? (
            <p className="mt-1 inline-flex items-center gap-1 rounded-full bg-[#00A884] px-2 py-0.5 text-[10px] font-extrabold text-white shadow-sm">
              <Ticket className="h-3 w-3" /> {offer.discount} · {formatTimeRemaining(offer.expires_at)}
            </p>
          ) : (
            <p className="mt-1 inline-flex items-center gap-1 text-[10px] font-bold text-[#00A884]">
              <Store className="h-3 w-3" /> Profili aç
            </p>
          )}
        </div>
      </div>
      {distance ? <p className="mt-2 text-[12px] font-bold text-slate-700">{distance}</p> : null}
    </button>
  );
}
