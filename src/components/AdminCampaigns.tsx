import { Trash2 } from 'lucide-react';
import type { Campaign, Company } from '@/lib/campaigns';
import { getMsRemaining } from '@/lib/utils';

export function AdminCampaignList({
  campaigns,
  companies,
  busy,
  onDelete,
}: {
  campaigns: Campaign[];
  companies: Company[];
  busy: boolean;
  onDelete: (campaign: Campaign) => void;
}) {
  const byCompany = new Map(companies.map((item) => [item.id, item]));
  const rows = [...campaigns].sort((a, b) => String(b.created_at).localeCompare(String(a.created_at)));

  if (rows.length === 0) {
    return <p className="py-8 text-center text-sm text-gray-400">Henüz kampanya yok.</p>;
  }

  return (
    <ul className="space-y-2">
      {rows.map((campaign) => {
        const company = byCompany.get(campaign.company_id);
        const live = campaign.is_active && getMsRemaining(campaign.expiry_date) > 0;
        return (
          <li key={campaign.id} className="flex items-start justify-between gap-3 rounded-2xl border border-mint-100 bg-white px-3 py-3">
            <div className="min-w-0">
              <p className="truncate text-sm font-extrabold text-mint-900">{campaign.title}</p>
              <p className="mt-0.5 truncate text-[11px] text-gray-400">
                {company?.name ?? 'Firma'} · {company?.category ?? '—'}
              </p>
              <p className="mt-1 text-[10px] font-bold text-mint-600">
                {live ? 'Canlı' : campaign.is_active ? 'Süresi doldu' : 'Pasif'}
                {Number(campaign.discount_rate) > 0 ? ` · %${campaign.discount_rate}` : ''}
                {` · Stok ${campaign.stock ?? 0}`}
              </p>
            </div>
            <button
              type="button"
              disabled={busy}
              onClick={() => onDelete(campaign)}
              className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-red-50 text-red-500 disabled:opacity-50"
              aria-label="Kampanyayı sil"
            >
              <Trash2 className="h-4 w-4" />
            </button>
          </li>
        );
      })}
    </ul>
  );
}
