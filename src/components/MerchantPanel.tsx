import { useCallback, useEffect, useRef, useState } from 'react';
import {
  Loader2, LogOut, Pencil, Trash2,
} from 'lucide-react';
import { useAuth } from '@/lib/authContext';
import { welcomeLine } from '@/lib/auth';
import {
  approveMerchantCouponCode,
  bindMerchantSession,
  createMerchantCampaignAction,
  deleteMerchantCampaignAction,
  fetchMerchantCompany,
  listMerchantCampaigns,
  listMerchantRedemptions,
  setMerchantCampaignActive,
  updateMerchantCampaignAction,
} from '@/lib/actions/merchant';
import { CampaignEditor } from '@/components/CampaignEditor';
import { CampaignMiniList } from '@/components/CampaignMiniList';
import type { Campaign, Company, UserRedemption } from '@/lib/campaigns';
import { dailyCampaignLimitReached, campaignsCreatedToday } from '@/lib/campaigns';
import { planLimits, planTierOf } from '@/lib/plans';
import { campaignWindowOpen } from '@/lib/campaignMap';
import { MerchantPushQuota } from '@/components/MerchantPushQuota';
import { MerchantShowcaseRequest } from '@/components/MerchantShowcaseRequest';
import { VerifiedBadge } from '@/components/VerifiedBadge';
import { SideMenu } from '@/components/SideMenu';
import { PanelTopBar, panelChip, panelIconBtn } from '@/components/TabPageShell';
import { useAppFeatures } from '@/lib/appFeatures';
import { loadBusinessForUser, type BusinessApplication } from '@/lib/businesses';
import { subscribeTables } from '@/lib/live';
import { applyCampaignList, subscribeCampaignTable } from '@/lib/campaignLive';
import { BusinessPendingScreen } from '@/components/BusinessPendingScreen';
import { PilotSubscriptionGate } from '@/components/PilotSubscriptionGate';
import { formatTrialDate, mergeFirmBilling, needsSubscriptionPaywall, pilotTrialActive, pilotTrialEnd } from '@/lib/subscription';
import { VipLockedNotifyPreview, VipLockedStoryPreview } from '@/components/VipLockedFeature';
import { StoryStudio } from '@/components/StoryStudio';

export type MerchantTab = 'code' | 'campaigns' | 'report' | 'vip';

export function MerchantPanelScreen({
  onBack,
  onChanged,
  initialTab = 'code',
}: {
  onBack: () => void;
  onChanged?: () => void;
  initialTab?: MerchantTab;
}) {
  const { profile, signOut } = useAuth();
  const features = useAppFeatures();
  const [tab, setTab] = useState<MerchantTab>(initialTab);
  const [company, setCompany] = useState<Company | null>(null);
  const [application, setApplication] = useState<BusinessApplication | null>(null);
  const [campaigns, setCampaigns] = useState<Campaign[]>([]);
  const [redemptions, setRedemptions] = useState<UserRedemption[]>([]);
  const [stats, setStats] = useState({ campaigns: 0, active_campaigns: 0, redemptions: 0 });
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [code, setCode] = useState('');
  const [editing, setEditing] = useState<Campaign | null>(null);
  const [accessTick, setAccessTick] = useState(0);
  const refreshGen = useRef(0);

  const goTab = (next: MerchantTab) => setTab(next);

  useEffect(() => {
    setTab(initialTab);
  }, [initialTab]);

  const refresh = useCallback(async (silent = false) => {
    const ticket = ++refreshGen.current;
    bindMerchantSession(profile ?? null);
    if (!silent) setLoading(true);
    try {
      const [nextApplication, nextCompany] = await Promise.all([
        profile?.id ? loadBusinessForUser(profile.id, profile.email).catch(() => null) : Promise.resolve(null),
        fetchMerchantCompany(profile ?? null),
      ]);
      if (ticket !== refreshGen.current) return;
      setApplication(nextApplication);
      setCompany(nextCompany);
      if (!nextCompany || nextApplication?.status === 'pending' || nextApplication?.status === 'rejected') {
        setCampaigns([]);
        setRedemptions([]);
        setStats({ campaigns: 0, active_campaigns: 0, redemptions: 0 });
        return;
      }
      setLoading(false);
      const nextCampaigns = await listMerchantCampaigns(nextCompany.id).catch(() => [] as Campaign[]);
      const nextRedemptions = await listMerchantRedemptions(nextCompany.id, nextCampaigns.map((item) => item.id)).catch(() => [] as UserRedemption[]);
      const today = new Date().toISOString().slice(0, 10);
      const nextStats = {
        campaigns: nextCampaigns.length,
        active_campaigns: nextCampaigns.filter((item) => item.is_active && item.expiry_date >= today).length,
        redemptions: nextRedemptions.length,
      };
      if (ticket !== refreshGen.current) return;
      setCampaigns(nextCampaigns ?? []);
      setStats(nextStats ?? { campaigns: 0, active_campaigns: 0, redemptions: 0 });
      setRedemptions(nextRedemptions ?? []);
    } catch (err) {
      if (ticket !== refreshGen.current) return;
      setError(err instanceof Error ? err.message : 'Firma verileri yüklenemedi');
      setCompany(null);
    } finally {
      if (ticket === refreshGen.current) setLoading(false);
    }
  }, [profile]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  useEffect(() => {
    try {
      const stopTables = subscribeTables(['companies', 'campaigns', 'businesses', 'coupon_tickets', 'user_redemptions'], () => { void refresh(true); });
      const stopCampaigns = subscribeCampaignTable((change) => {
        setCampaigns((current) => {
          const id = String((change.eventType === 'DELETE' ? change.previous : change.row)?.id ?? '');
          if (change.eventType === 'DELETE') return current.filter((item) => item.id !== id);
          const rowCompany = String(change.row?.company_id ?? '');
          const mine = current[0]?.company_id ?? company?.id ?? '';
          if (rowCompany && mine && rowCompany !== mine) return current;
          return applyCampaignList(current, change);
        });
      });
      return () => {
        stopTables();
        stopCampaigns();
      };
    } catch {
      return undefined;
    }
  }, [company?.id, refresh]);

  const access = mergeFirmBilling(company, application);
  const trialEndsAt = pilotTrialEnd(access)?.getTime() ?? 0;
  useEffect(() => {
    if (!trialEndsAt || trialEndsAt <= Date.now()) return;
    const timer = window.setTimeout(() => setAccessTick((value) => value + 1), trialEndsAt - Date.now() + 250);
    return () => window.clearTimeout(timer);
  }, [trialEndsAt]);

  if (loading) {
    return <BusinessPendingScreen loading onBack={onBack} />;
  }

  const pending = !company || application?.status === 'pending' || application?.status === 'rejected';
  void accessTick;
  if (pending) {
    return (
      <BusinessPendingScreen
        onBack={onBack}
        onSignOut={() => { void signOut().then(() => onBack()); }}
        companyName={application?.company_name ?? company?.name}
      />
    );
  }

  if (company && needsSubscriptionPaywall(access)) {
    return (
      <PilotSubscriptionGate
        companyId={company.id}
        reason={access.is_pilot_firm ? 'trial' : 'plan'}
        endsAt={access.subscription_ends_at}
        onBack={onBack}
        onStarted={() => { void refresh(); }}
      />
    );
  }

  const trialEndLabel = pilotTrialActive(access) ? formatTrialDate(access?.subscription_ends_at) : '';

  return (
    <div className="flex h-full min-h-0 flex-col overflow-hidden bg-[#eef3f1]">
      <PanelTopBar
        title={welcomeLine(profile, profile?.email, company?.name)}
        subtitle={(
          <span className="inline-flex max-w-full items-center gap-1">
            <span className="truncate">{company?.name ?? 'İşletme'}</span>
            <VerifiedBadge verified={company?.is_verified} tone="onDark" />
          </span>
        )}
        onBack={onBack}
        stats={[
          { label: 'Kampanya', value: stats.campaigns },
          { label: 'Aktif', value: stats.active_campaigns },
          { label: 'Onay', value: stats.redemptions },
        ]}
        actions={(
          <>
            <SideMenu
              variant="merchant"
              tone="mint"
              company={company}
              hideMerchantLogin
              merchantTab={tab}
              onMerchantTab={goTab}
            />
            <button
              type="button"
              onClick={() => { void signOut().then(() => onBack()); }}
              className={panelIconBtn}
              aria-label="Çıkış"
            >
              <LogOut className="h-4 w-4" />
            </button>
          </>
        )}
      >
        <div className="flex gap-1 overflow-x-auto pb-0.5 no-scrollbar">
          {([
            ['code', 'Onay', features.merchant?.code],
            ['campaigns', 'Kampanya', features.merchant?.campaigns],
            ['report', 'Rapor', features.merchant?.report],
            ['vip', 'VIP', true],
          ] as const).filter((item) => item[2]).map(([id, label]) => (
            <button key={id} type="button" onClick={() => goTab(id)} className={panelChip(tab === id)}>
              {label}
            </button>
          ))}
        </div>
      </PanelTopBar>

      <div className="min-h-0 flex-1 space-y-3 overflow-y-auto px-5 py-4 pb-28">
        {trialEndLabel ? (
          <p className="rounded-2xl bg-mint-50 px-3 py-2 text-xs font-bold text-mint-800">
            Pilot firma · {trialEndLabel} tarihine kadar ücretsiz (60 gün). Ödeme ekranı bu süre dolunca açılır.
          </p>
        ) : null}
        {error && <p className="rounded-2xl bg-red-50 px-3 py-2 text-xs text-red-600">{error}</p>}
        {notice && <p className="rounded-2xl bg-mint-50 px-3 py-2 text-xs text-mint-700">{notice}</p>}
        {loading ? <div className="flex justify-center py-10"><Loader2 className="h-6 w-6 animate-spin text-mint-500" /></div> : null}

        {tab === 'code' && (
          <form
            className="space-y-3 rounded-3xl border border-mint-100 bg-white p-4"
            onSubmit={async (event) => {
              event.preventDefault();
              if (!code.trim()) return;
              setBusy(true);
              setError(null);
              try {
                const claim = await approveMerchantCouponCode(code);
                setNotice(`Onaylandı · ${claim.code}`);
                setCode('');
                await refresh(true);
              } catch (err) {
                setError(err instanceof Error ? err.message : 'Onaylanamadı');
              } finally {
                setBusy(false);
              }
            }}
          >
            <p className="text-sm font-extrabold text-mint-800">Onay</p>
            <p className="text-xs text-gray-400">Müşteri kupon kodunu gir, anında onayla.</p>
            <input className={fieldClass} value={code} onChange={(e) => setCode(e.target.value)} placeholder="Kupon kodu" />
            <button type="submit" disabled={busy} className="btn-primary w-full py-3 disabled:opacity-50">
              {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : 'Onayla'}
            </button>
          </form>
        )}

        {tab === 'campaigns' && (
          company ? (
          <>
            <MerchantPushQuota company={company} />
            <p className="px-1 text-xs text-gray-400">
              {planLimits(planTierOf(company)).dailyCampaigns <= 1 ? 'Standart pakette' : 'Premium pakette'} günde {planLimits(planTierOf(company)).dailyCampaigns} kampanya. Bugün {Math.min(campaignsCreatedToday(campaigns, company.id), planLimits(planTierOf(company)).dailyCampaigns)}/{planLimits(planTierOf(company)).dailyCampaigns} kullanıldı.
            </p>
            <CampaignEditor
              key={editing?.id ?? 'new'}
              initial={editing}
              busy={busy}
              submitLabel={editing ? 'Güncelle' : 'Kaydet'}
              locked={!editing && dailyCampaignLimitReached(campaigns, company.id, planLimits(planTierOf(company)).dailyCampaigns)}
              lockMessage={planLimits(planTierOf(company)).dailyCampaigns <= 1
                ? 'Bugünkü 1 kampanya hakkın doldu. Premium pakette limit yükselir. Mevcut kampanyayı güncelleyebilirsin.'
                : 'Bugünkü Premium kampanya hakkın doldu. Mevcut kampanyayı güncelleyebilirsin.'}
              onSubmit={async (draft) => {
                setBusy(true);
                setError(null);
                try {
                  if (editing) {
                    await updateMerchantCampaignAction({ id: editing.id, ...draft });
                    setNotice('Kampanya güncellendi.');
                  } else {
                    await createMerchantCampaignAction({ company_id: company?.id ?? '', ...draft });
                    setNotice('Kampanya eklendi.');
                  }
                  setEditing(null);
                  await refresh(true);
                  onChanged?.();
                } catch (err) {
                  setError(err instanceof Error ? err.message : 'Kaydedilemedi');
                } finally {
                  setBusy(false);
                }
              }}
            />
            {campaigns.map((campaign) => (
              <article key={campaign.id} className="flex items-center justify-between gap-2 rounded-2xl border border-mint-100 bg-white px-3 py-2">
                <div className="min-w-0">
                  <p className="truncate text-sm font-bold text-mint-900">{campaign.title}</p>
                  <p className="text-[10px] text-gray-400">{Number(campaign.discount_rate) > 0 ? `%${campaign.discount_rate}` : 'İndirimsiz'} · Stok {campaign.stock ?? 0} · {campaignWindowOpen(campaign.created_at) && campaign.is_active ? '24 saat yayında' : 'Arşiv'}</p>
                </div>
                <div className="flex shrink-0 gap-1">
                  <button type="button" className="rounded-lg bg-mint-50 px-2 py-1 text-[10px] font-bold text-mint-700" onClick={() => void setMerchantCampaignActive(campaign.id, !campaign.is_active).then(() => refresh(true))}>
                    {campaign.is_active ? 'Pasif' : 'Aktif'}
                  </button>
                  <button type="button" className="rounded-lg bg-mint-50 p-1.5 text-mint-700" onClick={() => setEditing(campaign)}><Pencil className="h-3.5 w-3.5" /></button>
                  <button type="button" className="rounded-lg bg-red-50 p-1.5 text-red-500" onClick={() => void deleteMerchantCampaignAction(campaign.id).then(() => { void refresh(true); onChanged?.(); })}><Trash2 className="h-3.5 w-3.5" /></button>
                </div>
              </article>
            ))}
          </>
          ) : (
            <p className="rounded-3xl border border-mint-100 bg-white px-4 py-8 text-center text-sm text-gray-400">Firma kaydı hazırlanıyor…</p>
          )
        )}

        {tab === 'report' && (
          <section className="rounded-3xl border border-mint-100 bg-white p-3">
            <p className="mb-2 text-sm font-extrabold text-mint-800">Rapor</p>
            <CampaignMiniList campaigns={campaigns} />
            <ul className="mt-3 space-y-1.5">
              {redemptions.slice(0, 40).map((row) => (
                <li key={row.id} className="flex justify-between text-[11px] text-gray-500">
                  <span className="truncate">{campaigns.find((item) => item.id === row.campaign_id)?.title ?? 'Kupon'}</span>
                  <span>{new Date(row.redeemed_at).toLocaleDateString('tr-TR')}</span>
                </li>
              ))}
            </ul>
          </section>
        )}

        {tab === 'vip' && (
          planLimits(planTierOf(company)).vip ? (
            <div className="space-y-3">
              <section className="rounded-3xl border border-mint-100 bg-white p-3">
                <p className="text-sm font-extrabold text-mint-900">Premium · lansman 1299 TL/ay</p>
                <p className="mt-1 text-[11px] text-slate-500">Normal fiyat 1599 TL/ay. Standard paket 599 TL/ay.</p>
                <p className="mt-1 text-[11px] font-semibold text-mint-700">
                  {company.subscription_ends_at ? `Paket bitişi ${new Date(company.subscription_ends_at).toLocaleDateString('tr-TR')}` : 'Süre yönetici panelinden yazılır.'}
                </p>
              </section>
              <MerchantPushQuota company={company} />
              <MerchantShowcaseRequest company={company} />
              <StoryStudio actor="merchant" company={company} />
            </div>
          ) : (
            <div className="space-y-3">
              <VipLockedStoryPreview />
              <VipLockedNotifyPreview />
            </div>
          )
        )}
      </div>
    </div>
  );
}

const fieldClass = 'w-full rounded-2xl border-2 border-mint-100 bg-white px-4 py-3 text-sm text-mint-800 placeholder:text-gray-300 focus:border-mint-400 focus:outline-none';
