import { createClient } from '@supabase/supabase-js';
import { isSupabaseConfigured, supabase } from '@/lib/supabase';
import { upsertLocalSecret } from '@/lib/adminStore';
import type { AppUserRole } from '@/lib/campaigns';
import { splitFullName } from '@/lib/auth';

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL?.trim() ?? '';
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY?.trim() ?? '';

function provisioningClient() {
  return createClient(supabaseUrl || 'https://placeholder.supabase.co', supabaseAnonKey || 'public-anon-key', {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
      detectSessionInUrl: false,
      storage: {
        getItem: () => null,
        setItem: () => {},
        removeItem: () => {},
      },
    },
  });
}

export async function provisionLoginAccount(input: {
  email: string;
  password: string;
  role: AppUserRole;
  phone?: string;
  fullName?: string;
  companyId?: string | null;
}): Promise<{ ok: boolean; userId?: string; message?: string }> {
  const email = input.email.trim().toLowerCase();
  const password = input.password;
  if (!email || password.length < 6) {
    return { ok: false, message: 'Geçerli e-posta ve en az 6 karakter şifre girin.' };
  }

  upsertLocalSecret({
    email,
    password,
    kind: input.role,
    companyId: input.companyId ?? null,
    label: input.fullName ?? null,
  });

  if (!isSupabaseConfigured) {
    return { ok: true };
  }

  const rpc = await supabase.rpc('admin_provision_login', {
    p_email: email,
    p_password: password,
    p_role: input.role,
    p_phone: input.phone ?? '',
    p_full_name: input.fullName ?? '',
    p_company_id: input.companyId ?? null,
  });
  if (!rpc.error && rpc.data) {
    await saveRemoteSecret(email, password, input.role, input.companyId, input.fullName);
    await syncProfile(String(rpc.data), email, input.role, input.phone, input.fullName, input.companyId);
    return { ok: true, userId: String(rpc.data) };
  }

  const guest = provisioningClient();
  const signed = await guest.auth.signUp({
    email,
    password,
    options: {
      data: {
        phone: input.phone ?? '',
        role: input.role,
        full_name: input.fullName ?? '',
        first_name: splitFullName(input.fullName).first_name,
        last_name: splitFullName(input.fullName).last_name,
      },
    },
  });

  let userId = signed.data.user?.id;
  if (signed.error && !/already|registered|exists/i.test(signed.error.message)) {
    return { ok: false, message: signed.error.message };
  }
  if (!userId) {
    const listed = await supabase.from('profiles').select('id').ilike('email', email).limit(1);
    userId = listed.data?.[0]?.id;
  }

  if (userId) {
    await syncProfile(userId, email, input.role, input.phone, input.fullName, input.companyId);
  }
  await saveRemoteSecret(email, password, input.role, input.companyId, input.fullName);

  if (signed.error && /already|registered|exists/i.test(signed.error.message) && rpc.error) {
    return {
      ok: true,
      userId,
      message: 'Hesap zaten vardı. Şifreyi Auth tarafında güncellemek için SQL migration uygulanmalı.',
    };
  }

  return { ok: true, userId };
}

async function syncProfile(
  userId: string,
  email: string,
  role: AppUserRole,
  phone?: string,
  fullName?: string,
  companyId?: string | null,
) {
  const upsert = await supabase.rpc('admin_upsert_profile', {
    p_id: userId,
    p_email: email,
    p_phone: phone ?? '',
    p_role: role,
    p_company_id: companyId ?? null,
  });
  if (!upsert.error) return;

  await supabase.from('profiles').upsert({
    id: userId,
    email,
    role,
    full_name: fullName || null,
  });
}

async function saveRemoteSecret(
  email: string,
  password: string,
  kind: AppUserRole,
  companyId?: string | null,
  label?: string,
) {
  await supabase.from('admin_login_secrets').upsert({
    email,
    password,
    kind,
    company_id: companyId ?? null,
    label: label ?? null,
    updated_at: new Date().toISOString(),
  });
}

export async function loadRemoteSecrets(): Promise<Record<string, string>> {
  if (!isSupabaseConfigured) return {};
  const { data, error } = await supabase.from('admin_login_secrets').select('email, password');
  if (error || !data) return {};
  return Object.fromEntries(
    data
      .filter((row) => row.email && row.password)
      .map((row) => [String(row.email).toLowerCase(), String(row.password)]),
  );
}
