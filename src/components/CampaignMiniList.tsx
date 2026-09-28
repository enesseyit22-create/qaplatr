import type { Campaign } from '@/lib/campaigns';
import { formatDurationLeft, getMsRemaining } from '@/lib/utils';

export function CampaignMiniList({
  campaigns,
  tone = 'light',
}: {
  campaigns: Campaign[];
  tone?: 'light' | 'dark';
}) {
  const active = (campaigns ?? []).filter((item) => item?.is_active && getMsRemaining(item?.expiry_date) > 0);
  const dark = tone === 'dark';

  return (
    <div className={`rounded-2xl border px-3 py-2.5 ${dark ? 'border-white/10 bg-white/[0.04]' : 'border-mint-100 bg-cream-50'}`}>
      <div className="flex items-center justify-between gap-2">
        <p className={`text-[10px] font-bold uppercase tracking-[0.16em] ${dark ? 'text-zinc-400' : 'text-gray-400'}`}>
          Aktif kupon
        </p>
        <p className={`text-sm font-extrabold ${dark ? 'text-emerald-300' : 'text-mint-700'}`}>{active.length}</p>
      </div>
      {active.length === 0 ? (
        <p className={`mt-1.5 text-[11px] ${dark ? 'text-zinc-500' : 'text-gray-400'}`}>Aktif kupon yok</p>
      ) : (
        <ul className="mt-1.5 space-y-1">
          {active.slice(0, 6).map((item, index) => (
            <li key={item?.id ?? `campaign-${index}`} className="flex items-center justify-between gap-2 text-[11px]">
              <span className={`truncate font-semibold ${dark ? 'text-zinc-200' : 'text-mint-800'}`}>{item?.title ?? 'Kampanya'}</span>
              <span className={`shrink-0 font-bold ${dark ? 'text-emerald-400' : 'text-mint-600'}`}>
                {formatDurationLeft(item?.expiry_date)}
              </span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
