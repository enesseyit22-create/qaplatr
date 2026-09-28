import { Loader2, Minus, Navigation, Plus } from 'lucide-react';
import { zoomActiveMap } from '@/lib/mapControl';

export function MapZoomControls({
  locating = false,
  hidden = false,
  onLocate,
}: {
  locating?: boolean;
  hidden?: boolean;
  onLocate?: () => void;
}) {
  return (
    <div
      className={`explore-locate pointer-events-auto absolute z-[1200] flex flex-col gap-2 transition-[opacity,transform] duration-[420ms] ease-[cubic-bezier(0.22,1,0.36,1)] ${hidden ? 'pointer-events-none translate-y-24 opacity-0' : 'translate-y-0 opacity-100'}`}
    >
      <button
        type="button"
        onClick={() => zoomActiveMap(1)}
        aria-label="Yakınlaştır"
        className="flex h-11 w-11 items-center justify-center rounded-full bg-white text-slate-700 shadow-md transition active:scale-95"
      >
        <Plus className="h-5 w-5" strokeWidth={2.4} />
      </button>
      <button
        type="button"
        onClick={() => zoomActiveMap(-1)}
        aria-label="Uzaklaştır"
        className="flex h-11 w-11 items-center justify-center rounded-full bg-white text-slate-700 shadow-md transition active:scale-95"
      >
        <Minus className="h-5 w-5" strokeWidth={2.4} />
      </button>
      <button
        type="button"
        onClick={onLocate}
        aria-label="Konumuma git"
        className="mt-1 flex h-11 w-11 items-center justify-center rounded-full bg-mint-500 text-white shadow-md transition active:scale-95"
      >
        {locating ? <Loader2 className="h-5 w-5 animate-spin" /> : <Navigation className="h-5 w-5" />}
      </button>
    </div>
  );
}
