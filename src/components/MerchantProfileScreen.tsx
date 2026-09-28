import { useCallback, useEffect, useState } from 'react';
import { Eye, Heart, ImagePlus, Loader2 } from 'lucide-react';
import { useAuth } from '@/lib/authContext';
import {
  bindMerchantSession,
  fetchMerchantCompany,
  readActiveCompanyId,
  listMerchantCampaigns,
  listMerchantRedemptions,
  updateMerchantProfileAction,
} from '@/lib/actions/merchant';
import type { Campaign, Company, UserRedemption } from '@/lib/campaigns';
import { countFavoritesForCompany } from '@/lib/favorites';
import {
  addCompanyPost,
  uploadPostImage,
  dailyPostLimitReached,
  deleteCompanyPost,
  FREE_DAILY_POST_LIMIT,
  postsTodayCount,
  useCompanyPosts,
} from '@/lib/posts';
import { planLimits, planTierOf } from '@/lib/plans';
import { isSupabaseConfigured, supabase } from '@/lib/supabase';
import { storiesForCompany } from '@/lib/stories';
import { getMsRemaining } from '@/lib/utils';
import { loadBusinessForUser, type BusinessApplication } from '@/lib/businesses';
import { subscribeTables } from '@/lib/live';
import { BusinessPendingScreen } from '@/components/BusinessPendingScreen';
import { EditBusinessProfile } from '@/pages/EditBusinessProfile';
import { BusinessProfile } from '@/pages/BusinessProfile';
import { companyToMerchant, campaignToOffer } from '@/lib/campaignMap';
import { PostMediaTile } from '@/components/PostMediaTile';
import { TabPageShell } from '@/components/TabPageShell';
import { VipSoonCard } from '@/components/VipSoonScreen';

export function MerchantProfileScreen({
  onExplore,
  onChanged,
  onVip,
}: {
  onExplore?: () => void;
  onChanged?: () => void;
  onVip?: () => void;
}) {
  const { profile, signOut } = useAuth();
  const [company, setCompany] = useState<Company | null>(null);
  const [application, setApplication] = useState<BusinessApplication | null>(null);
  const [campaigns, setCampaigns] = useState<Campaign[]>([]);
  const [redemptions, setRedemptions] = useState<UserRedemption[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [editing, setEditing] = useState(false);

  const refresh = useCallback(async (silent = false) => {
    bindMerchantSession(profile ?? null);
    if (!silent) setLoading(true);
    try {
      const [nextApplication, nextCompany] = await Promise.all([
        profile?.id ? loadBusinessForUser(profile.id, profile.email).catch(() => null) : Promise.resolve(null),
        fetchMerchantCompany(profile ?? null),
      ]);
      setApplication(nextApplication);
      setCompany(nextCompany);
      if (!nextCompany || nextApplication?.status === 'pending' || nextApplication?.status === 'rejected') {
        setCampaigns([]);
        setRedemptions([]);
        return;
      }
      setLoading(false);
      const nextCampaigns = await listMerchantCampaigns(nextCompany.id).catch(() => [] as Campaign[]);
      const nextRedemptions = await listMerchantRedemptions(nextCompany.id, nextCampaigns.map((item) => item.id)).catch(() => [] as UserRedemption[]);
      setCampaigns(nextCampaigns ?? []);
      setRedemptions(nextRedemptions ?? []);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Profil yüklenemedi');
      setCompany(null);
    } finally {
      setLoading(false);
    }
  }, [profile]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  useEffect(() => {
    try {
      return subscribeTables(['companies', 'campaigns', 'businesses', 'posts'], () => { void refresh(true); });
    } catch {
      return undefined;
    }
  }, [refresh]);

  if (loading) {
    return <BusinessPendingScreen loading onBack={onExplore ?? (() => undefined)} />;
  }

  const pending = !company || application?.status === 'pending' || application?.status === 'rejected';
  if (pending) {
    return (
      <BusinessPendingScreen
        onBack={onExplore ?? (() => undefined)}
        onSignOut={() => { void signOut().then(() => onExplore?.()); }}
        companyName={application?.company_name ?? company?.name}
      />
    );
  }

  return (
    <TabPageShell title="Profilim" subtitle="Vitrin, gönderi ve iletişim.">
      {error ? <p className="mb-3 rounded-2xl bg-red-50 px-3 py-2 text-xs text-red-600">{error}</p> : null}
      {notice ? <p className="mb-3 rounded-2xl bg-mint-50 px-3 py-2 text-xs text-mint-700">{notice}</p> : null}

      <div className="overflow-hidden rounded-3xl border border-mint-100 shadow-sm">
        <BusinessProfile
          merchant={companyToMerchant(company)}
          offers={campaigns
            .filter((item) => item.is_active && getMsRemaining(item.expiry_date) > 0)
            .map((item) => campaignToOffer({ ...item, companies: company }))}
          owner
          embedded
          onEdit={() => setEditing((value) => !value)}
        />
      </div>

      {editing ? (
        <div className="mt-3">
          <EditBusinessProfile
            company={company}
            busy={busy}
            onSubmit={async (draft) => {
              setBusy(true);
              setError(null);
              try {
                const saved = await updateMerchantProfileAction(draft);
                setCompany(saved);
                setNotice('Profil kaydedildi.');
                setEditing(false);
                await refresh(true);
                setCompany((current) => current ? { ...current, logo_url: saved.logo_url, cover_url: saved.cover_url } : saved);
                onChanged?.();
              } catch (err) {
                console.warn('Profil kaydedilemedi', err);
                setError(err instanceof Error ? err.message : 'Kaydedilemedi');
              } finally {
                setBusy(false);
              }
            }}
          />
        </div>
      ) : null}

      <div className="mt-3 space-y-3">
        {planLimits(planTierOf(company)).vip ? null : onVip ? (
          <button type="button" onClick={onVip} className="w-full text-left">
            <VipSoonCard compact audience="merchant" companyName={company.name} />
          </button>
        ) : (
          <VipSoonCard compact audience="merchant" companyName={company.name} />
        )}
        <MerchantPosts companyId={company.id} />

        <section className="space-y-2 rounded-3xl border border-mint-100 bg-white p-4">
          <p className="text-sm font-extrabold text-mint-800">Ziyaretler</p>
          <p className="text-xs text-gray-400">Firmana gelen ilgi: favoriler, kupon ve hikaye.</p>
          <div className="grid grid-cols-3 gap-2">
            <div className="rounded-2xl bg-mint-50 px-2 py-3 text-center">
              <Heart className="mx-auto h-4 w-4 text-mint-600" />
              <p className="mt-1 text-lg font-extrabold text-mint-800">{countFavoritesForCompany(company.id)}</p>
              <p className="text-[10px] font-bold text-mint-600">Favori</p>
            </div>
            <div className="rounded-2xl bg-mint-50 px-2 py-3 text-center">
              <Eye className="mx-auto h-4 w-4 text-mint-600" />
              <p className="mt-1 text-lg font-extrabold text-mint-800">{redemptions.length}</p>
              <p className="text-[10px] font-bold text-mint-600">Kupon</p>
            </div>
            <div className="rounded-2xl bg-mint-50 px-2 py-3 text-center">
              <ImagePlus className="mx-auto h-4 w-4 text-mint-600" />
              <p className="mt-1 text-lg font-extrabold text-mint-800">{storiesForCompany(company.id).length}</p>
              <p className="text-[10px] font-bold text-mint-600">Hikaye</p>
            </div>
          </div>
          <ul className="max-h-40 overflow-y-auto">
            {redemptions.length === 0 ? (
              <li className="py-2 text-xs text-gray-400">Henüz kupon kullanımı yok.</li>
            ) : redemptions.map((row) => (
              <li key={row.id} className="flex justify-between gap-2 border-t border-mint-50 py-1.5 text-[11px] text-gray-500">
                <span className="truncate">{campaigns.find((item) => item.id === row.campaign_id)?.title ?? 'Kampanya'}</span>
                <span>{new Date(row.redeemed_at).toLocaleString('tr-TR')}</span>
              </li>
            ))}
          </ul>
        </section>
      </div>
    </TabPageShell>
  );
}

export function MerchantPosts({ companyId }: { companyId: string }) {
  const posts = useCompanyPosts(companyId);
  const [caption, setCaption] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [dailyLimit, setDailyLimit] = useState(FREE_DAILY_POST_LIMIT);
  const limitHit = dailyPostLimitReached(companyId, posts, dailyLimit);
  useEffect(() => {
    let live = true;
    if (!isSupabaseConfigured || !companyId) return () => { live = false; };
    void supabase.from('companies').select('plan_tier, is_featured').eq('id', companyId).maybeSingle().then(({ data, error }) => {
      if (!live || error || !data) return;
      setDailyLimit(planLimits(planTierOf(data)).dailyPosts);
    });
    return () => { live = false; };
  }, [companyId]);

  return (
    <section className="space-y-2 rounded-3xl border border-mint-100 bg-white p-4">
      <p className="text-sm font-extrabold text-mint-800">Gönderiler</p>
      <p className="text-xs text-gray-400">
        {dailyLimit <= 1 ? 'Standart pakette' : 'Premium pakette'} günde {dailyLimit} paylaşım. Bugün {Math.min(postsTodayCount(companyId, posts), dailyLimit)}/{dailyLimit} kullanıldı.
      </p>
      <form
        className="space-y-2"
        onSubmit={async (event) => {
          event.preventDefault();
          const file = (event.currentTarget.elements.namedItem('post') as HTMLInputElement | null)?.files?.[0];
          if (!file) {
            setError('Bir görsel seçin.');
            return;
          }
          setBusy(true);
          setError(null);
          try {
            const fromUrl = new URLSearchParams(window.location.search).get('company')
              || new URLSearchParams(window.location.hash.replace(/^#/, '')).get('company')
              || '';
            const activeCompanyId = companyId || readActiveCompanyId() || fromUrl;
            const image_url = await uploadPostImage(activeCompanyId, file);
            await addCompanyPost({ company_id: activeCompanyId, image_url, caption });
            setCaption('');
            event.currentTarget.reset();
          } catch (err) {
            console.warn('Gönderi paylaşılamadı', err);
            setError(err instanceof Error && err.message ? err.message : 'Görsel yüklenemedi. Tekrar deneyin.');
          } finally {
            setBusy(false);
          }
        }}
      >
        <input name="post" type="file" accept="image/*" className="w-full text-xs" disabled={limitHit} />
        <input
          className="w-full rounded-2xl border-2 border-mint-100 bg-white px-4 py-3 text-sm text-mint-800 placeholder:text-gray-300 focus:border-mint-400 focus:outline-none"
          placeholder="Kısa yazı"
          value={caption}
          onChange={(e) => setCaption(e.target.value)}
          disabled={limitHit}
        />
        {error ? <p className="text-xs text-red-500">{error}</p> : null}
        {limitHit ? (
          <p className="text-xs font-semibold text-amber-700">
            Bugünkü 1 paylaşım hakkın doldu. Daha fazlası yalnızca VIP ile açılır.
          </p>
        ) : null}
        <button type="submit" disabled={busy || limitHit} className="btn-primary w-full py-2.5 text-sm disabled:opacity-50">
          {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : 'Gönderi paylaş'}
        </button>
      </form>
      <div className="grid grid-cols-3 gap-1.5">
        {posts.map((item) => (
          <PostMediaTile
            key={item.id}
            post={item}
            onDelete={() => { void deleteCompanyPost(item.id); }}
          />
        ))}
      </div>
    </section>
  );
}
