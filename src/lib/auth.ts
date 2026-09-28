import type { User } from '@supabase/supabase-js';
import { isSupabaseConfigured, supabase } from '@/lib/supabase';

export function normalizePhone(value: string) {
  return value.replace(/[^\d+]/g, '').trim();
}

export function isValidPhone(value: string, required = false) {
  const phone = normalizePhone(value);
  if (!phone) return !required;
  const digits = phone.replace(/\D/g, '');
  return digits.length >= 10 && digits.length <= 15;
}

export type ProfileRole = 'user' | 'merchant' | 'admin';
export type AppDestination = 'admin' | 'merchant' | 'home' | 'pending';
export type LoginGate = ProfileRole;

export const EXISTING_ACCOUNT_MESSAGE =
  'Bu e-posta adresiyle zaten bir kayıt var, lütfen giriş yapın veya şifremi unuttum kullanın';

export function friendlyAuthError(raw: string | null | undefined, fallback = 'İşlem tamamlanamadı.') {
  const message = String(raw ?? '').trim();
  if (!message) return fallback;
  const lower = message.toLowerCase();
  if (
    lower.includes('already registered')
    || lower.includes('already been registered')
    || lower.includes('user already exists')
    || lower.includes('already exists')
    || lower.includes('duplicate key')
    || lower.includes('unique constraint')
    || lower.includes('users_email_partial_key')
  ) {
    return EXISTING_ACCOUNT_MESSAGE;
  }
  if (
    lower.includes('password should be')
    || lower.includes('weak password')
    || lower.includes('password is too weak')
    || lower.includes('password should contain')
    || (lower.includes('password') && lower.includes('at least'))
  ) {
    return 'Şifre çok zayıf. En az 6 karakter girin.';
  }
  if (lower.includes('invalid login') || lower.includes('invalid credentials') || lower.includes('invalid email or password')) {
    return 'E-posta veya şifre hatalı.';
  }
  if (lower.includes('email not confirmed') || lower.includes('email_not_confirmed')) {
    return 'E-posta henüz onaylanmadı. Gelen kutunuzu kontrol edin.';
  }
  if (lower.includes('unable to validate email') || lower.includes('invalid format') || lower.includes('invalid email')) {
    return 'Geçerli bir e-posta adresi girin.';
  }
  if (lower.includes('row-level security') || lower.includes('violates row-level') || lower.includes('rls') || lower.includes('42501')) {
    return 'Kayıt yazılamadı. Oturum açıkken tekrar deneyin.';
  }
  if (lower.includes('on conflict') || lower.includes('exclusion constraint')) {
    return 'Başvuru kaydı şu an alınamadı. Biraz sonra tekrar deneyin.';
  }
  return message;
}

export function roleAllowedForGate(role: ProfileRole, gate: LoginGate) {
  return role === gate;
}

export function loginGateMessage(gate: LoginGate) {
  if (gate === 'admin') return 'Bu ekran yalnızca yöneticiler içindir.';
  if (gate === 'merchant') return 'Bu ekran yalnızca işletme hesapları içindir.';
  return 'Bu giriş yalnızca üyeler içindir. Yönetici veya işletme hesabıyla buradan girilemez.';
}

export type AppProfile = {
  id: string;
  auth_user_id?: string | null;
  email: string;
  phone: string;
  first_name?: string | null;
  last_name?: string | null;
  full_name?: string | null;
  role: ProfileRole;
  company_id: string | null;
  vip?: boolean;
  city?: string | null;
  created_at?: string;
};

export function joinFullName(first?: string | null, last?: string | null) {
  return [first, last].map((part) => String(part ?? '').trim()).filter(Boolean).join(' ');
}

export function splitFullName(value?: string | null) {
  const parts = String(value ?? '').trim().split(/\s+/).filter(Boolean);
  return {
    first_name: parts[0] ?? '',
    last_name: parts.slice(1).join(' '),
  };
}

export function parseRole(value: unknown): ProfileRole {
  const role = String(value ?? '').trim().toLowerCase();
  if (role === 'admin' || role === 'merchant') return role;
  return 'user';
}

export function displayNameFrom(
  profile?: AppProfile | null,
  email?: string | null,
  companyName?: string | null,
) {
  const first = profile?.first_name?.trim() || splitFullName(profile?.full_name).first_name;
  if (first) return titleName(first);
  const company = companyName?.trim().split(/\s+/)[0];
  if (company) return titleName(company);
  const source = (profile?.email || email || '').trim();
  const local = source.split('@')[0]?.replace(/[._-]+/g, ' ').trim().split(/\s+/)[0];
  if (!local) return '';
  return titleName(local);
}

function titleName(value: string) {
  return value
    .split(/\s+/)
    .filter(Boolean)
    .map((part) => part.charAt(0).toLocaleUpperCase('tr') + part.slice(1))
    .join(' ');
}

export function welcomeLine(
  profile?: AppProfile | null,
  email?: string | null,
  companyName?: string | null,
) {
  const name = displayNameFrom(profile, email, companyName);
  return name ? `Hoşgeldin ${name}` : 'Hoşgeldin';
}

export function destinationForRole(role: ProfileRole | null | undefined): AppDestination {
  if (role === 'admin') return 'admin';
  if (role === 'merchant') return 'merchant';
  return 'home';
}

export function destinationForAccount(
  role: ProfileRole | null | undefined,
  application?: { status?: string | null } | null,
  signupKind?: string | null,
): AppDestination {
  if (role === 'admin') return 'admin';
  if (application?.status === 'approved' || role === 'merchant') return 'merchant';
  if (application?.status === 'pending' || application?.status === 'rejected' || signupKind === 'business') {
    return 'pending';
  }
  return 'home';
}

export function asProfile(row: Partial<AppProfile> | Record<string, unknown> | null | undefined): AppProfile | null {
  if (!row || typeof row !== 'object') return null;
  const record = row as Record<string, unknown>;
  const id = String(record.id ?? record.auth_user_id ?? '');
  if (!id) return null;
  const split = splitFullName(String(record.full_name ?? ''));
  const first_name = String(record.first_name ?? split.first_name ?? '') || null;
  const last_name = String(record.last_name ?? split.last_name ?? '') || null;
  return {
    id,
    auth_user_id: (record.auth_user_id as string | null | undefined) ?? id,
    email: String(record.email ?? ''),
    phone: String(record.phone ?? ''),
    first_name,
    last_name,
    full_name: joinFullName(first_name, last_name) || String(record.full_name ?? '') || null,
    role: parseRole(record.role),
    company_id: (record.company_id as string | null | undefined) ?? null,
    city: String(record.city ?? '').trim() || null,
    created_at: record.created_at as string | undefined,
  };
}

async function firstProfileRow(filter: { column: string; value: string }) {
  const { data, error } = await supabase
    .from('profiles')
    .select('*')
    .eq(filter.column, filter.value)
    .limit(1);
  if (error) return null;
  const row = Array.isArray(data) ? data[0] : data;
  return asProfile(row as Record<string, unknown> | null);
}

export async function loadMyProfile(): Promise<AppProfile | null> {
  if (!isSupabaseConfigured) return null;

  const { data: authData } = await supabase.auth.getUser();
  const authUser = authData.user;
  if (!authUser) return null;

  const uid = authUser.id;
  const email = (authUser.email ?? '').trim().toLowerCase();
  const phone = String(authUser.user_metadata?.phone ?? authUser.phone ?? '');
  const metaFirst = String(authUser.user_metadata?.first_name ?? '').trim();
  const metaLast = String(authUser.user_metadata?.last_name ?? '').trim();
  const metaName = joinFullName(metaFirst, metaLast) || String(authUser.user_metadata?.full_name ?? authUser.user_metadata?.name ?? '').trim();
  const metaRole = parseRole(authUser.app_metadata?.role ?? authUser.user_metadata?.role);

  const withMeta = (row: AppProfile | null): AppProfile | null => {
    if (!row) return null;
    const first_name = row.first_name?.trim() || metaFirst || splitFullName(row.full_name || metaName).first_name || null;
    const last_name = row.last_name?.trim() || metaLast || splitFullName(row.full_name || metaName).last_name || null;
    return {
      ...row,
      phone: row.phone || phone,
      first_name,
      last_name,
      full_name: joinFullName(first_name, last_name) || row.full_name?.trim() || metaName || null,
    };
  };

  const byId = withMeta(await firstProfileRow({ column: 'id', value: uid }));
  if (byId) return withCompanyName(byId, email);

  if (email) {
    const exact = withMeta(await firstProfileRow({ column: 'email', value: email }));
    if (exact) return withCompanyName(exact, email);

    const { data, error } = await supabase
      .from('profiles')
      .select('*')
      .ilike('email', email)
      .limit(1);
    if (!error) {
      const row = Array.isArray(data) ? data[0] : data;
      const fromEmail = withMeta(asProfile(row as Record<string, unknown> | null));
      if (fromEmail) return withCompanyName(fromEmail, email);
    }
  }

  const adminCheck = await supabase.rpc('is_current_admin');
  if (!adminCheck.error && adminCheck.data === true) {
    return {
      id: uid,
      auth_user_id: uid,
      email,
      phone,
      first_name: metaFirst || splitFullName(metaName).first_name || null,
      last_name: metaLast || splitFullName(metaName).last_name || null,
      full_name: metaName || null,
      role: 'admin',
      company_id: null,
    };
  }

  return {
    id: uid,
    auth_user_id: uid,
    email,
    phone,
    first_name: metaFirst || splitFullName(metaName).first_name || null,
    last_name: metaLast || splitFullName(metaName).last_name || null,
    full_name: metaName || null,
    role: metaRole,
    company_id: null,
  };
}

export async function ensureMyProfile(): Promise<AppProfile | null> {
  return loadMyProfile();
}

async function withCompanyName(profile: AppProfile, email: string): Promise<AppProfile> {
  if (profile.full_name?.trim() || profile.role !== 'merchant' || !email) return profile;
  const byEmail = await supabase.from('companies').select('name').ilike('email', email).limit(1);
  const name = !byEmail.error ? byEmail.data?.[0]?.name : null;
  if (name) return { ...profile, full_name: String(name) };
  const byOwner = await supabase.from('companies').select('name').ilike('owner_email', email).limit(1);
  const ownerName = !byOwner.error ? byOwner.data?.[0]?.name : null;
  if (ownerName) return { ...profile, full_name: String(ownerName) };
  return profile;
}

export function isDuplicateSignupUser(user: User | null | undefined, sessionPresent: boolean) {
  if (!user || sessionPresent) return false;
  const identities = user.identities ?? [];
  return identities.length === 0;
}

export function isExistingAccountAuthError(error?: { message?: string; code?: string } | string | null) {
  const code = typeof error === 'object' && error ? String(error.code ?? '').toLowerCase() : '';
  const lower = String(typeof error === 'string' ? error : error?.message ?? '').toLowerCase();
  if (
    code === 'user_already_exists'
    || code === 'email_exists'
    || lower.includes('already registered')
    || lower.includes('already been registered')
    || lower.includes('user already exists')
    || lower.includes('already exists')
    || lower.includes('email_exists')
  ) {
    return true;
  }
  return false;
}

export async function sessionAfterSignUp(
  _email: string,
  _password: string,
  signup: { user: User | null; session: { user: User } | null },
): Promise<{ ok: true; user: User } | { ok: false; message: string }> {
  if (isDuplicateSignupUser(signup.user, Boolean(signup.session))) {
    return { ok: false, message: EXISTING_ACCOUNT_MESSAGE };
  }
  if (signup.session?.user) {
    return { ok: true, user: signup.session.user };
  }
  if (signup.user && (signup.user.identities?.length ?? 0) > 0) {
    return {
      ok: false,
      message: 'Hesap oluşturuldu. E-posta onayını tamamlayıp giriş yaptıktan sonra devam edin.',
    };
  }
  return { ok: false, message: signup.user ? EXISTING_ACCOUNT_MESSAGE : 'Kayıt oluşturulamadı.' };
}

export async function writeOwnProfile(input: {
  id: string;
  email: string;
  phone?: string;
  fullName?: string;
  role?: ProfileRole;
  city?: string;
}): Promise<{ ok: true } | { ok: false; message: string }> {
  const row = {
    id: input.id,
    auth_user_id: input.id,
    email: input.email.trim().toLowerCase(),
    phone: input.phone ?? '',
    full_name: input.fullName || null,
    role: input.role === 'admin' || input.role === 'merchant' ? 'user' : (input.role ?? 'user'),
    city: input.city?.trim() || null,
  };

  const rpcArgs = {
    p_email: row.email,
    p_phone: row.phone,
    p_full_name: row.full_name ?? '',
    p_role: row.role,
    p_city: row.city ?? '',
  };
  let rpc = await supabase.rpc('complete_my_profile', rpcArgs);
  if (rpc.error && /p_city|does not exist|function public.complete_my_profile/i.test(rpc.error.message)) {
    const { p_city: _city, ...legacy } = rpcArgs;
    rpc = await supabase.rpc('complete_my_profile', legacy);
  }
  if (!rpc.error) {
    if (row.city) {
      await supabase.from('profiles').update({ city: row.city }).eq('id', row.id);
    }
    return { ok: true };
  }

  const byId = await supabase.from('profiles').upsert(row, { onConflict: 'id' });
  if (!byId.error) return { ok: true };

  const byAuth = await supabase.from('profiles').upsert(row, { onConflict: 'auth_user_id' });
  if (!byAuth.error) return { ok: true };

  return { ok: false, message: friendlyAuthError(byAuth.error.message || byId.error.message || rpc.error.message) };
}
