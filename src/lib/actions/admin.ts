import { provisionLoginAccount } from '@/lib/provisionAuth';
import {
  mergeById,
  readLocalCampaigns,
  readLocalCompanies,
  removeLocalCompany,
  removeLocalCampaign,
  secretMap,
  upsertLocalCampaign,
  upsertLocalCompany,
} from '@/lib/adminStore';
import type { Campaign, CampaignWithCompany, Company } from '@/lib/campaigns';
import { loadMyProfile } from '@/lib/auth';
import { pinCoords } from '@/lib/businesses';
import { hasValidCoords } from '@/lib/geo';
import { requestPushDispatch } from '@/lib/companyPush';
import { pilotColumns, refreshSubscriptionSettings } from '@/lib/subscription';
import { publishCampaignImage } from '@/lib/campaignImages';
import { fetchCompanyList } from '@/lib/companyQuery';
import { isSupabaseConfigured, supabase } from '@/lib/supabase';
import { asUuid } from '@/lib/uuid';

export class MissingCompanyError extends Error {}

function missingCompany(companyId: string) {
  removeLocalCompany(companyId);
  return new MissingCompanyError('Bu firma veritabanında bulunamadı; eski kayıt temizlendi.');
}

function isMissingCompany(error: { code?: string; message?: string }) {
  return error.code === 'P0002'
    || (error.code === '23503' && /story_permissions/i.test(error.message ?? ''));
}

export type CompanyInput = {
  name: string;
  description: string;
  category: string;
  latitude: number;
  longitude: number;
  address: string;
  is_featured?: boolean;
  phone?: string;
  email?: string;
  password?: string;
  is_pilot_firm?: boolean;
};

export type CampaignInput = {
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
};

function localCompany(input: CompanyInput, existing?: Company): Company {
  return {
    id: existing?.id ?? crypto.randomUUID(),
    name: input.name.trim(),
    description: input.description.trim(),
    category: input.category.trim(),
    latitude: input.latitude,
    longitude: input.longitude,
    address: input.address.trim(),
    is_featured: Boolean(input.is_featured),
    phone: input.phone?.trim() || '',
    email: input.email?.trim().toLowerCase() || '',
    owner_email: existing?.owner_email ?? input.email?.trim().toLowerCase() ?? null,
    login_password: input.password ?? existing?.login_password ?? null,
    created_at: existing?.created_at ?? new Date().toISOString(),
    ...(input.is_pilot_firm ? pilotColumns(true) : {}),
  };
}

function companyFromApprovedBusiness(row: Record<string, unknown>, linked?: Company | null): Company {
  const district = String(row.district ?? '');
  const sector = String(row.sector ?? '');
  const pin = pinCoords(
    Number(row.latitude) || linked?.latitude,
    Number(row.longitude) || linked?.longitude,
    district,
  );
  const linkedLat = Number(linked?.latitude);
  const linkedLng = Number(linked?.longitude);
  const linkedValid = hasValidCoords({ latitude: linkedLat, longitude: linkedLng });
  const rowValid = hasValidCoords({ latitude: Number(row.latitude), longitude: Number(row.longitude) });
  return {
    id: String(linked?.id || row.company_id || row.id || ''),
    name: String(linked?.name || row.company_name || ''),
    description: String(linked?.description || [district, sector].filter(Boolean).join(' / ')),
    category: String(linked?.category || sector),
    latitude: linkedValid ? linkedLat : rowValid ? Number(row.latitude) : pin.latitude,
    longitude: linkedValid ? linkedLng : rowValid ? Number(row.longitude) : pin.longitude,
    address: String(linked?.address || row.address || ''),
    is_featured: Boolean(linked?.is_featured),
    is_verified: Boolean(linked?.is_verified ?? row.is_verified),
    plan_tier: linked?.plan_tier === 'premium' || row.plan_tier === 'premium' ? 'premium' : 'standard',
    tax_number: String(linked?.tax_number || row.tax_number || ''),
    push_quota_override: linked?.push_quota_override ?? null,
    phone: linked?.phone ?? String(row.phone ?? ''),
    email: linked?.email ?? String(row.email ?? ''),
    owner_email: linked?.owner_email ?? String(row.email ?? ''),
    login_password: linked?.login_password ?? null,
    logo_url: linked?.logo_url ?? null,
    cover_url: linked?.cover_url ?? null,
    whatsapp: linked?.whatsapp ?? null,
    created_at: String(linked?.created_at || row.created_at || new Date().toISOString()),
  };
}

async function loadApprovedBusinessRows(): Promise<Record<string, unknown>[]> {
  const rpc = await supabase.rpc('admin_list_businesses');
  if (!rpc.error && rpc.data) {
    return ((rpc.data as Record<string, unknown>[]) ?? []).filter((item) => String(item.status) === 'approved');
  }
  const table = await supabase
    .from('businesses')
    .select('id,user_id,email,owner_name,phone,company_name,sector,district,address,tax_office,tax_number,latitude,longitude,status,company_id,created_at')
    .eq('status', 'approved')
    .order('created_at', { ascending: false });
  if (table.error) return [];
  return (table.data as Record<string, unknown>[]) ?? [];
}

export async function listApprovedCompanies(): Promise<Company[]> {
  if (!isSupabaseConfigured) return [];
  const [approved, companiesRes] = await Promise.all([
    loadApprovedBusinessRows(),
    fetchCompanyList().then((rows) => ({ data: rows, error: null })).catch((error: unknown) => ({
      data: [] as Company[],
      error: error instanceof Error ? error : new Error('Firma listesi alınamadı'),
    })),
  ]);
  const companyById = new Map<string, Company>();
  const companyByEmail = new Map<string, Company>();
  if (!companiesRes.error) {
    for (const item of ((companiesRes.data as Company[]) ?? [])) {
      if (!item?.id || String(item.id).startsWith('demo-')) continue;
      companyById.set(item.id, item);
      const email = String(item.email || item.owner_email || '').trim().toLowerCase();
      if (email) companyByEmail.set(email, item);
    }
  }
  return approved
    .map((row) => {
      const companyId = String(row.company_id ?? '');
      const email = String(row.email ?? '').trim().toLowerCase();
      const linked = (companyId && companyById.get(companyId)) || (email && companyByEmail.get(email)) || null;
      return companyFromApprovedBusiness(row, linked);
    })
    .filter((row) => row.id && row.name && !String(row.id).startsWith('demo-'));
}

export async function listAdminCompanies(): Promise<Company[]> {
  const remote = await listApprovedCompanies();
  const passwords = secretMap();
  return mergeById(remote, readLocalCompanies())
    .filter((row) => row && typeof row === 'object' && row.id)
    .map((row) => {
      const email = String(row?.email || row?.owner_email || '').trim().toLowerCase();
      return {
        ...row,
        name: row?.name ?? '',
        description: row?.description ?? '',
        category: row?.category ?? '',
        address: row?.address ?? '',
        latitude: Number.isFinite(Number(row?.latitude)) ? Number(row.latitude) : 0,
        longitude: Number.isFinite(Number(row?.longitude)) ? Number(row.longitude) : 0,
        login_password: row?.login_password || passwords[email] || null,
      };
    })
    .sort((a, b) => Number(b?.is_featured) - Number(a?.is_featured));
}

export async function listAdminCampaigns(): Promise<Campaign[]> {
  let remote: Campaign[] = [];
  if (isSupabaseConfigured) {
    const { data, error } = await supabase
      .from('campaigns')
      .select('*')
      .order('created_at', { ascending: false });
    if (!error) remote = ((data as Campaign[]) ?? []).map((row) => ({ ...row, details: row.details ?? '' }));
  }
  return mergeById(remote, readLocalCampaigns());
}

export async function createCompanyAction(input: CompanyInput): Promise<Company> {
  const phone = input.phone?.trim() || '';
  const email = input.email?.trim().toLowerCase() || '';

  if (isSupabaseConfigured) {
    const withContact = await supabase.rpc('admin_create_company', {
      p_name: input.name,
      p_description: input.description,
      p_category: input.category,
      p_latitude: input.latitude,
      p_longitude: input.longitude,
      p_address: input.address,
      p_is_featured: Boolean(input.is_featured),
      p_phone: phone,
      p_email: email,
    });

    let row = !withContact.error ? (withContact.data as Company | null) : null;

    if (!row) {
      const basic = await supabase.rpc('admin_create_company', {
        p_name: input.name,
        p_description: input.description,
        p_category: input.category,
        p_latitude: input.latitude,
        p_longitude: input.longitude,
        p_address: input.address,
        p_is_featured: Boolean(input.is_featured),
      });
      row = !basic.error ? (basic.data as Company | null) : null;
      if (row?.id) {
        await supabase.from('companies').update({ phone, email }).eq('id', row.id);
      }
    }

    if (row) {
      if (input.is_pilot_firm && row.id) {
        const flagged = await supabase.from('companies').update(pilotColumns(true)).eq('id', row.id).select('*').maybeSingle();
        if (flagged.error) {
          throw new Error('Firma eklendi fakat pilot bayrağı yazılamadı. SQL Editor’da 20260927150000_pilot_sixty_paywall.sql dosyasını çalıştırın.');
        }
        if (flagged.data) row = flagged.data as Company;
      } else if (row.id) {
        const settings = await refreshSubscriptionSettings();
        if (settings.is_subscription_active) {
          const enrolled = await supabase.from('companies').update({
            is_pilot_firm: false,
            subscription_enrolled: true,
            paid_started_at: null,
            subscription_started_at: null,
            intro_price: settings.intro_price,
            intro_duration_months: settings.intro_duration_months,
            standard_price: settings.standard_price,
          }).eq('id', row.id).select('*').maybeSingle();
          if (enrolled.error) {
            throw new Error('Firma eklendi fakat abonelik kaydı yazılamadı. SQL Editor’da 20260927150000_pilot_sixty_paywall.sql dosyasını çalıştırın.');
          }
          if (enrolled.data) row = enrolled.data as Company;
        }
      }
      const saved = {
        ...row,
        phone: row.phone ?? phone,
        email: row.email ?? email,
        login_password: input.password || null,
        ...(input.is_pilot_firm ? pilotColumns(true) : {}),
      };
      upsertLocalCompany(saved);
      if (input.password) {
        const account = await provisionLoginAccount({
          email,
          password: input.password,
          role: 'merchant',
          phone,
          fullName: input.name,
          companyId: saved.id,
        });
        if (!account.ok) {
          throw new Error(account.message ?? 'Firma kaydı oluştu fakat giriş hesabı açılamadı.');
        }
      }
      return saved;
    }
  }

  const local = localCompany(input);
  upsertLocalCompany(local);
  if (input.password && email) {
    await provisionLoginAccount({
      email,
      password: input.password,
      role: 'merchant',
      phone,
      fullName: input.name,
      companyId: local.id,
    });
  }
  return local;
}

async function matchingBusinessIds(companyId: string) {
  const { data, error } = await supabase
    .from('businesses')
    .select('id,company_id')
    .or(`company_id.eq.${companyId},id.eq.${companyId}`);
  if (error) throw new Error(error.message);
  return (data ?? []).map((row) => String(row.id)).filter(Boolean);
}

export async function blockCompanyAccessAction(companyId: string): Promise<void> {
  if (!companyId) throw new Error('Firma bulunamadı.');
  if (isSupabaseConfigured && !companyId.startsWith('demo-')) {
    const ids = await matchingBusinessIds(companyId);
    if (ids.length > 0) {
      const updated = await supabase.from('businesses').update({ status: 'rejected' }).in('id', ids).select('id');
      if (updated.error) throw new Error(updated.error.message);
      if (!updated.data?.length) throw new Error('Erişim kapatılamadı.');
    }
    await supabase.from('campaigns').update({ is_active: false }).eq('company_id', companyId);
  }
  removeLocalCompany(companyId);
  for (const campaign of readLocalCampaigns()) {
    if (campaign.company_id === companyId) removeLocalCampaign(campaign.id);
  }
}

function dbErrorText(error: { message?: string; details?: string; hint?: string } | null, fallback: string) {
  const text = [error?.message, error?.details, error?.hint].map((item) => item?.trim()).filter(Boolean).join(' — ');
  return text || fallback;
}

export async function deleteCompanyAction(companyId: string): Promise<void> {
  if (!companyId) throw new Error('Firma bulunamadı.');
  const id = asUuid(companyId);
  if (isSupabaseConfigured && id) {
    const deleted = await supabase.rpc('admin_delete_company', { p_company_id: id });
    const alreadyGone = deleted.error?.code === 'P0002';
    if (!alreadyGone && (deleted.error || deleted.data !== true)) {
      const reason = dbErrorText(deleted.error, 'Firma silinemedi.');
      console.warn('Firma silinemedi', companyId, reason, deleted.error);
      throw new Error(reason);
    }
    const ids = alreadyGone ? [] : await matchingBusinessIds(id).catch(() => [] as string[]);
    if (ids.length) {
      const removed = await supabase.from('businesses').delete().in('id', ids).select('id');
      if (removed.error) {
        console.warn('Firma başvurusu silinemedi', companyId, removed.error.message);
      }
    }
  }
  removeLocalCompany(companyId);
  for (const campaign of readLocalCampaigns()) {
    if (campaign.company_id === companyId) removeLocalCampaign(campaign.id);
  }
}

export async function setCompanyFeaturedAction(companyId: string, isFeatured: boolean): Promise<Company> {
  const current = (await listAdminCompanies()).find((item) => item.id === companyId);
  if (isSupabaseConfigured && !companyId.startsWith('demo-')) {
    const { data, error } = await supabase.rpc('admin_set_company_featured', {
      p_company_id: companyId,
      p_is_featured: isFeatured,
    });
    if (!error && data) {
      const row = data as Company;
      upsertLocalCompany(row);
      return row;
    }
  }
  if (!current) throw new Error('Firma bulunamadı.');
  const next = { ...current, is_featured: isFeatured };
  upsertLocalCompany(next);
  return next;
}

function campaignWriteRow(input: CampaignInput, imageUrl: string | null) {
  const rate = Number(input.discount_rate);
  return {
    company_id: input.company_id,
    title: input.title.trim(),
    discount_rate: rate > 0 ? rate : 0.01,
    expiry_date: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString().slice(0, 10),
    details: input.details.trim(),
    is_active: input.is_active ?? true,
    image_url: imageUrl,
    duration_type: 'countdown' as const,
    duration_hours: 24,
    stock: Math.max(0, Math.floor(Number(input.stock ?? 1))),
  };
}

export async function createCampaignAction(input: CampaignInput): Promise<Campaign> {
  await assertCampaignStaff();
  const imageUrl = await publishCampaignImage(input.company_id, input.image_url ?? null);
  const payload = campaignWriteRow(input, imageUrl);
  if (isSupabaseConfigured && !input.company_id.startsWith('demo-')) {
    const inserted = await supabase.from('campaigns').insert(payload).select('*').single();
    if (!inserted.error && inserted.data) {
      const row = { ...(inserted.data as Campaign), ...payload, details: payload.details };
      upsertLocalCampaign(row);
      if (row.is_active) void requestPushDispatch();
      return row;
    }
    console.warn('Kampanya doğrudan yazılamadı', inserted.error);
    const { data, error } = await supabase.rpc('admin_create_campaign', {
      p_company_id: input.company_id,
      p_title: payload.title,
      p_discount_rate: payload.discount_rate,
      p_expiry_date: payload.expiry_date,
      p_details: payload.details,
      p_is_active: payload.is_active,
    });
    if (!error && data) {
      const id = (data as Campaign).id;
      const patched = await supabase.from('campaigns').update({
        image_url: payload.image_url,
        details: payload.details,
        stock: payload.stock,
        duration_type: payload.duration_type,
        duration_hours: payload.duration_hours,
      }).eq('id', id).select('*').maybeSingle();
      const row = {
        ...(data as Campaign),
        ...(patched.data ?? {}),
        ...payload,
        id,
      };
      upsertLocalCampaign(row);
      if (row.is_active) void requestPushDispatch();
      return row;
    }
    throw new Error(inserted.error?.message || error?.message || 'Kampanya kaydedilemedi.');
  }

  const row: Campaign = {
    id: crypto.randomUUID(),
    company_id: input.company_id,
    title: input.title.trim(),
    discount_rate: input.discount_rate,
    expiry_date: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString().slice(0, 10),
    details: input.details.trim(),
    is_active: input.is_active ?? true,
    created_at: new Date().toISOString(),
    image_url: imageUrl,
    duration_type: 'countdown',
    duration_hours: 24,
    stock: Math.max(0, Math.floor(Number(input.stock ?? 1))),
  };
  upsertLocalCampaign(row);
  return row;
}

export async function updateCampaignAction(input: CampaignInput & { id: string }): Promise<Campaign> {
  const current = (await listAdminCampaigns()).find((item) => item.id === input.id);
  if (!current) throw new Error('Kampanya bulunamadı.');
  const imageUrl = input.image_url === undefined
    ? current.image_url ?? null
    : await publishCampaignImage(input.company_id || current.company_id, input.image_url);
  const next: Campaign = {
    ...current,
    title: input.title.trim(),
    discount_rate: input.discount_rate,
    expiry_date: new Date(new Date(current.created_at).getTime() + 24 * 60 * 60 * 1000).toISOString().slice(0, 10),
    details: input.details.trim(),
    is_active: input.is_active ?? current.is_active,
    image_url: imageUrl,
    duration_type: 'countdown',
    duration_hours: 24,
    stock: input.stock === undefined ? current.stock : Math.max(0, Math.floor(Number(input.stock))),
  };
  if (isSupabaseConfigured && !input.id.startsWith('demo-')) {
    const saved = await supabase.from('campaigns').update({
      title: next.title,
      discount_rate: Number(next.discount_rate) > 0 ? next.discount_rate : 0.01,
      expiry_date: next.expiry_date,
      details: next.details,
      is_active: next.is_active,
      image_url: next.image_url ?? null,
      duration_type: 'countdown',
      duration_hours: 24,
      stock: Math.max(0, Math.floor(Number(next.stock ?? 1))),
    }).eq('id', input.id);
    if (saved.error) throw new Error(saved.error.message || 'Kampanya güncellenemedi.');
    if (next.is_active && !current.is_active) void requestPushDispatch();
  }
  upsertLocalCampaign(next);
  return next;
}

export async function updateCompanyProfileAction(
  companyId: string,
  input: {
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
  },
): Promise<Company> {
  const current = (await listAdminCompanies()).find((item) => item.id === companyId);
  if (!current) throw new Error('Firma bulunamadı.');
  const next: Company = {
    ...current,
    name: input.name?.trim() || current.name,
    category: input.category.trim() || current.category,
    address: input.address.trim() || current.address,
    phone: input.phone.trim(),
    whatsapp: input.whatsapp === undefined ? current.whatsapp : input.whatsapp.trim(),
    description: input.description.trim(),
    email: input.email?.trim().toLowerCase() || current.email,
    latitude: Number.isFinite(input.latitude) ? input.latitude! : current.latitude,
    longitude: Number.isFinite(input.longitude) ? input.longitude! : current.longitude,
    logo_url: input.logo_url === undefined ? current.logo_url : input.logo_url,
    cover_url: input.cover_url === undefined ? current.cover_url : input.cover_url,
  };
  if (isSupabaseConfigured && !companyId.startsWith('demo-') && !companyId.startsWith('merchant-')) {
    const saved = await supabase.from('companies').update({
        name: next.name,
        category: next.category,
        address: next.address,
        phone: next.phone,
        whatsapp: next.whatsapp ?? '',
        description: next.description,
        email: next.email,
        latitude: next.latitude,
        longitude: next.longitude,
        logo_url: next.logo_url,
        cover_url: next.cover_url,
      }).eq('id', companyId).select('id,logo_url,cover_url').maybeSingle();
      if (saved.error) {
        console.warn('Firma profili güncellenemedi', saved.error);
        throw new Error(saved.error.message || 'Profil kaydedilemedi.');
      }
  }
  upsertLocalCompany(next);
  return next;
}

async function assertCampaignStaff() {
  const profile = await loadMyProfile();
  if (profile?.role !== 'admin' && profile?.role !== 'merchant') {
    throw new Error('Kampanya ekleme ve silme yalnız yönetici veya firma yetkilisine açıktır.');
  }
  return profile;
}

export async function setCampaignActiveAction(campaignId: string, isActive: boolean): Promise<Campaign> {
  await assertCampaignStaff();
  const current = (await listAdminCampaigns()).find((item) => item.id === campaignId);
  if (!current) throw new Error('Kampanya bulunamadı.');
  const next = { ...current, is_active: isActive };
  if (isSupabaseConfigured && !campaignId.startsWith('demo-')) {
    const saved = await supabase.from('campaigns').update({ is_active: isActive }).eq('id', campaignId);
    if (saved.error) throw new Error(saved.error.message || 'Kampanya durumu güncellenemedi.');
    if (isActive) void requestPushDispatch();
  }
  upsertLocalCampaign(next);
  return next;
}

export async function decrementCampaignStockAction(campaignId: string): Promise<void> {
  const current = (await listAdminCampaigns()).find((item) => item.id === campaignId);
  if (!current) return;
  const remaining = Math.max(0, Number(current.stock ?? 1) - 1);
  upsertLocalCampaign({ ...current, stock: remaining });
}

export async function deleteCampaignAction(campaignId: string): Promise<void> {
  const profile = await assertCampaignStaff();
  if (isSupabaseConfigured && !campaignId.startsWith('demo-')) {
    const adminRpc = await supabase.rpc('admin_delete_campaign', { p_id: campaignId });
    if (adminRpc.error) {
      const merchantRpc = await supabase.rpc('merchant_delete_campaign', { p_id: campaignId });
      if (merchantRpc.error) {
        if (profile?.role !== 'admin') {
          throw new Error(merchantRpc.error.message || 'Bu kampanyayı silme yetkin yok.');
        }
        const table = await supabase.from('campaigns').delete().eq('id', campaignId);
        if (table.error) {
          throw new Error(table.error.message || merchantRpc.error.message || adminRpc.error.message);
        }
      }
    }
  }
  removeLocalCampaign(campaignId);
}

export function attachCompanies(campaigns: Campaign[], companies: Company[]): CampaignWithCompany[] {
  const map = new Map(companies.map((item) => [item.id, item]));
  return campaigns
    .map((campaign) => {
      const company = map.get(campaign.company_id);
      if (!company) return null;
      return { ...campaign, details: campaign.details ?? '', companies: company };
    })
    .filter((item): item is CampaignWithCompany => Boolean(item));
}

export async function setCompanyTermAction(companyId: string, endsAt: string | null): Promise<void> {
  if (!companyId) throw new Error('Firma bulunamadı.');
  if (!isSupabaseConfigured) return;
  const saved = await supabase.rpc('admin_set_company_term', { p_company: companyId, p_ends_at: endsAt });
  if (!saved.error) return;
  const raw = saved.error.message.toLowerCase();
  if (!(raw.includes('admin_set_company_term') || raw.includes('schema cache'))) {
    throw new Error(saved.error.message);
  }
  const fallback = await supabase.from('companies').update({ subscription_ends_at: endsAt }).eq('id', companyId);
  if (fallback.error && !/subscription_ends_at|schema cache|column/i.test(fallback.error.message)) {
    throw new Error(fallback.error.message);
  }
}

export async function setMemberVipAction(profileId: string, vip: boolean): Promise<void> {
  if (!profileId) throw new Error('Üye bulunamadı.');
  if (!isSupabaseConfigured) return;
  const id = asUuid(profileId);
  if (!id) throw new Error('Üye veritabanında bulunamadı.');
  const saved = await supabase.rpc('admin_set_member_vip', { p_profile: id, p_vip: vip });
  if (!saved.error) return;
  const raw = saved.error.message.toLowerCase();
  if (!(raw.includes('admin_set_member_vip') || raw.includes('schema cache'))) {
    throw new Error(saved.error.message);
  }
  const fallback = await supabase.from('profiles').update({ vip }).eq('id', id);
  if (fallback.error) throw new Error(fallback.error.message || 'Üye VIP güncellenemedi.');
}

export async function setCompanyPlanAction(companyId: string, tier: 'standard' | 'premium'): Promise<void> {
  if (!companyId) throw new Error('Firma bulunamadı.');
  if (!isSupabaseConfigured) return;
  const id = asUuid(companyId);
  if (!id) throw missingCompany(companyId);
  const saved = await supabase.rpc('admin_set_company_plan', { p_company: id, p_tier: tier });
  if (!saved.error) return;
  if (isMissingCompany(saved.error)) throw missingCompany(companyId);
  const raw = saved.error.message.toLowerCase();
  if (!(raw.includes('admin_set_company_plan') || raw.includes('schema cache'))) {
    throw new Error(saved.error.message);
  }
  const fallback = await supabase.from('companies').update({ plan_tier: tier }).eq('id', id).select('id');
  if (fallback.error && !/plan_tier|schema cache|column/i.test(fallback.error.message)) {
    throw new Error(fallback.error.message);
  }
  if (!fallback.error && !fallback.data?.length) throw missingCompany(companyId);
  await supabase.from('story_permissions').upsert({
    company_id: id,
    allowed: tier === 'premium',
    updated_at: new Date().toISOString(),
  });
}

export async function setCompanyPushQuotaAction(companyId: string, quota: number | null): Promise<void> {
  if (!companyId) throw new Error('Firma bulunamadı.');
  if (!isSupabaseConfigured) return;
  const saved = await supabase.rpc('admin_set_push_quota', { p_company: companyId, p_quota: quota });
  if (!saved.error) return;
  const raw = saved.error.message.toLowerCase();
  if (!(raw.includes('admin_set_push_quota') || raw.includes('schema cache'))) {
    throw new Error(saved.error.message);
  }
  const fallback = await supabase.from('companies').update({ push_quota_override: quota }).eq('id', companyId);
  if (fallback.error && !/push_quota_override|schema cache|column/i.test(fallback.error.message)) {
    throw new Error(fallback.error.message);
  }
}

export async function setCompanyVerifiedAction(companyId: string, verified: boolean): Promise<void> {
  if (!companyId) throw new Error('Firma bulunamadı.');
  if (!isSupabaseConfigured) return;
  const saved = await supabase.rpc('admin_set_company_verified', {
    p_company: companyId,
    p_verified: verified,
  });
  if (saved.error) {
    const raw = saved.error.message.toLowerCase();
    if (raw.includes('admin_set_company_verified') || raw.includes('schema cache')) {
      throw new Error('Onay alanı yok. 20260928180000_plans_verified_nearby_push.sql dosyasını çalıştırın.');
    }
    throw new Error(saved.error.message);
  }
}
