import { joinFullName, friendlyAuthError, isValidPhone, normalizePhone, sessionAfterSignUp, writeOwnProfile, EXISTING_ACCOUNT_MESSAGE, isDuplicateSignupUser, isExistingAccountAuthError } from '@/lib/auth';
import { isSupabaseConfigured, supabase } from '@/lib/supabase';
import { notifyAdminsOfSignup } from '@/lib/adminSettings';
import { upsertLocalCompany, upsertLocalUser } from '@/lib/adminStore';
import type { Company } from '@/lib/campaigns';
import { checkTaxOrNationalId, type IdentityKind } from '@/lib/identityNumber';
import { hasValidCoords } from '@/lib/geo';
import { pilotColumns, readPilotAccess, readSubscriptionSettings, refreshSubscriptionSettings } from '@/lib/subscription';

export const BUSINESS_SECTORS = [
  'Restoran',
  'Kafe',
  'Yeme & İçme',
  'Market',
  'Giyim',
  'Gelinlik',
  'Güzellik',
  'Güzellik & Bakım',
  'Spor',
  'Sağlık',
  'Mobilya',
  'Dekorasyon',
  'Eğlence',
  'Teknoloji',
  'E-Ticaret',
  'Hizmet',
  'Eğitim',
  'Otomotiv',
  'Emlak',
  'Kargo',
  'Lojistik',
  'Pet',
  'Çocuk',
  'Kurumsal',
  'Yerel Esnaf',
] as const;

export const BURSA_DISTRICTS = [
  'Nilüfer',
  'Osmangazi',
  'Yıldırım',
  'Mudanya',
  'Gemlik',
  'Gürsu',
  'Kestel',
  'İnegöl',
  'Mustafakemalpaşa',
  'Karacabey',
  'Orhangazi',
  'Yenişehir',
] as const;

export const DISTRICT_COORDS: Record<string, { latitude: number; longitude: number }> = {
  Nilüfer: { latitude: 40.2131, longitude: 28.9847 },
  Osmangazi: { latitude: 40.1956, longitude: 29.0601 },
  Yıldırım: { latitude: 40.1864, longitude: 29.0822 },
  Mudanya: { latitude: 40.3753, longitude: 28.8826 },
  Gemlik: { latitude: 40.4309, longitude: 29.1554 },
  Gürsu: { latitude: 40.2186, longitude: 29.1947 },
  Kestel: { latitude: 40.1983, longitude: 29.2119 },
  İnegöl: { latitude: 40.0781, longitude: 29.5133 },
  Mustafakemalpaşa: { latitude: 40.0383, longitude: 28.4097 },
  Karacabey: { latitude: 40.2132, longitude: 28.3612 },
  Orhangazi: { latitude: 40.4892, longitude: 29.3089 },
  Yenişehir: { latitude: 40.2644, longitude: 29.6531 },
};

export type BusinessStatus = 'pending' | 'approved' | 'rejected';

export type BusinessApplication = {
  id: string;
  user_id: string;
  email: string;
  owner_name: string;
  phone: string;
  company_name: string;
  sector: string;
  district: string;
  address: string;
  tax_office: string;
  tax_number: string;
  identity_kind?: IdentityKind | null;
  subscription_enrolled?: boolean;
  subscription_started_at?: string | null;
  intro_price?: number | null;
  intro_duration_months?: number | null;
  standard_price?: number | null;
  is_pilot_firm?: boolean | null;
  free_trial_months?: number | null;
  subscription_ends_at?: string | null;
  paid_started_at?: string | null;
  latitude: number | null;
  longitude: number | null;
  status: BusinessStatus;
  company_id: string | null;
  created_at: string;
};

export type BusinessRegisterInput = {
  email: string;
  password: string;
  ownerName: string;
  phone: string;
  companyName: string;
  sector: string;
  district: string;
  address: string;
  taxOffice: string;
  taxNumber: string;
  identityKind?: IdentityKind | null;
  latitude: number;
  longitude: number;
};

const LOCAL_KEY = 'qapla_business_applications';
const DRAFT_KEY = 'qapla_business_draft';
export const BUSINESSES_EVENT = 'qapla-businesses';

type BusinessDraft = {
  userId: string;
  email: string;
  owner_name: string;
  phone: string;
  company_name: string;
  sector: string;
  district: string;
  address: string;
  tax_office: string;
  tax_number: string;
  identity_kind?: IdentityKind | null;
  latitude: number | null;
  longitude: number | null;
};

function rememberLocalApplication(row: BusinessApplication) {
  writeLocal([row, ...readLocal().filter((item) => item.user_id !== row.user_id && item.id !== row.id)]);
  if (typeof window !== 'undefined') {
    window.dispatchEvent(new CustomEvent(BUSINESSES_EVENT, { detail: row }));
  }
}

function readDraft(): BusinessDraft | null {
  try {
    const parsed = JSON.parse(localStorage.getItem(DRAFT_KEY) ?? 'null') as BusinessDraft | null;
    return parsed && parsed.userId ? parsed : null;
  } catch {
    return null;
  }
}

function writeDraft(draft: BusinessDraft | null) {
  if (!draft) localStorage.removeItem(DRAFT_KEY);
  else localStorage.setItem(DRAFT_KEY, JSON.stringify(draft));
}

function asBusiness(row: Record<string, unknown> | null | undefined): BusinessApplication | null {
  if (!row) return null;
  const status = String(row.status ?? 'pending');
  return {
    id: String(row.id ?? ''),
    user_id: String(row.user_id ?? ''),
    email: String(row.email ?? ''),
    owner_name: String(row.owner_name ?? ''),
    phone: String(row.phone ?? ''),
    company_name: String(row.company_name ?? ''),
    sector: String(row.sector ?? ''),
    district: String(row.district ?? ''),
    address: String(row.address ?? ''),
    tax_office: String(row.tax_office ?? ''),
    tax_number: String(row.tax_number ?? ''),
    identity_kind: row.identity_kind === 'national' || row.identity_kind === 'tax' ? row.identity_kind : null,
    subscription_enrolled: Boolean(row.subscription_enrolled),
    subscription_started_at: row.subscription_started_at ? String(row.subscription_started_at) : null,
    intro_price: row.intro_price == null ? null : Number(row.intro_price),
    intro_duration_months: row.intro_duration_months == null ? null : Number(row.intro_duration_months),
    standard_price: row.standard_price == null ? null : Number(row.standard_price),
    ...readPilotAccess(row),
    latitude: Number.isFinite(Number(row.latitude)) ? Number(row.latitude) : null,
    longitude: Number.isFinite(Number(row.longitude)) ? Number(row.longitude) : null,
    status: status === 'approved' || status === 'rejected' ? status : 'pending',
    company_id: (row.company_id as string | null) ?? null,
    created_at: String(row.created_at ?? new Date().toISOString()),
  };
}

export function applicationFromRow(row: Record<string, unknown> | null | undefined) {
  return asBusiness(row);
}

function readLocal(): BusinessApplication[] {
  try {
    const raw = localStorage.getItem(LOCAL_KEY);
    const parsed = raw ? JSON.parse(raw) as BusinessApplication[] : [];
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function writeLocal(rows: BusinessApplication[]) {
  localStorage.setItem(LOCAL_KEY, JSON.stringify(rows));
}

export function coordsForDistrict(district: string) {
  return DISTRICT_COORDS[district] ?? DISTRICT_COORDS.Osmangazi;
}

export function pinCoords(latitude?: number | null, longitude?: number | null, district?: string) {
  if (hasValidCoords({ latitude, longitude })) {
    return { latitude: Number(latitude), longitude: Number(longitude) };
  }
  return coordsForDistrict(district ?? 'Osmangazi');
}

export async function persistRemoteBusiness(
  userId: string,
  input: Omit<BusinessDraft, 'userId'>,
): Promise<BusinessApplication | null> {
  const result = await persistRemoteBusinessResult(userId, input);
  return result.row;
}

export async function persistRemoteBusinessResult(
  userId: string,
  input: Omit<BusinessDraft, 'userId'>,
): Promise<{ row: BusinessApplication | null; message?: string }> {
  if (!isSupabaseConfigured) return { row: null, message: 'Supabase yapılandırılmadı.' };
  let hint = '';

  const rpcArgs = {
    p_owner_name: input.owner_name,
    p_phone: input.phone,
    p_company_name: input.company_name,
    p_sector: input.sector,
    p_district: input.district,
    p_address: input.address,
    p_tax_office: input.tax_office,
    p_tax_number: input.tax_number,
    p_latitude: input.latitude,
    p_longitude: input.longitude,
  };
  let businessRpc = await supabase.rpc('submit_my_business', rpcArgs);
  if (businessRpc.error && /p_latitude|does not exist|function public.submit_my_business/i.test(businessRpc.error.message)) {
    const { p_latitude: _lat, p_longitude: _lng, ...legacy } = rpcArgs;
    businessRpc = await supabase.rpc('submit_my_business', legacy);
  }
  if (businessRpc.error) hint = businessRpc.error.message;
  let saved = asBusiness(businessRpc.data as Record<string, unknown> | null);

  if (!saved) {
    const inserted = await supabase.from('businesses').insert({
      user_id: userId,
      email: input.email,
      owner_name: input.owner_name,
      phone: input.phone,
      company_name: input.company_name,
      sector: input.sector,
      district: input.district,
      address: input.address,
      tax_office: input.tax_office,
      tax_number: input.tax_number,
      latitude: input.latitude,
      longitude: input.longitude,
      status: 'pending',
    }).select('*').maybeSingle();
    if (inserted.error) hint = hint || inserted.error.message;
    saved = asBusiness(inserted.data as Record<string, unknown> | null);
  }

  if (!saved) {
    const existing = await supabase
      .from('businesses')
      .select('*')
      .eq('user_id', userId)
      .limit(1)
      .maybeSingle();
    if (existing.error) hint = hint || existing.error.message;
    saved = asBusiness(existing.data as Record<string, unknown> | null);
  }

  if (!saved) {
    return { row: null, message: friendlyAuthError(hint, 'Başvuru veritabanına yazılamadı.') };
  }
  if (saved && hasValidCoords({ latitude: input.latitude, longitude: input.longitude })) {
    const patchedPin = await supabase
      .from('businesses')
      .update({ latitude: input.latitude, longitude: input.longitude })
      .eq('id', saved.id)
      .select('*')
      .maybeSingle();
    saved = asBusiness(patchedPin.data as Record<string, unknown> | null) ?? saved;
  }
  if (input.identity_kind) {
    const settings = readSubscriptionSettings();
    const profilePatch: Record<string, unknown> = { identity_kind: input.identity_kind };
    if (settings.is_subscription_active) {
      profilePatch.subscription_enrolled = true;
      profilePatch.subscription_started_at = new Date().toISOString();
      profilePatch.intro_price = settings.intro_price;
      profilePatch.intro_duration_months = settings.intro_duration_months;
      profilePatch.standard_price = settings.standard_price;
    }
    const patchedIdentity = await supabase
      .from('businesses')
      .update(profilePatch)
      .eq('id', saved.id)
      .select('*')
      .maybeSingle();
    if (!patchedIdentity.error && patchedIdentity.data) {
      saved = asBusiness(patchedIdentity.data as Record<string, unknown>) ?? saved;
    }
  }
  if (input.email && saved.email !== input.email) {
    const patched = await supabase
      .from('businesses')
      .update({ email: input.email })
      .eq('id', saved.id)
      .select('*')
      .maybeSingle();
    saved = asBusiness(patched.data as Record<string, unknown> | null) ?? { ...saved, email: input.email };
  }
  return { row: saved };
}

export async function retryPendingBusinessApplication(userId?: string, email?: string | null): Promise<BusinessApplication | null> {
  const draft = readDraft();
  if (draft && (!userId || draft.userId === userId)) {
    const saved = await persistRemoteBusiness(draft.userId, draft);
    if (saved) {
      rememberLocalApplication(saved);
      writeDraft(null);
      return saved;
    }
  }
  return loadBusinessForUser(userId ?? draft?.userId ?? '', email ?? draft?.email);
}

export async function loadBusinessForUser(userId: string, email?: string | null): Promise<BusinessApplication | null> {
  try {
    if (!userId && !email) return null;
    if (isSupabaseConfigured && userId) {
      const { data, error } = await supabase
        .from('businesses')
        .select('*')
        .eq('user_id', userId)
        .limit(1);
      if (!error) {
        const row = Array.isArray(data) ? data[0] : data;
        const found = asBusiness(row as Record<string, unknown> | null);
        if (found) return found;
      }
    }
    const local = readLocal();
    return local.find((item) => item.user_id === userId || (email && item.email === email.trim().toLowerCase())) ?? null;
  } catch {
    return null;
  }
}

export async function listBusinessApplications(): Promise<BusinessApplication[]> {
  let remote: BusinessApplication[] = [];
  if (isSupabaseConfigured) {
    const rpc = await supabase.rpc('admin_list_businesses');
    if (!rpc.error && rpc.data) {
      remote = ((rpc.data as Record<string, unknown>[]) ?? []).map((row) => asBusiness(row)).filter(Boolean) as BusinessApplication[];
    } else {
      const table = await supabase
        .from('businesses')
        .select('*')
        .order('created_at', { ascending: false });
      if (table.error) {
        throw new Error(friendlyAuthError(table.error.message || rpc.error?.message, 'Başvurular okunamadı.'));
      }
      remote = ((table.data as Record<string, unknown>[]) ?? []).map((row) => asBusiness(row)).filter(Boolean) as BusinessApplication[];
    }
  }
  const byId = new Map(remote.map((item) => [item.id, item]));
  for (const row of readLocal()) {
    if (!byId.has(row.id)) byId.set(row.id, row);
  }
  return [...byId.values()].sort((a, b) => b.created_at.localeCompare(a.created_at));
}

export async function submitBusinessRegister(input: BusinessRegisterInput): Promise<{ ok: boolean; message?: string }> {
  const email = input.email.trim().toLowerCase();
  const password = input.password;
  const ownerName = input.ownerName.trim();
  const phone = normalizePhone(input.phone);
  const companyName = input.companyName.trim();
  const sector = input.sector.trim();
  const district = input.district.trim();
  const address = input.address.trim();
  const taxOffice = input.taxOffice.trim();
  const rawTax = input.taxNumber.trim();
  let taxNumber = '';
  let identityKind: 'tax' | 'national' | null = null;
  if (rawTax) {
    const identity = checkTaxOrNationalId(rawTax);
    if (!identity.ok) return { ok: false, message: identity.message };
    taxNumber = identity.value;
    identityKind = identity.kind;
  }

  if (!email || password.length < 6) return { ok: false, message: 'Geçerli e-posta ve en az 6 karakter şifre girin.' };
  if (!ownerName) return { ok: false, message: 'Yetkili ad soyad girin.' };
  if (!isValidPhone(phone, true)) return { ok: false, message: 'Geçerli bir telefon numarası girin.' };
  if (!companyName) return { ok: false, message: 'Firma / işletme adı girin.' };
  if (!sector) return { ok: false, message: 'Sektör seçin.' };
  if (!district) return { ok: false, message: 'İlçe seçin.' };
  if (!address) return { ok: false, message: 'Açık adres girin.' };
  if (!hasValidCoords({ latitude: input.latitude, longitude: input.longitude })) {
    return { ok: false, message: 'Haritadan işletmenin tam konumunu seçin.' };
  }

  await refreshSubscriptionSettings();
  const settings = readSubscriptionSettings();
  const payload = {
    email,
    owner_name: ownerName,
    phone,
    company_name: companyName,
    sector,
    district,
    address,
    tax_office: taxOffice,
    tax_number: taxNumber,
    identity_kind: identityKind,
    subscription_enrolled: settings.is_subscription_active,
    subscription_started_at: settings.is_subscription_active ? new Date().toISOString() : null,
    intro_price: settings.is_subscription_active ? settings.intro_price : null,
    intro_duration_months: settings.is_subscription_active ? settings.intro_duration_months : null,
    standard_price: settings.is_subscription_active ? settings.standard_price : null,
    latitude: input.latitude,
    longitude: input.longitude,
    status: 'pending' as const,
  };

  if (!isSupabaseConfigured) {
    const existing = readLocal();
    if (existing.some((item) => item.email === email)) {
      return { ok: false, message: EXISTING_ACCOUNT_MESSAGE };
    }
    const userId = crypto.randomUUID();
    const row: BusinessApplication = {
      id: crypto.randomUUID(),
      user_id: userId,
      company_id: null,
      created_at: new Date().toISOString(),
      ...payload,
    };
    writeLocal([row, ...existing]);
    upsertLocalUser({
      id: userId,
      email,
      phone,
      role: 'merchant',
      company_id: null,
      created_at: row.created_at,
    });
    return { ok: true };
  }

  const names = ownerName.split(/\s+/).filter(Boolean);
  const first = names[0] ?? ownerName;
  const last = names.slice(1).join(' ');
  const fullName = joinFullName(first, last) || ownerName;

  try {
    const { data, error } = await supabase.auth.signUp({
      email,
      password,
      options: { data: { phone, first_name: first, last_name: last, full_name: fullName, role: 'merchant', signup_kind: 'business' } },
    });

    if (error && isExistingAccountAuthError(error)) {
      return { ok: false, message: EXISTING_ACCOUNT_MESSAGE };
    }
    if (isDuplicateSignupUser(data.user, Boolean(data.session))) {
      return { ok: false, message: EXISTING_ACCOUNT_MESSAGE };
    }
    if (error || !data.user) {
      return { ok: false, message: friendlyAuthError(error?.message, 'Kayıt oluşturulamadı.') };
    }

    const session = await sessionAfterSignUp(email, password, {
      user: data.user,
      session: data.session,
    });
    if (!session.ok) return session;
    const userId = session.user.id;

    await supabase.auth.updateUser({
      data: { phone, first_name: first, last_name: last, full_name: fullName, role: 'merchant', signup_kind: 'business' },
    });

    const profileSaved = await writeOwnProfile({
      id: userId,
      email,
      phone,
      fullName,
      role: 'user',
    });
    if (!profileSaved.ok) return profileSaved;

    const draft: BusinessDraft = {
      userId,
      email,
      owner_name: ownerName,
      phone,
      company_name: companyName,
      sector,
      district,
      address,
      tax_office: taxOffice,
      tax_number: taxNumber,
      identity_kind: identityKind,
      latitude: input.latitude,
      longitude: input.longitude,
    };
    writeDraft(draft);

    const persisted = await persistRemoteBusinessResult(userId, draft);
    if (!persisted.row) {
      return { ok: false, message: persisted.message ?? 'Başvuru kaydı yazılamadı. Tekrar deneyin.' };
    }
    rememberLocalApplication(persisted.row);
    writeDraft(null);

    await notifyAdminsOfSignup('business');
    return { ok: true };
  } catch (err) {
    return { ok: false, message: friendlyAuthError(err instanceof Error ? err.message : null) };
  }
}

async function writePilotFlag(businessId: string, companyId: string | null) {
  const patch = pilotColumns(true);
  const businessWrite = await supabase.from('businesses').update(patch).eq('id', businessId).select('*').maybeSingle();
  if (businessWrite.error) {
    throw new Error('Firma onaylandı fakat pilot bayrağı yazılamadı. SQL Editor’da 20260927150000_pilot_sixty_paywall.sql dosyasını çalıştırın.');
  }
  if (companyId) {
    const companyWrite = await supabase.from('companies').update(patch).eq('id', companyId);
    if (companyWrite.error) {
      throw new Error('Firma onaylandı fakat pilot bayrağı yazılamadı. SQL Editor’da 20260927150000_pilot_sixty_paywall.sql dosyasını çalıştırın.');
    }
  }
  return asBusiness(businessWrite.data as Record<string, unknown> | null);
}

export async function setBusinessStatusAction(
  id: string,
  status: BusinessStatus,
  options?: { pilot?: boolean },
): Promise<BusinessApplication> {
  const localRows = readLocal();
  const local = localRows.find((item) => item.id === id);

  if (isSupabaseConfigured) {
    const remote = await supabase.from('businesses').select('*').eq('id', id).maybeSingle();
    const source = asBusiness(remote.data as Record<string, unknown> | null) ?? local;
    const coords = pinCoords(source?.latitude, source?.longitude, source?.district ?? 'Osmangazi');
    const pilot = Boolean(options?.pilot) && status === 'approved';
    let { data, error } = await supabase.rpc('admin_set_business_status', {
      p_id: id,
      p_status: status,
      p_latitude: coords.latitude,
      p_longitude: coords.longitude,
      ...(pilot ? { p_pilot: true } : {}),
    });
    if (error && pilot && /p_pilot|schema cache|PGRST202|Could not find the function/i.test(error.message)) {
      const retry = await supabase.rpc('admin_set_business_status', {
        p_id: id,
        p_status: status,
        p_latitude: coords.latitude,
        p_longitude: coords.longitude,
      });
      data = retry.data;
      error = retry.error;
    }
    if (error) throw new Error(friendlyAuthError(error.message, 'Başvuru güncellenemedi.'));
    if (data) {
      let saved = asBusiness(data as Record<string, unknown>);
      if (pilot && saved) {
        const flagged = await writePilotFlag(id, saved.company_id ?? null);
        saved = flagged ?? { ...saved, ...pilotColumns(true), is_pilot_firm: true };
      }
      if (saved) {
        rememberLocalApplication(saved);
        return saved;
      }
    }
    throw new Error('Başvuru güncellenemedi.');
  }

  if (!local) throw new Error('Başvuru bulunamadı.');
  const coords = pinCoords(local.latitude, local.longitude, local.district);
  const pilot = Boolean(options?.pilot) && status === 'approved';
  let companyId = local.company_id;
  if (status === 'approved' && !companyId) {
    const company: Company = {
      id: crypto.randomUUID(),
      name: local.company_name,
      description: `${local.district} / ${local.sector}`,
      category: local.sector,
      latitude: coords.latitude,
      longitude: coords.longitude,
      address: local.address,
      is_featured: false,
      phone: local.phone,
      email: local.email,
      owner_email: local.email,
      created_at: new Date().toISOString(),
      ...(pilot ? pilotColumns(true) : {}),
    };
    upsertLocalCompany(company);
    companyId = company.id;
    upsertLocalUser({
      id: local.user_id,
      email: local.email,
      phone: local.phone,
      role: 'merchant',
      company_id: companyId,
      created_at: local.created_at,
    });
  }
  const next: BusinessApplication = {
    ...local,
    status,
    company_id: companyId,
    ...(pilot ? pilotColumns(true) : {}),
    is_pilot_firm: pilot || Boolean(local.is_pilot_firm),
  };
  writeLocal(localRows.map((item) => item.id === id ? next : item));
  return next;
}

export const MERCHANT_PENDING_MESSAGE = 'Hesabınız Yönetim Onayı Bekliyor';
