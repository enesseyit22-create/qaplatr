import type { ReactNode } from 'react';
import { ArrowLeft, ChevronLeft } from 'lucide-react';
import { DropletWordmark } from '@/components/DropletLogo';

export function TabPageShell({
  title,
  subtitle,
  onBack,
  onSecretAdmin,
  children,
}: {
  title: string;
  subtitle?: string;
  onBack?: () => void;
  onSecretAdmin?: () => void;
  children: ReactNode;
}) {
  return (
    <div className="flex h-full min-h-0 flex-col bg-[#eef3f1]">
      <header className="px-4 pb-2 pt-[max(0.45rem,env(safe-area-inset-top))]">
        <div className="flex items-center gap-2.5">
          {onBack ? (
            <button
              type="button"
              onClick={onBack}
              className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-white text-mint-700 shadow-sm"
              aria-label="Geri"
            >
              <ChevronLeft className="h-5 w-5" />
            </button>
          ) : (
            <div className="inline-flex h-12 items-center rounded-2xl bg-white/95 px-2 shadow-sm">
              <DropletWordmark variant="dark" onSecretUnlock={onSecretAdmin} />
            </div>
          )}
          <div className="min-w-0 flex-1">
            <h1 className="truncate text-[17px] font-extrabold leading-tight text-mint-900">{title}</h1>
            {subtitle ? <p className="truncate text-[11px] leading-snug text-mint-700/65">{subtitle}</p> : null}
          </div>
        </div>
      </header>
      <div className="min-h-0 flex-1 overflow-y-auto px-5 pb-28">{children}</div>
    </div>
  );
}

export function PanelTopBar({
  title,
  subtitle,
  onBack,
  actions,
  stats,
  children,
}: {
  title: string;
  subtitle?: string;
  onBack?: () => void;
  actions?: ReactNode;
  stats?: { label: string; value: string | number }[];
  children?: ReactNode;
}) {
  return (
    <header className="shrink-0 bg-gradient-to-b from-[#12b886] to-[#0f9f75] px-3.5 pb-2.5 pt-[max(0.4rem,env(safe-area-inset-top))] text-white">
      <div className="flex items-center gap-2">
        {onBack ? (
          <button
            type="button"
            onClick={onBack}
            className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-white/15"
            aria-label="Geri"
          >
            <ArrowLeft className="h-5 w-5" />
          </button>
        ) : null}
        <div className="min-w-0 flex-1">
          <h1 className="truncate text-[15px] font-extrabold leading-tight tracking-tight">{title}</h1>
          {subtitle ? <p className="truncate text-[11px] leading-snug text-white/75">{subtitle}</p> : null}
        </div>
        {actions ? <div className="flex shrink-0 items-center gap-1.5">{actions}</div> : null}
      </div>
      {stats?.length ? (
        <div className="mt-2 grid grid-cols-3 gap-1.5">
          {stats.map((item) => (
            <div key={item.label} className="rounded-xl bg-white/12 px-2 py-1.5 text-center">
              <p className="text-[8px] font-bold uppercase tracking-[0.14em] text-white/70">{item.label}</p>
              <p className="text-sm font-extrabold leading-none">{item.value}</p>
            </div>
          ))}
        </div>
      ) : null}
      {children ? <div className="mt-2">{children}</div> : null}
    </header>
  );
}

export const panelIconBtn =
  'flex h-12 w-12 items-center justify-center rounded-2xl bg-white/15 text-white';
export const panelChip = (active: boolean) =>
  `shrink-0 rounded-full px-3 py-1.5 text-[11px] font-extrabold ${active ? 'bg-white text-mint-800' : 'bg-white/15 text-white'}`;

export const tabCard = 'flex w-full items-center gap-3 rounded-2xl border border-mint-100 bg-white px-3 py-3 text-left shadow-sm';
export const tabIconWrap = 'flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-mint-50 text-mint-600';
export const tabPrimary = 'flex w-full items-center justify-center rounded-2xl bg-mint-500 py-3 text-sm font-extrabold text-white shadow-mint disabled:opacity-50';
export const tabField = 'w-full rounded-2xl border-2 border-mint-100 bg-white px-3 py-2.5 text-sm text-mint-800 placeholder:text-gray-300 outline-none focus:border-mint-400';
