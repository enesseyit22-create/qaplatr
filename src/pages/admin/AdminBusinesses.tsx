import { useState } from 'react';
import { ChevronLeft } from 'lucide-react';
import type { AppUser, Campaign, Company, UserRedemption } from '@/lib/campaigns';
import { CampaignEditor, type CampaignDraft } from '@/components/CampaignEditor';
import { StoryStudio } from '@/components/StoryStudio';
import { canCompanyPostStories } from '@/lib/stories';
import { getMsRemaining } from '@/lib/utils';
import { EditBusinessProfile, type BusinessProfileDraft } from '@/pages/EditBusinessProfile';
import { VerifiedBadge } from '@/components/VerifiedBadge';

type AccordionKey = 'contact' | 'campaigns' | 'actions';

export function AdminBusinessDetail({
  company,
  campaigns,
  users,
  redemptions,
  busy,
  editingCampaign,
  permTick,
  onBack,
  onFeatured,
  onToggleStories,
  onApprove,
  onHold,
  onDelete,
  onEditCampaign,
  onSaveCampaign,
  onToggleCampaign,
  onDeleteCampaign,
  onSaveProfile,
  onChanged,
}: {
  company: Company | null;
  campaigns: Campaign[];
  users: AppUser[];
  redemptions: UserRedemption[];
  busy: boolean;
  editingCampaign: Campaign | null;
  permTick: number;
  onBack: () => void;
  onFeatured: (company: Company) => void;
  onToggleStories: (company: Company) => void;
  onApprove: (company: Company) => void;
  onHold: (company: Company) => void;
  onDelete: (company: Company) => void;
  onEditCampaign: (campaign: Campaign | null) => void;
  onSaveCampaign: (draft: CampaignDraft) => Promise<void>;
  onToggleCampaign: (campaign: Campaign) => void;
  onDeleteCampaign: (campaign: Campaign) => void;
  onSaveProfile?: (draft: BusinessProfileDraft) => Promise<void>;
  onChanged?: () => void;
}) {
  const [open, setOpen] = useState<AccordionKey>('contact');
  void permTick;
  if (!company) {
    return (
      <button type="button" onClick={onBack} className="text-xs font-bold text-mint-600">Listeye dön</button>
    );
  }

  const campaignIds = new Set(campaigns.map((item) => item.id));
  const uses = redemptions.filter((row) => campaignIds.has(row.campaign_id));
  const activeCampaigns = campaigns.filter(
    (item) => item.is_active && getMsRemaining(item.expiry_date) > 0,
  );

  const tabs: { id: AccordionKey; label: string }[] = [
    { id: 'contact', label: 'Firma / İletişim' },
    { id: 'campaigns', label: 'Aktif Kampanyalar' },
    { id: 'actions', label: 'Aksiyonlar' },
  ];

  return (
    <div className="space-y-3">
      <button type="button" onClick={onBack} className="inline-flex items-center gap-1 text-xs font-bold text-mint-600">
        <ChevronLeft className="h-4 w-4" /> Firma listesi
      </button>
      <article className="rounded-2xl border border-mint-100 bg-white px-3 py-3">
        <p className="inline-flex items-center gap-1 text-sm font-extrabold text-mint-900">{company.name}<VerifiedBadge verified={company.is_verified} />{company.is_featured ? ' · öne çıkan' : ''}</p>
        <p className="mt-0.5 text-[11px] text-gray-400">{company.category}</p>
      </article>

      <div className="grid grid-cols-3 gap-1 rounded-2xl bg-mint-50 p-1">
        {tabs.map((tab) => (
          <button
            key={tab.id}
            type="button"
            onClick={() => setOpen(tab.id)}
            className={`rounded-xl px-1 py-2 text-[10px] font-extrabold ${open === tab.id ? 'bg-white text-mint-800 shadow-sm' : 'text-mint-600'}`}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {open === 'contact' ? (
        <div className="space-y-3">
          <article className="rounded-2xl border border-mint-100 bg-white px-3 py-3">
            <dl className="space-y-1.5 text-[12px]">
              <DetailRow label="Adres" value={company.address || '—'} />
              <DetailRow label="Telefon" value={company.phone || '—'} />
              <DetailRow label="E-posta" value={company.email || company.owner_email || '—'} />
              <DetailRow label="Konum" value={`${Number(company.latitude).toFixed(4)}, ${Number(company.longitude).toFixed(4)}`} />
              <DetailRow label="Açıklama" value={company.description || '—'} />
              <DetailRow label="Kampanya" value={`${campaigns.length}`} />
              <DetailRow label="Kullanım" value={`${uses.length}`} />
            </dl>
          </article>
          {users.length > 0 ? (
            <section className="rounded-2xl border border-mint-100 bg-white px-3 py-3">
              <p className="text-[11px] font-extrabold uppercase tracking-wide text-mint-600">Firma hesabı</p>
              {users.map((item) => (
                <p key={item.id} className="mt-1 truncate text-xs text-mint-800">{item.full_name || item.email} · {item.email}</p>
              ))}
            </section>
          ) : null}
          {onSaveProfile ? (
            <EditBusinessProfile company={company} busy={busy} submitLabel="Profili kaydet" onSubmit={onSaveProfile} />
          ) : null}
        </div>
      ) : null}

      {open === 'campaigns' ? (
        <div className="space-y-3">
          <section className="rounded-2xl border border-mint-100 bg-white px-3 py-3">
            <p className="mb-2 text-[11px] font-extrabold uppercase tracking-wide text-mint-600">Aktif kampanyalar</p>
            <CampaignEditor
              key={editingCampaign?.id ?? `new-${company.id}`}
              initial={editingCampaign}
              busy={busy}
              submitLabel={editingCampaign ? 'Güncelle' : 'Bu firmaya ekle'}
              onSubmit={onSaveCampaign}
            />
            {editingCampaign ? (
              <button type="button" onClick={() => onEditCampaign(null)} className="mt-2 text-[11px] font-bold text-mint-600">Vazgeç</button>
            ) : null}
            <ul className="mt-3 max-h-56 overflow-y-auto">
              {(activeCampaigns.length ? activeCampaigns : campaigns).map((campaign) => (
                <li key={campaign.id} className="flex items-center justify-between gap-2 border-t border-mint-50 py-1.5 first:border-t-0">
                  <div className="min-w-0">
                    <p className="truncate text-[12px] font-bold text-mint-900">{campaign.title}</p>
                    <p className="text-[10px] text-gray-400">
                      {Number(campaign.discount_rate) > 0 ? `%${campaign.discount_rate}` : 'İndirimsiz'} · Stok {campaign.stock ?? 0} · {campaign.is_active ? 'Aktif' : 'Pasif'}
                    </p>
                  </div>
                  <div className="flex shrink-0 gap-1">
                    <button type="button" className="rounded-lg bg-mint-50 px-2 py-1 text-[10px] font-bold text-mint-700" onClick={() => onToggleCampaign(campaign)}>{campaign.is_active ? 'Durdur' : 'Aç'}</button>
                    <button type="button" className="rounded-lg bg-mint-50 px-2 py-1 text-[10px] font-bold text-mint-800" onClick={() => onEditCampaign(campaign)}>Düzelt</button>
                    <button type="button" className="rounded-lg bg-red-50 px-2 py-1 text-[10px] font-bold text-red-500" onClick={() => onDeleteCampaign(campaign)}>Sil</button>
                  </div>
                </li>
              ))}
            </ul>
          </section>
          <section className="rounded-2xl border border-mint-100 bg-white px-3 py-3">
            <p className="text-[11px] font-extrabold uppercase tracking-wide text-mint-600">Kullanım raporu</p>
            {uses.length === 0 ? (
              <p className="mt-2 text-xs text-gray-400">Henüz kupon kullanımı yok.</p>
            ) : (
              <ul className="mt-2 max-h-40 overflow-y-auto">
                {uses.map((row) => (
                  <li key={row.id} className="flex justify-between gap-2 border-t border-mint-50 py-1.5 text-[11px] text-mint-800 first:border-t-0">
                    <span className="truncate">{campaigns.find((item) => item.id === row.campaign_id)?.title ?? 'Kampanya'}</span>
                    <span className="shrink-0 text-gray-400">{new Date(row.redeemed_at).toLocaleDateString('tr-TR')}</span>
                  </li>
                ))}
              </ul>
            )}
          </section>
          <StoryStudio actor="admin" company={company} onChanged={onChanged} />
        </div>
      ) : null}

      {open === 'actions' ? (
        <section className="space-y-2 rounded-2xl border border-mint-100 bg-white px-3 py-3">
          <p className="text-[11px] font-extrabold uppercase tracking-wide text-mint-600">Aksiyonlar</p>
          <p className="text-[11px] text-gray-400">Onayla öne çıkarır, Durdur kampanyaları ve vitrini kapatır, Sil firmayı kaldırır.</p>
          <button type="button" disabled={busy} onClick={() => onApprove(company)} className="w-full rounded-2xl bg-mint-500 py-3 text-sm font-extrabold text-white disabled:opacity-50">
            Onayla
          </button>
          <button type="button" disabled={busy} onClick={() => onHold(company)} className="w-full rounded-2xl bg-amber-50 py-3 text-sm font-extrabold text-amber-700 disabled:opacity-50">
            Durdur
          </button>
          <button type="button" disabled={busy} onClick={() => onDelete(company)} className="w-full rounded-2xl bg-red-50 py-3 text-sm font-extrabold text-red-600 disabled:opacity-50">
            Sil
          </button>
          <div className="flex flex-wrap gap-1 pt-2">
            <button type="button" disabled={busy} onClick={() => onFeatured(company)} className="rounded-lg bg-mint-50 px-2 py-1 text-[10px] font-bold text-mint-700">
              {company.is_featured ? 'Öne çıkarmayı kapat' : 'Öne çıkar'}
            </button>
            <button
              type="button"
              onClick={() => onToggleStories(company)}
              className={`rounded-lg px-2 py-1 text-[10px] font-bold ${canCompanyPostStories(company.id) ? 'bg-mint-100 text-mint-800' : 'bg-cream-50 text-gray-400'}`}
            >
              Hikaye {canCompanyPostStories(company.id) ? 'açık' : 'kapalı'}
            </button>
          </div>
        </section>
      ) : null}
    </div>
  );
}

function DetailRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex justify-between gap-3">
      <dt className="shrink-0 text-gray-400">{label}</dt>
      <dd className="text-right font-semibold text-mint-800">{value}</dd>
    </div>
  );
}

export { AdminBusinessDetail as AdminBusinesses };
