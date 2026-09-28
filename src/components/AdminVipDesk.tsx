import { useState } from 'react';
import { Crown } from 'lucide-react';
import { AdminShowcaseQueue } from '@/components/AdminShowcaseQueue';
import { VerifiedBadge } from '@/components/VerifiedBadge';
import type { AppUser, Company } from '@/lib/campaigns';
import { PLAN_PRICES, planTierOf, weeklyPushLimit } from '@/lib/plans';
import { setVipFeature, useAppFeatures } from '@/lib/appFeatures';

function addMonths(months: number) {
  const next = new Date();
  next.setMonth(next.getMonth() + months);
  return next.toISOString();
}

export function AdminVipDesk({
  companies,
  users,
  onPlan,
  onQuota,
  onTerm,
  onMemberVip,
}: {
  companies: Company[];
  users: AppUser[];
  onPlan: (company: Company, tier: 'standard' | 'premium') => Promise<void>;
  onQuota: (company: Company, quota: number | null) => Promise<void>;
  onTerm: (company: Company, endsAt: string | null) => Promise<void>;
  onMemberVip: (user: AppUser, vip: boolean) => Promise<void>;
}) {
  const features = useAppFeatures();
  const campaignOn = Boolean(features?.vip?.campaignAlerts);
  const [companyId, setCompanyId] = useState(companies[0]?.id ?? '');
  const [memberId, setMemberId] = useState('');
  const [error, setError] = useState<string | null>(null);
  const company = companies.find((item) => item.id === companyId) ?? companies[0] ?? null;
  const members = users.filter((item) => item.role === 'user');
  const member = members.find((item) => item.id === memberId) ?? null;

  const run = async (job: () => Promise<void>) => {
    setError(null);
    try {
      await job();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Kaydedilemedi');
    }
  };

  return (
    <div className="space-y-3">
      <AdminShowcaseQueue />
      <section className="rounded-[28px] border border-mint-100 bg-white p-4 shadow-sm">
        <p className="text-[10px] font-extrabold uppercase tracking-[0.18em] text-mint-600">Ücret</p>
        <div className="mt-3 grid grid-cols-2 gap-2">
          <button
            type="button"
            disabled={!company}
            onClick={() => { if (company) void run(() => onPlan(company, 'standard')); }}
            className={`rounded-2xl border p-3 text-left ${company && planTierOf(company) === 'standard' ? 'border-mint-500 bg-mint-50' : 'border-slate-100'}`}
          >
            <p className="text-[11px] font-extrabold uppercase tracking-wide text-mint-700">Standard</p>
            <p className="mt-1 text-xl font-extrabold text-slate-900">{PLAN_PRICES.standard} <span className="text-xs font-bold text-slate-400">TL/ay</span></p>
          </button>
          <button
            type="button"
            disabled={!company}
            onClick={() => { if (company) void run(() => onPlan(company, 'premium')); }}
            className={`rounded-2xl border p-3 text-left ${company && planTierOf(company) === 'premium' ? 'border-mint-500 bg-mint-50' : 'border-slate-100'}`}
          >
            <p className="text-[11px] font-extrabold uppercase tracking-wide text-mint-700">Premium</p>
            <p className="mt-1 text-xl font-extrabold text-slate-900">{PLAN_PRICES.premiumLaunch} <span className="text-xs font-bold text-slate-400">TL/ay</span></p>
            <p className="text-[10px] text-slate-400">Normal <span className="line-through">{PLAN_PRICES.premium} TL</span></p>
          </button>
        </div>
      </section>

      <section className="space-y-2 rounded-[28px] border border-mint-100 bg-white p-4">
        <p className="flex items-center gap-1.5 text-sm font-extrabold text-mint-900"><Crown className="h-4 w-4 text-amber-600" /> Firma VIP</p>
        <select className="w-full rounded-2xl border-2 border-mint-100 px-3 py-2.5 text-sm text-mint-800" value={company?.id ?? ''} onChange={(event) => setCompanyId(event.target.value)}>
          {companies.map((item) => (
            <option key={item.id} value={item.id}>{item.name}</option>
          ))}
        </select>
        {company ? (
          <div className="space-y-2">
            <p className="inline-flex items-center gap-1 text-sm font-extrabold text-slate-800">{company.name}<VerifiedBadge verified={company.is_verified} /></p>
            <p className="text-[11px] text-slate-500">
              {planTierOf(company) === 'premium' ? `Premium · lansman ${PLAN_PRICES.premiumLaunch} TL` : `Standard · ${PLAN_PRICES.standard} TL`}
              {' · '}bildirim hakkı {weeklyPushLimit(company)}
              {company.subscription_ends_at ? ` · bitiş ${new Date(company.subscription_ends_at).toLocaleDateString('tr-TR')}` : ''}
            </p>
            <div className="flex flex-wrap gap-1.5">
              {[1, 3, 12].map((months) => (
                <button
                  key={months}
                  type="button"
                  onClick={() => { void run(() => onTerm(company, addMonths(months))); }}
                  className="rounded-full bg-mint-50 px-3 py-1 text-[11px] font-extrabold text-mint-800"
                >
                  {months} ay
                </button>
              ))}
              <button type="button" onClick={() => { void run(() => onTerm(company, null)); }} className="rounded-full bg-slate-100 px-3 py-1 text-[11px] font-extrabold text-slate-500">
                Süreyi temizle
              </button>
            </div>
            <label className="flex items-center justify-between gap-2 text-[11px] font-bold text-slate-500">
              Push hakkı
              <input
                key={`${company.id}-${company.push_quota_override ?? 'auto'}`}
                defaultValue={company.push_quota_override ?? ''}
                inputMode="numeric"
                placeholder="oto"
                className="w-16 rounded-xl border border-mint-100 px-2 py-1 text-sm text-mint-800"
                onBlur={(event) => {
                  const raw = event.target.value.trim();
                  const quota = raw === '' ? null : Math.max(0, Math.min(52, Number(raw)));
                  if (raw !== '' && !Number.isFinite(quota)) return;
                  void run(() => onQuota(company, quota));
                }}
              />
            </label>
          </div>
        ) : <p className="text-xs text-slate-400">Firma yok.</p>}
      </section>

      <section className="space-y-2 rounded-[28px] border border-mint-100 bg-white p-4">
        <p className="flex items-center gap-1.5 text-sm font-extrabold text-mint-900"><Crown className="h-4 w-4 text-amber-600" /> Üye VIP</p>
        <select className="w-full rounded-2xl border-2 border-mint-100 px-3 py-2.5 text-sm text-mint-800" value={member?.id ?? ''} onChange={(event) => setMemberId(event.target.value)}>
          <option value="">Üye seç</option>
          {members.map((item) => (
            <option key={item.id} value={item.id}>{item.full_name || item.email}</option>
          ))}
        </select>
        {member ? (
          <button
            type="button"
            onClick={() => { void run(() => onMemberVip(member, !member.vip)); }}
            className={`w-full rounded-2xl py-2.5 text-sm font-extrabold text-white ${member.vip ? 'bg-amber-500' : 'bg-[#10241f]'}`}
          >
            {member.vip ? 'Üye VIP açık · kapat' : 'Üye VIP aç'}
          </button>
        ) : null}
        <label className="flex items-center justify-between gap-3 pt-1">
          <span className="text-[11px] leading-snug text-slate-500">Kampanya bildirimi yalnızca VIP üyenin ziline gider.</span>
          <button
            type="button"
            onClick={() => setVipFeature('campaignAlerts', !campaignOn)}
            className={`relative h-7 w-12 shrink-0 rounded-full transition ${campaignOn ? 'bg-mint-500' : 'bg-mint-100'}`}
            aria-pressed={campaignOn}
          >
            <span className={`absolute top-0.5 h-6 w-6 rounded-full bg-white shadow ${campaignOn ? 'right-0.5' : 'left-0.5'}`} />
          </button>
        </label>
      </section>
      {error ? <p className="rounded-2xl bg-red-50 px-3 py-2 text-xs text-red-600">{error}</p> : null}
    </div>
  );
}
