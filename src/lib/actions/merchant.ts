import { listAdminCampaigns, listAdminCompanies, updateCampaignAction, deleteCampaignAction } from '@/lib/actions/admin';
import { readAllLocalRedemptions, upsertLocalCampaign, upsertLocalCompany } from '@/lib/adminStore';
import { loadMyProfile, type AppProfile } from '@/lib/auth';
import { loadBusinessForUser } from '@/lib/businesses';
import type { Campaign, Company, UserRedemption } from '@/lib/campaigns';
import { campaignsCreatedToday, FREE_DAILY_CAMPAIGN_LIMIT } from '@/lib/campaigns';
import { requestPushDispatch } from '@/lib/companyPush';
import { isSupabaseConfigured, supabase } from '@/lib/supabase';
import { inspectCouponCode, approveCouponCode } from '@/lib/couponTickets';
import { ISTANBUL_CENTER } from '@/lib/mapTiles';

export type MerchantStats = {
  campaigns: number;
  active_campaigns: number;
  redemptions: number;
};

function emailMatchesCompany(company: Company, email: string) {
  const value = email.trim().toLowerCase();
  if (!value) return false;
  return (
    (company.owner_email ?? '').trim().toLowerCase() === value
    || (company.email ?? '').trim().toLowerCase() === value
  );
}

let merchantSession: AppProfile | null = null;

export function bindMerchantSession(profile: AppProfile | null) {
  merchantSession = profile?.role === 'merchant' || profile?.role === 'admin' ? profile : null;
}

export async function fetchMerchantCompany(session?: AppProfile | null): Promise<Company | null> {
  try {
    const profile = session ?? merchantSession ?? await loadMyProfile();
    if (profile && profile.role !== 'merchant' && profile.role !== 'admin') return null;

    if (profile) {
      const application = await loadBusinessForUser(profile.id, profile.email);
      if (application && application.status !== 'approved') return null;
    }

    const companies = await listAdminCompanies().catch(() => [] as Company[]);
    if (profile?.company_id) {
      const owned = companies.find((item) => item.id === profile.company_id);
      if (owned) return owned;
    }

    const email = (profile?.email ?? '').trim().toLowerCase();
    if (email) {
      const byEmail = companies.find((item) => emailMatchesCompany(item, email));
      if (byEmail) return byEmail;
    }

    if (profile?.role === 'merchant') {
      const local: Company = {
        id: profile.company_id || `merchant-${profile.id}`,
        name: [profile.first_name, profile.last_name].filter(Boolean).join(' ') || profile.email?.split('@')[0] || 'İşletmem',
        description: '',
        category: 'Yerel Esnaf',
        latitude: ISTANBUL_CENTER.lat,
        longitude: ISTANBUL_CENTER.lng,
        address: '',
        is_featured: false,
        phone: profile.phone || '',
        email: profile.email,
        owner_email: profile.email,
        logo_url: null,
        cover_url: null,
        created_at: profile.created_at ?? new Date().toISOString(),
      };
      upsertLocalCompany(local);
      return local;
    }

    return null;
  } catch {
    return null;
  }
}

export async function listMerchantCampaigns(companyId: string): Promise<Campaign[]> {
  const owned = await fetchMerchantCompany();
  if (!owned || owned.id !== companyId) return [];
  const all = await listAdminCampaigns();
  return all.filter((item) => item.company_id === companyId);
}

export async function listMerchantRedemptions(companyId: string): Promise<UserRedemption[]> {
  const campaigns = await listMerchantCampaigns(companyId);
  const ids = new Set(campaigns.map((item) => item.id));
  return readAllLocalRedemptions()
    .filter((row) => ids.has(row.campaign_id))
    .sort((a, b) => new Date(b.redeemed_at).getTime() - new Date(a.redeemed_at).getTime());
}

export async function merchantStats(companyId: string): Promise<MerchantStats> {
  const campaigns = await listMerchantCampaigns(companyId);
  const redemptions = await listMerchantRedemptions(companyId);
  const today = new Date().toISOString().slice(0, 10);
  return {
    campaigns: campaigns.length,
    active_campaigns: campaigns.filter((item) => item.is_active && item.expiry_date >= today).length,
    redemptions: redemptions.length,
  };
}

export async function createMerchantCampaignAction(input: {
  company_id: string;
  title: string;
  discount_rate: number;
  expiry_date: string;
  details: string;
  is_active?: boolean;
  image_url?: string | null;
  duration_type?: 'date' | 'countdown';
  duration_hours?: number | null;
  stock?: number | null;
}): Promise<Campaign> {
  const owned = await fetchMerchantCompany();
  if (!owned || owned.id !== input.company_id) {
    throw new Error('Yalnızca kendi firmanız için kampanya ekleyebilirsiniz.');
  }

  const existing = await listMerchantCampaigns(owned.id);
  let todayCount = campaignsCreatedToday(existing, owned.id);
  if (isSupabaseConfigured) {
    const start = new Date();
    start.setHours(0, 0, 0, 0);
    const { count, error } = await supabase
      .from('campaigns')
      .select('id', { count: 'exact', head: true })
      .eq('company_id', owned.id)
      .gte('created_at', start.toISOString());
    if (!error && typeof count === 'number') todayCount = count;
  }
  if (todayCount >= FREE_DAILY_CAMPAIGN_LIMIT) {
    throw new Error('VIP olmadan günde yalnızca 1 kampanya eklenebilir. Hakkın doldu.');
  }

  const row: Campaign = {
    id: crypto.randomUUID(),
    company_id: owned.id,
    title: input.title.trim(),
    discount_rate: input.discount_rate,
    expiry_date: input.expiry_date,
    details: input.details.trim(),
    is_active: input.is_active ?? true,
    created_at: new Date().toISOString(),
    image_url: input.image_url ?? null,
    duration_type: input.duration_type ?? 'date',
    duration_hours: input.duration_hours ?? null,
    stock: Math.max(0, Math.floor(Number(input.stock ?? 1))),
  };
  upsertLocalCampaign(row);
  return row;
}

export async function updateMerchantCampaignAction(input: {
  id: string;
  title: string;
  discount_rate: number;
  expiry_date: string;
  details: string;
  is_active?: boolean;
  image_url?: string | null;
  duration_type?: 'date' | 'countdown';
  duration_hours?: number | null;
  stock?: number | null;
}): Promise<Campaign> {
  const owned = await fetchMerchantCompany();
  if (!owned) throw new Error('Firma hesabı bulunamadı.');
  const current = (await listMerchantCampaigns(owned.id)).find((item) => item.id === input.id);
  if (!current) throw new Error('Bu kampanya size ait değil.');
  return updateCampaignAction({ ...input, company_id: owned.id, is_active: input.is_active ?? current.is_active });
}

export async function deleteMerchantCampaignAction(campaignId: string): Promise<void> {
  const owned = await fetchMerchantCompany();
  if (!owned) throw new Error('Firma hesabı bulunamadı.');
  const current = (await listMerchantCampaigns(owned.id)).find((item) => item.id === campaignId);
  if (!current) throw new Error('Bu kampanya size ait değil.');
  await deleteCampaignAction(campaignId);
}

export async function setMerchantCampaignActive(campaignId: string, isActive: boolean): Promise<Campaign> {
  const owned = await fetchMerchantCompany();
  if (!owned) throw new Error('Firma hesabı bulunamadı.');
  const campaigns = await listMerchantCampaigns(owned.id);
  const current = campaigns.find((item) => item.id === campaignId);
  if (!current) throw new Error('Bu kampanya size ait değil.');

  const next = { ...current, is_active: isActive };
  if (isSupabaseConfigured && !campaignId.startsWith('demo-')) {
    await supabase.from('campaigns').update({ is_active: isActive }).eq('id', campaignId).eq('company_id', owned.id);
    if (isActive) void requestPushDispatch();
  }
  upsertLocalCampaign(next);
  return next;
}

export async function approveMerchantCouponCode(code: string) {
  const owned = await fetchMerchantCompany();
  if (!owned) throw new Error('Firma hesabı bulunamadı.');
  const campaigns = await listMerchantCampaigns(owned.id);
  const inspect = await inspectCouponCode(code, {
    companies: [owned],
    campaigns,
    users: [],
    redemptions: [],
  });
  if (!inspect.found) throw new Error(inspect.issues[0] || 'Bu koda ait kupon bulunamadı.');
  if (inspect.campaignId && !campaigns.some((item) => item.id === inspect.campaignId)) {
    throw new Error('Bu kupon bu firmaya ait değil.');
  }
  if (inspect.companyId && inspect.companyId !== owned.id) {
    throw new Error('Bu kupon bu firmaya ait değil.');
  }
  return approveCouponCode(code, owned.id);
}

export async function updateMerchantProfileAction(input: {
  name?: string;
  category: string;
  address: string;
  phone: string;
  description: string;
  latitude?: number;
  longitude?: number;
  email?: string;
  logo_url?: string | null;
  cover_url?: string | null;
  whatsapp?: string;
}): Promise<Company> {
  const owned = await fetchMerchantCompany();
  if (!owned) throw new Error('Firma hesabı bulunamadı.');
  const next: Company = {
    ...owned,
    name: input.name?.trim() || owned.name,
    category: input.category.trim() || owned.category,
    address: input.address.trim() || owned.address,
    phone: input.phone.trim(),
    whatsapp: input.whatsapp === undefined ? owned.whatsapp : input.whatsapp.trim(),
    description: input.description.trim(),
    email: input.email?.trim().toLowerCase() || owned.email,
    latitude: Number.isFinite(input.latitude) ? input.latitude! : owned.latitude,
    longitude: Number.isFinite(input.longitude) ? input.longitude! : owned.longitude,
    logo_url: input.logo_url === undefined ? owned.logo_url : input.logo_url,
    cover_url: input.cover_url === undefined ? owned.cover_url : input.cover_url,
  };
  if (isSupabaseConfigured && !owned.id.startsWith('demo-') && !owned.id.startsWith('merchant-')) {
    try {
      await supabase.from('companies').update({
        name: next.name,
        category: next.category,
        address: next.address,
        phone: next.phone,
        description: next.description,
        email: next.email,
        latitude: next.latitude,
        longitude: next.longitude,
        logo_url: next.logo_url,
        cover_url: next.cover_url,
        whatsapp: next.whatsapp ?? '',
      }).eq('id', owned.id);
    } catch {
      // local profile still updates if remote schema lags
    }
  }
  upsertLocalCompany(next);
  return next;
}
