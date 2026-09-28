import { useEffect, useState } from 'react';
import { Store, Ticket } from 'lucide-react';
import type { Merchant, OfferWithMerchant } from '@/lib/supabase';
import { distanceMeters, formatDistance, hasValidCoords } from '@/lib/geo';
import type { SavedAddress } from '@/lib/address';
import { formatTimeRemaining, getMsRemaining } from '@/lib/utils';
import { VerifiedBadge } from '@/components/VerifiedBadge';

function companyMark(merchant: Merchant) {
  const logo = merchant.logo_url || merchant.image_url;
  if (logo) {
    return <img src={logo} alt="" className="h-full w-full object-cover" />;
  }
  return (
    <span className="text-lg font-extrabold text-white">
      {(merchant.name || '?').slice(0, 1).toLocaleUpperCase('tr')}
    </span>
  );
}

export function MapPlaceCard({
  merchant,
  offer,
  offers = [],
  origin,
  onInspectCampaign,
  onOpenProfile,
}: {
  merchant: Merchant;
  offer?: OfferWithMerchant | null;
  offers?: OfferWithMerchant[];
  origin: SavedAddress | null;
  onInspectCampaign: (offer?: OfferWithMerchant) => void;
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
  const campaignImage = offer?.image_url?.trim() || '';

  const pack = offers.length > 1 ? offers : [];
  const open = () => {
    if (live) onInspectCampaign(offer ?? undefined);
    else onOpenProfile();
  };

  if (pack.length > 1) {
    return (
      <div className="w-[min(280px,calc(100vw-2rem))] overflow-hidden rounded-2xl bg-white shadow-lg ring-1 ring-[#00A884]/20">
        <button type="button" onClick={onOpenProfile} className="flex w-full items-center gap-2 px-3 py-2 text-left">
          <span className="flex h-8 w-8 shrink-0 items-center justify-center overflow-hidden rounded-full bg-[#00A884] text-white">{companyMark(merchant)}</span>
          <span className="min-w-0">
            <span className="flex items-center gap-1 truncate text-[13px] font-extrabold text-slate-900">{merchant.name}<VerifiedBadge verified={merchant.is_verified} /></span>
            <span className="block text-[10px] font-semibold text-slate-400">{pack.length} kampanya</span>
          </span>
        </button>
        <div className="space-y-1 px-2 pb-2">
          {pack.map((item) => (
            <button
              key={item.id}
              type="button"
              onClick={() => onInspectCampaign(item)}
              className="flex w-full items-center justify-between gap-2 rounded-xl bg-slate-50 px-2.5 py-1.5 text-left"
            >
              <span className="min-w-0 truncate text-[12px] font-extrabold text-slate-800">{item.title}</span>
              <span className="shrink-0 rounded-full bg-[#00A884] px-1.5 py-0.5 text-[9px] font-extrabold text-white">{item.discount}</span>
            </button>
          ))}
        </div>
      </div>
    );
  }

  return (
    <button
      type="button"
      onClick={open}
      className="qapla-info-card w-[min(280px,calc(100vw-2rem))] overflow-hidden rounded-2xl bg-white text-left shadow-lg ring-1 ring-[#00A884]/20"
    >
      {campaignImage ? (
        <div className="relative h-24">
          <img src={campaignImage} alt="" className="h-full w-full object-cover" />
          <div className="absolute inset-x-0 bottom-0 flex items-center gap-2 bg-gradient-to-t from-black/75 to-transparent px-3 pb-2 pt-6">
            <span className="flex h-8 w-8 shrink-0 items-center justify-center overflow-hidden rounded-full bg-[#00A884] ring-2 ring-white">
              {companyMark(merchant)}
            </span>
            <span className="min-w-0">
              <span className="flex items-center gap-1 truncate text-[13px] font-extrabold text-white">{merchant.name}<VerifiedBadge verified={merchant.is_verified} tone="onDark" /></span>
              <span className="block truncate text-[10px] font-semibold text-white/80">{merchant.category || 'İşletme'}</span>
            </span>
          </div>
        </div>
      ) : null}
      <div className="flex items-start gap-3 p-3.5">
        {campaignImage ? null : (
          <div
            className="flex h-12 w-12 shrink-0 items-center justify-center overflow-hidden rounded-2xl text-white shadow-md"
            style={{ background: campaignImage ? 'transparent' : '#00A884' }}
          >
            {companyMark(merchant)}
          </div>
        )}
        <div className="min-w-0 flex-1">
          {campaignImage ? (
            <h3 className="truncate text-[15px] font-extrabold text-slate-900">{offer?.title}</h3>
          ) : (
            <>
              <h3 className="flex items-center gap-1 truncate text-[15px] font-extrabold text-slate-900">{merchant.name}<VerifiedBadge verified={merchant.is_verified} /></h3>
              <p className="mt-0.5 text-[11px] font-semibold text-slate-400">{merchant.category || 'İşletme'}</p>
            </>
          )}
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
      {distance ? <p className="px-3.5 pb-3 text-[12px] font-bold text-slate-700">{distance}</p> : null}
    </button>
  );
}
