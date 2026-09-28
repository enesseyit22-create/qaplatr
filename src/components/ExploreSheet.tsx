import { useEffect, useLayoutEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { ChevronUp, Flame, Music, Palette, Scissors, Search, Sparkles, Store, Utensils, Dumbbell, Armchair, X } from 'lucide-react';
import type { ExploreCategoryId } from '@/lib/sectors';

export type { ExploreCategoryId };

export const SHEET_PEEK = 52;
/** Alt menü + boşluk; safe-area CSS’te ayrıca eklenir. */
export const EXPLORE_NAV_CLEARANCE = 88;

function readSafeInset(edge: 'top' | 'bottom') {
  const probe = document.createElement('div');
  probe.style.cssText = `position:fixed;${edge}:0;height:env(safe-area-inset-${edge});width:0;visibility:hidden;pointer-events:none`;
  document.body.appendChild(probe);
  const px = probe.getBoundingClientRect().height;
  probe.remove();
  return Number.isFinite(px) ? px : 0;
}

const CATEGORIES: {
  id: ExploreCategoryId;
  label: string;
  hint: string;
  Icon: typeof Utensils;
  tone: string;
}[] = [
  { id: 'esnaf', label: 'Yerel Esnaf', hint: 'Çevrendeki dükkanlar', Icon: Store, tone: 'bg-emerald-50 text-emerald-700' },
  { id: 'gelinlik', label: 'Gelinlik', hint: 'Düğün ve özel gün', Icon: Sparkles, tone: 'bg-pink-50 text-pink-600' },
  { id: 'mobilya', label: 'Mobilya', hint: 'Ev ve ofis', Icon: Armchair, tone: 'bg-amber-50 text-amber-700' },
  { id: 'restoran', label: 'Restoran', hint: 'Yeme & içme', Icon: Utensils, tone: 'bg-orange-50 text-orange-600' },
  { id: 'firsat', label: 'Hızlı Fırsatlar', hint: 'Anlık indirimler', Icon: Flame, tone: 'bg-rose-50 text-rose-600' },
  { id: 'guzellik', label: 'Güzellik', hint: 'Bakım ve stil', Icon: Scissors, tone: 'bg-violet-50 text-violet-600' },
  { id: 'spor', label: 'Spor', hint: 'Hareket ve stüdyo', Icon: Dumbbell, tone: 'bg-sky-50 text-sky-600' },
  { id: 'dekorasyon', label: 'Dekorasyon', hint: 'Ev ve tasarım', Icon: Palette, tone: 'bg-lime-50 text-lime-700' },
  { id: 'eglence', label: 'Eğlence', hint: 'Sahne ve gece', Icon: Music, tone: 'bg-fuchsia-50 text-fuchsia-600' },
];

type ExploreSheetProps = {
  category: ExploreCategoryId;
  onCategory: (id: ExploreCategoryId) => void;
  onHeightChange: (height: number) => void;
  locationHint?: string | null;
  collapsed?: boolean;
  onToggle: () => void;
  searchQuery?: string;
  onSearchQuery?: (value: string) => void;
  campaignHits?: ExploreCategoryId[];
  children: ReactNode;
};

export function ExploreSheet({
  category,
  onCategory,
  onHeightChange,
  locationHint,
  collapsed = true,
  onToggle,
  searchQuery,
  onSearchQuery,
  campaignHits = [],
  children,
}: ExploreSheetProps) {
  const sheetRef = useRef<HTMLElement>(null);
  const expandedH = useRef(420);
  const collapsedRef = useRef(collapsed);
  collapsedRef.current = collapsed;
  const onHeightRef = useRef(onHeightChange);
  onHeightRef.current = onHeightChange;

  const paint = (hidden: boolean, animate: boolean) => {
    const node = sheetRef.current;
    if (!node) return;
    const height = expandedH.current;
    const visible = hidden ? SHEET_PEEK : height;
    node.style.transition = animate ? 'transform 420ms cubic-bezier(0.22, 1, 0.36, 1)' : 'none';
    node.style.height = `${height}px`;
    node.style.transform = `translate3d(0, ${height - visible}px, 0)`;
    onHeightRef.current(visible);
  };

  const measure = () => {
    const safeTop = readSafeInset('top');
    const safeBottom = readSafeInset('bottom');
    const headerReserve = 148 + safeTop;
    const bottomReserve = 74 + safeBottom;
    const parentH = sheetRef.current?.parentElement?.clientHeight ?? 0;
    const vh = parentH >= 180
      ? parentH
      : Math.max(document.documentElement.clientHeight || 0, window.innerHeight || 0);
    if (vh < 180) {
      window.requestAnimationFrame(measure);
      return;
    }
    const capped = Math.max(SHEET_PEEK + 120, vh - headerReserve - bottomReserve);
    expandedH.current = Math.min(Math.round(vh * 0.72), capped);
    paint(collapsedRef.current, false);
  };

  useLayoutEffect(() => {
    measure();
    window.addEventListener('resize', measure);
    window.visualViewport?.addEventListener('resize', measure);
    return () => {
      window.removeEventListener('resize', measure);
      window.visualViewport?.removeEventListener('resize', measure);
    };
  }, []);

  const skip = useRef(true);
  useEffect(() => {
    if (skip.current) {
      skip.current = false;
      return;
    }
    paint(collapsed, true);
  }, [collapsed]);

  const [sectorQuery, setSectorQuery] = useState('');
  const [searchOpen, setSearchOpen] = useState(false);
  const query = searchQuery ?? sectorQuery;
  const setQuery = (value: string) => {
    setSectorQuery(value);
    onSearchQuery?.(value);
  };
  const visibleSectors = useMemo(() => {
    const q = query.trim().toLocaleLowerCase('tr');
    if (!q) return CATEGORIES;
    const hit = new Set(campaignHits);
    return CATEGORIES.filter((item) =>
      `${item.label} ${item.hint}`.toLocaleLowerCase('tr').includes(q) || hit.has(item.id),
    );
  }, [query, campaignHits]);

  return (
    <section
      ref={sheetRef}
      aria-label="Keşfet paneli"
      className={`explore-sheet pointer-events-none absolute inset-x-0 z-[1100] flex w-full flex-col overflow-hidden ${
        collapsed ? 'is-peek bg-transparent shadow-none' : 'bg-white shadow-[0_-12px_40px_rgba(15,23,42,0.14)]'
      }`}
      style={{ height: expandedH.current || '74%', transform: `translate3d(0, ${(expandedH.current || 520) - SHEET_PEEK}px, 0)` }}
    >
      <button
        type="button"
        onClick={onToggle}
        className="relative flex w-full shrink-0 flex-col items-center px-4 pb-2 pt-1.5 pointer-events-auto"
        aria-expanded={!collapsed}
        aria-label={collapsed ? 'Keşfet panelini aç' : 'Keşfet panelini kapat'}
      >
        {collapsed ? (
          <span className="inline-flex items-center gap-1.5 rounded-full border border-white/80 bg-white/95 px-3 py-1.5 shadow-md backdrop-blur-md">
            <span className="flex h-6 w-6 items-center justify-center rounded-full bg-mint-50 text-mint-600">
              <ChevronUp className="h-3.5 w-3.5 animate-bounce" />
            </span>
            <span className="pr-0.5 text-[11px] font-extrabold tracking-wide text-mint-800">Keşfet</span>
          </span>
        ) : (
          <>
            <span className="mb-1 h-1.5 w-10 rounded-full bg-slate-200" />
            <span className="mt-1 flex items-center gap-1 text-[15px] font-extrabold text-slate-900">
              Keşfet
              <ChevronUp className="h-4 w-4 rotate-180 text-mint-600" />
            </span>
          </>
        )}
      </button>

      <div
        data-sheet-body
        className={`min-h-0 flex-1 overflow-y-auto overscroll-contain px-4 pb-6 no-scrollbar ${collapsed ? 'pointer-events-none hidden' : 'pointer-events-auto'}`}
      >
        {!locationHint ? null : (
          <p className="mb-3 rounded-2xl bg-mint-50 px-3 py-2 text-left text-[12px] font-medium leading-snug text-mint-800">
            {locationHint}
          </p>
        )}
        <div
          className="-mx-4 flex items-center gap-2 overflow-x-auto no-scrollbar px-4 pb-1"
          onClick={(event) => {
            const target = event.target as HTMLElement | null;
            if (target?.closest('[data-sector-chip]')) return;
            setSearchOpen(true);
          }}
        >
          <div
            className={`flex h-9 shrink-0 items-center overflow-hidden rounded-full border border-[#00A884]/25 bg-white shadow-sm transition-all duration-300 ${
              searchOpen ? 'w-52' : 'w-9'
            }`}
          >
            <button
              type="button"
              onClick={(event) => {
                event.stopPropagation();
                setSearchOpen((open) => {
                if (open) setQuery('');
                  return !open;
                });
              }}
              className="flex h-9 w-9 shrink-0 items-center justify-center text-[#00A884]"
              aria-label="Sektör ara"
              aria-expanded={searchOpen}
            >
              {searchOpen ? <X className="h-4 w-4" /> : <Search className="h-4 w-4" />}
            </button>
            <input
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              onClick={(event) => event.stopPropagation()}
              placeholder="Sektör veya kampanya"
              autoFocus={searchOpen}
              className={`h-9 min-w-0 bg-transparent text-[12px] font-semibold text-slate-800 outline-none transition-all duration-300 ${
                searchOpen ? 'w-40 opacity-100' : 'w-0 opacity-0'
              }`}
            />
          </div>
          {visibleSectors.map((item) => {
            const active = category === item.id;
            const Icon = item.Icon;
            return (
              <button
                key={item.id}
                type="button"
                data-sector-chip
                onClick={() => onCategory(item.id)}
                className={`inline-flex shrink-0 items-center gap-1.5 rounded-full border px-2.5 py-1.5 transition-all duration-300 ${
                  active
                    ? 'border-[#00A884]/30 bg-[#00A884]/10 shadow-sm'
                    : 'border-slate-100 bg-slate-50'
                }`}
              >
                <span className={`inline-flex h-6 w-6 items-center justify-center rounded-full ${item.tone}`}>
                  <Icon className="h-3.5 w-3.5" />
                </span>
                <span className="whitespace-nowrap text-[12px] font-extrabold text-slate-800">{item.label}</span>
              </button>
            );
          })}
        </div>
        <div className="mt-4" data-sheet-list>{children}</div>
      </div>
    </section>
  );
}
