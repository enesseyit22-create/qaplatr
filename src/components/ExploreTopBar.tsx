import { useEffect, useMemo, useRef, useState } from 'react';
import { Bell, Loader2, MapPin, Search, X } from 'lucide-react';
import { StoryMark } from '@/components/StoryMark';
import { useAppNotices } from '@/lib/notices';
import type { Merchant, OfferWithMerchant } from '@/lib/supabase';
import { getMsRemaining } from '@/lib/utils';
import { SideMenu } from '@/components/SideMenu';
import { DropletWordmark } from '@/components/DropletLogo';
import { useAuth } from '@/lib/authContext';
import { accountHasVip, useAppFeatures } from '@/lib/appFeatures';
import type { ExploreCategoryId } from '@/lib/sectors';
import { filterAddressPresets, searchNominatimMany, type SavedAddress } from '@/lib/address';
import { FirmName } from '@/components/VerifiedBadge';

export function ExploreTopBar({
  merchants,
  offers,
  favoriteMerchants,
  onSector,
  onFavorite,
  onRequireAuth,
  onSecretAdmin,
  onPickMerchant,
  onPickAddress,
  onVisits,
  onSaved,
  onMerchantLogin,
  onBusinessRegister,
  storyCount = 0,
  storyUnseen = false,
  onOpenStories,
}: {
  merchants: Merchant[];
  offers: OfferWithMerchant[];
  favoriteMerchants: Merchant[];
  onSector: (id: ExploreCategoryId) => void;
  onFavorite: (merchant: Merchant) => void;
  onRequireAuth: () => void;
  onSecretAdmin: () => void;
  onPickMerchant: (merchant: Merchant) => void;
  onPickAddress: (address: SavedAddress) => void;
  onVisits?: () => void;
  onSaved?: () => void;
  onMerchantLogin?: () => void;
  onBusinessRegister?: () => void;
  storyCount?: number;
  storyUnseen?: boolean;
  onOpenStories?: () => void;
}) {
  const { profile } = useAuth();
  const features = useAppFeatures();
  const [query, setQuery] = useState('');
  const [open, setOpen] = useState(false);
  const [notesPhase, setNotesPhase] = useState<'closed' | 'open' | 'closing'>('closed');
  const [hits, setHits] = useState<SavedAddress[]>([]);
  const [searching, setSearching] = useState(false);
  const wrapRef = useRef<HTMLDivElement>(null);
  const [storyHint, setStoryHint] = useState(false);

  useEffect(() => {
    const timers: number[] = [];
    const cycle = (delay: number) => {
      timers.push(window.setTimeout(() => {
        setStoryHint(true);
        timers.push(window.setTimeout(() => {
          setStoryHint(false);
          cycle(9000);
        }, 4200));
      }, delay));
    };
    cycle(1800);
    return () => timers.forEach((id) => window.clearTimeout(id));
  }, []);

  useEffect(() => {
    const onDoc = (event: MouseEvent) => {
      if (!wrapRef.current?.contains(event.target as Node)) {
        setOpen(false);
        setNotesPhase((phase) => (phase === 'open' ? 'closing' : phase));
      }
    };
    document.addEventListener('mousedown', onDoc);
    return () => document.removeEventListener('mousedown', onDoc);
  }, []);

  useEffect(() => {
    if (notesPhase !== 'closing') return;
    const timer = window.setTimeout(() => setNotesPhase('closed'), 260);
    return () => window.clearTimeout(timer);
  }, [notesPhase]);

  const closeNotes = () => setNotesPhase((phase) => (phase === 'open' ? 'closing' : phase));
  const toggleNotes = () => {
    setOpen(false);
    setNotesPhase((phase) => (phase === 'open' ? 'closing' : 'open'));
  };

  useEffect(() => {
    const q = query.trim();
    const local = filterAddressPresets(q);
    setHits(local);
    if (q.length < 2) {
      setSearching(false);
      return;
    }
    let cancelled = false;
    const timer = window.setTimeout(() => {
      setSearching(true);
      void searchNominatimMany(q, 6).then((remote) => {
        if (cancelled) return;
        const seen = new Set(local.map((item) => `${item.latitude.toFixed(4)},${item.longitude.toFixed(4)}`));
        const extra = remote.filter((item) => !seen.has(`${item.latitude.toFixed(4)},${item.longitude.toFixed(4)}`));
        setHits([...local, ...extra].slice(0, 8));
        setSearching(false);
      });
    }, 280);
    return () => {
      cancelled = true;
      window.clearTimeout(timer);
    };
  }, [query]);

  const pushed = useAppNotices();
  const allowCampaignAlerts = Boolean(features.vip.campaignAlerts && accountHasVip(profile));
  const offerNotes = useMemo(
    () => allowCampaignAlerts
      ? offers.filter((item) => item.is_active && (item.is_featured || getMsRemaining(item.expires_at) < 6 * 3600000)).slice(0, 4)
      : [],
    [offers, allowCampaignAlerts],
  );

  const showSuggest = open && query.trim().length > 0;

  return (
    <div ref={wrapRef} className="explore-topbar pointer-events-auto absolute inset-x-0 top-0 z-[1450] px-3 pt-[max(0.45rem,env(safe-area-inset-top))]">
      <div className="mb-1.5 flex items-center justify-center">
        <div className="inline-flex h-11 items-center gap-1 rounded-2xl bg-white/95 px-1.5 shadow-md backdrop-blur-md">
          <SideMenu
            merchants={merchants}
            favoriteMerchants={favoriteMerchants}
            onSector={onSector}
            onFavorite={onFavorite}
            onRequireAuth={onRequireAuth}
            onVisits={onVisits}
            onSaved={onSaved}
            onMerchantLogin={onMerchantLogin}
            onBusinessRegister={onBusinessRegister}
          />
          <DropletWordmark variant="dark" onSecretUnlock={onSecretAdmin} />
        </div>
      </div>
      <div className="relative z-20 flex items-center gap-2 overflow-visible">
        <label className="relative flex min-w-0 flex-1 items-center gap-2 rounded-full bg-white px-3.5 py-2.5 shadow-md">
          <Search className="h-4 w-4 shrink-0 text-slate-400" />
          <input
            value={query}
            onChange={(event) => {
              setQuery(event.target.value);
              setOpen(true);
              closeNotes();
            }}
            onFocus={() => setOpen(true)}
            placeholder="Adres veya konum ara..."
            autoComplete="off"
            className="min-w-0 flex-1 bg-transparent text-sm text-slate-800 outline-none placeholder:text-slate-400"
          />
          {searching ? <Loader2 className="h-4 w-4 shrink-0 animate-spin text-slate-300" /> : null}
          {query ? (
            <button
              type="button"
              aria-label="Aramayı temizle"
              onClick={() => setQuery('')}
              className="text-slate-300"
            >
              <X className="h-4 w-4" />
            </button>
          ) : null}
        </label>
        <div className="relative shrink-0">
          <button
            type="button"
            onClick={() => {
              setStoryHint(false);
              onOpenStories?.();
            }}
            className={`story-nudge absolute right-[3.35rem] top-1/2 z-50 -translate-y-1/2 whitespace-nowrap rounded-2xl bg-mint-600 px-2.5 py-1.5 text-[10px] font-extrabold leading-none text-white shadow-lg transition-opacity duration-700 ease-in-out ${
              storyHint && notesPhase === 'closed' && !showSuggest
                ? 'opacity-100'
                : 'pointer-events-none opacity-0'
            }`}
          >
            Sende hikayeni paylaş
            <span className="absolute -right-1 top-1/2 h-2 w-2 -translate-y-1/2 rotate-45 bg-mint-600" />
          </button>
          <button
            type="button"
            aria-label={storyCount > 0 ? `Hikayeler, ${storyCount} izlenmeyen` : 'Hikayeler'}
            onClick={() => {
              setOpen(false);
              closeNotes();
              setStoryHint(false);
              onOpenStories?.();
            }}
            className={`relative flex h-12 w-12 shrink-0 items-center justify-center rounded-full bg-white shadow-md ${storyUnseen ? 'ring-2 ring-mint-400 ring-offset-1' : 'text-slate-700'}`}
          >
            <StoryMark className="h-6 w-6 text-mint-600" />
            {storyCount > 0 ? (
              <span className="absolute -right-1 -top-1 flex h-5 min-w-5 items-center justify-center rounded-full bg-[#00A884] px-1 text-[10px] font-extrabold leading-none text-white">
                {storyCount > 9 ? '9+' : storyCount}
              </span>
            ) : null}
          </button>
        </div>
        <button
          type="button"
          aria-label="Bildirimler"
          onClick={toggleNotes}
          className={`relative flex h-12 w-12 shrink-0 items-center justify-center rounded-full bg-white text-slate-700 shadow-md transition-transform duration-300 ${notesPhase === 'open' ? 'scale-105' : ''}`}
        >
          <Bell className={`h-6 w-6 ${notesPhase === 'open' ? 'notice-bell-live text-mint-600' : ''}`} />
          {pushed.length + offerNotes.length > 0 ? (
            <span className="absolute right-1.5 top-1.5 h-2.5 w-2.5 rounded-full bg-red-500" />
          ) : null}
        </button>
      </div>
      {showSuggest ? (
        <div className="mt-2 overflow-hidden rounded-2xl bg-white shadow-lg ring-1 ring-black/5">
          {hits.length === 0 && !searching ? (
            <p className="px-3.5 py-3 text-xs text-slate-400">Eşleşen adres yok.</p>
          ) : (
            hits.map((item) => (
              <button
                key={`${item.label}-${item.latitude}-${item.longitude}`}
                type="button"
                onClick={() => {
                  onPickAddress(item);
                  setQuery(item.label);
                  setOpen(false);
                }}
                className="flex w-full items-center gap-2 px-3.5 py-2.5 text-left text-sm text-slate-800 hover:bg-slate-50"
              >
                <MapPin className="h-4 w-4 shrink-0 text-mint-600" />
                <span className="min-w-0">
                  <span className="block truncate font-semibold">{item.label}</span>
                  <span className="block truncate text-[11px] text-slate-400">
                    {[item.city, item.district, item.neighborhood].filter(Boolean).join(' · ')}
                  </span>
                </span>
              </button>
            ))
          )}
        </div>
      ) : null}
      {notesPhase !== 'closed' ? (
        <div
          role="dialog"
          aria-label="Bildirimler"
          className={`notice-pop mt-2 overflow-hidden rounded-[1.6rem] bg-white shadow-[0_18px_50px_-18px_rgba(15,118,110,0.35)] ring-1 ring-mint-100 ${notesPhase === 'closing' ? 'is-closing' : ''}`}
        >
          <div className="flex items-center gap-2 px-4 pb-1 pt-3.5">
            <span className="flex h-8 w-8 items-center justify-center rounded-2xl bg-mint-50 text-mint-600">
              <Bell className="h-4 w-4" />
            </span>
            <p className="text-sm font-extrabold text-mint-900">Bildirimler</p>
          </div>
          {pushed.length === 0 && offerNotes.length === 0 ? (
            <p className="px-4 pb-4 pt-1 text-sm text-slate-400">Şimdilik sessiz. Yeni bir şey olunca burada belirir.</p>
          ) : (
            <div className="max-h-72 overflow-y-auto pb-2">
              {pushed.map((item, index) => (
                <div
                  key={item.id}
                  className="notice-pop-item mx-2 mb-1 rounded-2xl bg-mint-50/80 px-2.5 py-2.5"
                  style={{ animationDelay: `${40 + index * 45}ms` }}
                >
                  <p className="text-[10px] font-extrabold uppercase tracking-wide text-mint-600">{item.from_name}</p>
                  <p className="text-sm font-bold text-slate-800">{item.title}</p>
                  <p className="text-xs leading-relaxed text-slate-500">{item.body}</p>
                </div>
              ))}
              {offerNotes.map((item, index) => (
                <button
                  key={item.id}
                  type="button"
                  onClick={() => {
                    if (item.qapla_merchants) onPickMerchant(item.qapla_merchants);
                    closeNotes();
                  }}
                  className="notice-pop-item mx-2 mb-1 flex w-[calc(100%-1rem)] items-start gap-2 rounded-2xl px-2.5 py-2.5 text-left hover:bg-mint-50/80"
                  style={{ animationDelay: `${40 + (pushed.length + index) * 45}ms` }}
                >
                  <MapPin className="mt-0.5 h-4 w-4 shrink-0 text-mint-600" />
                  <span className="min-w-0">
                    <FirmName name={item.qapla_merchants?.name ?? 'İşletme'} verified={item.qapla_merchants?.is_verified} className="text-sm font-bold text-slate-800" />
                    <span className="block truncate text-xs text-slate-500">{item.title}</span>
                  </span>
                </button>
              ))}
            </div>
          )}
        </div>
      ) : null}
    </div>
  );
}

export function SearchSpinner() {
  return <Loader2 className="h-4 w-4 animate-spin text-slate-400" />;
}
