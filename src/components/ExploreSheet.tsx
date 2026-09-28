import { useEffect, useLayoutEffect, useRef, useState, type PointerEvent, type ReactNode } from 'react';
import {
  Baby, Briefcase, Building2, Car, ChevronUp, Coffee, Dumbbell, GraduationCap,
  Heart, LayoutGrid, Music, Package, Palette, PawPrint, Scissors, Search, Shirt,
  ShoppingBag, Sofa, Stethoscope, Utensils, Wrench, X, Zap, Cpu,
} from 'lucide-react';
import { ExploreBannerSlider, type ShowcasePlace } from '@/components/ExploreBannerSlider';
import { EXPLORE_FEED, type ExploreCategoryId, type ExploreFeedId } from '@/lib/sectors';

export type { ExploreFeedId };

const FEED_ICONS: Record<ExploreFeedId, typeof Utensils> = {
  all: LayoutGrid,
  food: Utensils,
  cafe: Coffee,
  market: ShoppingBag,
  wear: Shirt,
  bridal: Heart,
  beauty: Scissors,
  sport: Dumbbell,
  health: Stethoscope,
  furniture: Sofa,
  decor: Palette,
  fun: Music,
  tech: Cpu,
  service: Wrench,
  education: GraduationCap,
  auto: Car,
  estate: Building2,
  cargo: Package,
  pet: PawPrint,
  kids: Baby,
  corporate: Briefcase,
  deal: Zap,
};

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
  feed?: ExploreFeedId;
  onFeed?: (id: ExploreFeedId) => void;
  origin?: { latitude: number; longitude: number } | null;
  places?: ShowcasePlace[];
  children: ReactNode;
};

export function ExploreSheet({
  category: _category,
  onCategory: _onCategory,
  onHeightChange,
  locationHint,
  collapsed = true,
  onToggle,
  searchQuery,
  onSearchQuery,
  campaignHits: _campaignHits = [],
  feed = 'all',
  onFeed,
  origin = null,
  places = [],
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
    node.style.willChange = 'transform';
    node.style.transition = animate ? 'transform 420ms cubic-bezier(0.22, 1, 0.36, 1)' : 'none';
    if (node.style.height !== `${height}px`) node.style.height = `${height}px`;
    node.style.transform = `translate3d(0, ${height - visible}px, 0)`;
    if (!animate) {
      onHeightRef.current(visible);
      return;
    }
    const done = (event: TransitionEvent) => {
      if (event.propertyName !== 'transform') return;
      node.removeEventListener('transitionend', done);
      onHeightRef.current(visible);
    };
    node.addEventListener('transitionend', done);
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
    const capped = Math.max(SHEET_PEEK + 180, vh - headerReserve - bottomReserve);
    expandedH.current = Math.min(Math.round(vh * 0.82), capped);
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
  const query = searchQuery ?? sectorQuery;
  const setQuery = (value: string) => {
    setSectorQuery(value);
    onSearchQuery?.(value);
  };
  const drag = useRef<{ y: number; moved: boolean } | null>(null);

  const onHandleDown = (event: PointerEvent<HTMLButtonElement>) => {
    drag.current = { y: event.clientY, moved: false };
    event.currentTarget.setPointerCapture(event.pointerId);
  };

  const onHandleMove = (event: PointerEvent<HTMLButtonElement>) => {
    const start = drag.current;
    const node = sheetRef.current;
    if (!start || !node) return;
    const dy = event.clientY - start.y;
    if (Math.abs(dy) > 8) start.moved = true;
    const height = expandedH.current;
    const base = collapsedRef.current ? SHEET_PEEK : height;
    const visible = Math.min(height, Math.max(SHEET_PEEK, base - dy));
    node.style.transition = 'none';
    node.style.transform = `translate3d(0, ${height - visible}px, 0)`;
  };

  const onHandleUp = (event: PointerEvent<HTMLButtonElement>) => {
    const start = drag.current;
    drag.current = null;
    if (!start) return;
    const dy = event.clientY - start.y;
    if (!start.moved) {
      onToggle();
      return;
    }
    const shouldCollapse = dy > 28;
    const shouldExpand = dy < -28;
    if (shouldCollapse && !collapsedRef.current) onToggle();
    else if (shouldExpand && collapsedRef.current) onToggle();
    else paint(collapsedRef.current, true);
  };

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
        onPointerDown={onHandleDown}
        onPointerMove={onHandleMove}
        onPointerUp={onHandleUp}
        onPointerCancel={onHandleUp}
        className="relative flex w-full shrink-0 touch-none flex-col items-center px-4 pb-2 pt-1.5 pointer-events-auto"
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
        <ExploreBannerSlider origin={origin} places={places} />
        <label className="mt-3 flex items-center gap-2 rounded-2xl border border-slate-100 bg-slate-50 px-3 py-2.5">
          <Search className="h-4 w-4 shrink-0 text-slate-400" />
          <input
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Kampanya veya firma ara"
            className="min-w-0 flex-1 bg-transparent text-[13px] font-semibold text-slate-800 outline-none placeholder:font-medium placeholder:text-slate-400"
          />
          {query ? (
            <button type="button" onClick={() => setQuery('')} aria-label="Aramayı temizle" className="text-slate-400">
              <X className="h-4 w-4" />
            </button>
          ) : null}
        </label>
        <div className="-mx-4 mt-3 flex gap-3 overflow-x-auto px-4 pb-1 no-scrollbar">
          {EXPLORE_FEED.map((item) => {
            const active = feed === item.id;
            const Icon = FEED_ICONS[item.id];
            return (
              <button
                key={item.id}
                type="button"
                onClick={() => onFeed?.(item.id)}
                className="flex w-[4.8rem] shrink-0 flex-col items-center gap-1.5"
              >
                <span className={`flex h-12 w-12 items-center justify-center rounded-full border ${active ? 'border-[#2f6fe0] bg-[#2f6fe0] text-white shadow-md' : 'border-slate-200 bg-white text-slate-500'}`}>
                  <Icon className="h-5 w-5" />
                </span>
                <span className={`text-center text-[10px] font-extrabold leading-tight ${active ? 'text-[#2f6fe0]' : 'text-slate-500'}`}>{item.label}</span>
              </button>
            );
          })}
        </div>
        <div className="mt-4" data-sheet-list>{children}</div>
      </div>
    </section>
  );
}
