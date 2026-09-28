import { useMemo, useEffect, useState } from 'react';
import { distanceMeters } from '@/lib/geo';
import { campaignRadiusM, useReach } from '@/lib/reach';
import { useExploreBanners, type ExploreBanner } from '@/lib/exploreBanners';

export type ShowcasePlace = { id: string; latitude: number; longitude: number };

function DefaultBanner() {
  return (
    <div className="overflow-hidden rounded-[1.4rem] bg-gradient-to-r from-[#2f6fe0] to-[#3ec6ea] px-4 py-4 text-center text-white shadow-md">
      <p className="text-[22px] font-extrabold leading-none tracking-tight">QapLA</p>
      <p className="mt-1 text-[15px] font-extrabold leading-snug">Şehrinin Fırsatları Cebinde!</p>
    </div>
  );
}

function placeMeters(banner: ExploreBanner, places: ShowcasePlace[], origin: { latitude: number; longitude: number } | null) {
  if (!origin || !banner.company_id) return Number.POSITIVE_INFINITY;
  const place = places.find((item) => item.id === banner.company_id);
  if (!place) return Number.POSITIVE_INFINITY;
  return distanceMeters(origin.latitude, origin.longitude, place.latitude, place.longitude);
}

export function ExploreBannerSlider({
  origin = null,
  places = [],
}: {
  origin?: { latitude: number; longitude: number } | null;
  places?: ShowcasePlace[];
}) {
  const reach = useReach();
  const raw = useExploreBanners();
  const banners = useMemo(() => raw
    .filter((item) => {
      if (!item.is_active || item.status === 'pending' || !(item.title || item.image_url)) return false;
      if (item.source !== 'company' || !origin) return true;
      return placeMeters(item, places, origin) <= campaignRadiusM();
    })
    .sort((a, b) => {
      const aAdmin = a.source === 'company' ? 1 : 0;
      const bAdmin = b.source === 'company' ? 1 : 0;
      if (aAdmin !== bAdmin) return aAdmin - bAdmin;
      if (aAdmin === 0) return a.sort_order - b.sort_order;
      return placeMeters(a, places, origin) - placeMeters(b, places, origin);
    }), [raw, places, origin, reach.campaignKm]);
  const [index, setIndex] = useState(0);
  const count = banners.length;

  useEffect(() => {
    setIndex(0);
  }, [count]);

  useEffect(() => {
    if (count < 2) return;
    const timer = window.setInterval(() => {
      setIndex((current) => (current + 1) % count);
    }, 4200);
    return () => window.clearInterval(timer);
  }, [count]);

  if (count === 0) return <DefaultBanner />;

  const item = banners[index % count];
  return (
    <div className="overflow-hidden rounded-[1.4rem] shadow-md">
      <div className="relative min-h-[108px]">
        {item.image_url ? (
          <img src={item.image_url} alt="" className="absolute inset-0 h-full w-full object-cover" />
        ) : (
          <div className="absolute inset-0 bg-gradient-to-r from-[#2f6fe0] to-[#3ec6ea]" />
        )}
        <div className="absolute inset-0 bg-gradient-to-r from-[#102a36]/80 via-[#1d4f86]/55 to-[#1d4f86]/20" />
        <div className="relative px-4 py-4 text-white">
          <p className="text-[11px] font-extrabold uppercase tracking-[0.16em] text-white/70">QapLA</p>
          <p className="mt-1 text-[18px] font-extrabold leading-snug">{item.title}</p>
          {item.subtitle ? <p className="mt-1 text-[13px] font-medium leading-snug text-white/85">{item.subtitle}</p> : null}
        </div>
      </div>
      {count > 1 ? (
        <div className="flex items-center justify-center gap-1.5 bg-white py-2">
          {banners.map((banner, dot) => (
            <button
              key={banner.id}
              type="button"
              aria-label={`${dot + 1}. banner`}
              onClick={() => setIndex(dot)}
              className={`h-1.5 rounded-full transition-all ${dot === index % count ? 'w-5 bg-[#2f6fe0]' : 'w-1.5 bg-slate-300'}`}
            />
          ))}
        </div>
      ) : null}
    </div>
  );
}
