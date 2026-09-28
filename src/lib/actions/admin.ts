import { loadRemoteSecrets, provisionLoginAccount } from '@/lib/provisionAuth';
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
import { pinCoords } from '@/lib/businesses';
import { hasValidCoords } from '@/lib/geo';
import { requestPushDispatch } from '@/lib/companyPush';
import { isSupabaseConfigured, supabase } from '@/lib/supabase';

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

export async function listAdminCompanies(): Promise<Company[]> {
  let remote: Company[] = [];
  if (isSupabaseConfigured) {
    const [approved, companiesRes] = await Promise.all([
      loadApprovedBusinessRows(),
      supabase.from('companies').select('*'),
    ]);
    const companyById = new Map<string, Company>();
    const companyByEmail = new Map<string, Company>();
    if (!companiesRes.error) {
      for (const item of ((companiesRes.data as Company[]) ?? [])) {
        if (!item?.id) continue;
        companyById.set(item.id, item);
        const email = String(item.email || item.owner_email || '').trim().toLowerCase();
        if (email) companyByEmail.set(email, item);
      }
    }
    remote = approved
      .map((row) => {
        const companyId = String(row.company_id ?? '');
        const email = String(row.email ?? '').trim().toLowerCase();
        const linked = (companyId && companyById.get(companyId)) || (email && companyByEmail.get(email)) || null;
        return companyFromApprovedBusiness(row, linked);
      })
      .filter((row) => row.id && row.name);
  }
  const passwords = { ...secretMap(), ...(await loadRemoteSecrets()) };
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
      const saved = {
        ...row,
        phone: row.phone ?? phone,
        email: row.email ?? email,
        login_password: input.password || null,
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

export async function deleteCompanyAction(companyId: string): Promise<void> {
  if (isSupabaseConfigured && !companyId.startsWith('demo-')) {
    await supabase.rpc('admin_delete_company', {
      p_company_id: companyId,
    });
  }
  removeLocalCompany(companyId);
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

export async function createCampaignAction(input: CampaignInput): Promise<Campaign> {
  if (isSupabaseConfigured && !input.company_id.startsWith('demo-')) {
    const { data, error } = await supabase.rpc('admin_create_campaign', {
      p_company_id: input.company_id,
      p_title: input.title,
      p_discount_rate: input.discount_rate > 0 ? input.discount_rate : 0.01,
      p_expiry_date: input.expiry_date,
      p_details: input.details,
      p_is_active: input.is_active ?? true,
    });
    if (!error && data) {
      const row = {
        ...(data as Campaign),
        discount_rate: input.discount_rate,
        details: (data as Campaign).details ?? input.details,
        image_url: input.image_url ?? (data as Campaign).image_url,
        duration_type: input.duration_type ?? 'date',
        duration_hours: input.duration_hours ?? null,
        stock: input.stock ?? (data as Campaign).stock ?? 1,
      };
      upsertLocalCampaign(row);
      if (row.is_active) void requestPushDispatch();
      return row;
    }
  }

  const row: Campaign = {
    id: crypto.randomUUID(),
    company_id: input.company_id,
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

export async function updateCampaignAction(input: CampaignInput & { id: string }): Promise<Campaign> {
  const current = (await listAdminCampaigns()).find((item) => item.id === input.id);
  if (!current) throw new Error('Kampanya bulunamadı.');
  const next: Campaign = {
    ...current,
    title: input.title.trim(),
    discount_rate: input.discount_rate,
    expiry_date: input.expiry_date,
    details: input.details.trim(),
    is_active: input.is_active ?? current.is_active,
    image_url: input.image_url === undefined ? current.image_url : input.image_url,
    duration_type: input.duration_type ?? current.duration_type,
    duration_hours: input.duration_hours ?? current.duration_hours,
    stock: input.stock === undefined ? current.stock : Math.max(0, Math.floor(Number(input.stock))),
  };
  if (isSupabaseConfigured && !input.id.startsWith('demo-')) {
    await supabase.from('campaigns').update({
      title: next.title,
      discount_rate: next.discount_rate,
      expiry_date: next.expiry_date,
      details: next.details,
      is_active: next.is_active,
    }).eq('id', input.id);
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
    try {
      await supabase.from('companies').update({
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
      }).eq('id', companyId);
    } catch {
      // local profile still updates if remote schema lags
    }
  }
  upsertLocalCompany(next);
  return next;
}

export async function setCampaignActiveAction(campaignId: string, isActive: boolean): Promise<Campaign> {
  const current = (await listAdminCampaigns()).find((item) => item.id === campaignId);
  if (!current) throw new Error('Kampanya bulunamadı.');
  const next = { ...current, is_active: isActive };
  if (isSupabaseConfigured && !campaignId.startsWith('demo-')) {
    await supabase.from('campaigns').update({ is_active: isActive }).eq('id', campaignId);
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
  if (isSupabaseConfigured && !campaignId.startsWith('demo-')) {
    const adminRpc = await supabase.rpc('admin_delete_campaign', { p_id: campaignId });
    if (adminRpc.error) {
      const merchantRpc = await supabase.rpc('merchant_delete_campaign', { p_id: campaignId });
      if (merchantRpc.error) {
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
