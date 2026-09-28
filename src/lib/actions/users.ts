import { loadRemoteSecrets, provisionLoginAccount } from '@/lib/provisionAuth';
import {
  mergeById,
  readAllLocalRedemptions,
  readLocalUsers,
  removeLocalUser,
  secretMap,
  upsertLocalUser,
} from '@/lib/adminStore';
import type { AppUser, AppUserRole, UserRedemption } from '@/lib/campaigns';
import { joinFullName } from '@/lib/auth';
import { isSupabaseConfigured, supabase } from '@/lib/supabase';
import { asUuid } from '@/lib/uuid';

const USER_SQL_HINT = 'Kullanıcı fonksiyonları eski. SQL Editor’da 20260928240000_uuid_user_ids_story_fk.sql dosyasını çalıştırın.';

function userRpcError(error: { code?: string; message: string }) {
  return new Error(error.code === '42883' ? USER_SQL_HINT : error.message);
}

export type ProfileInput = {
  id?: string;
  email: string;
  phone: string;
  role: AppUserRole;
  company_id?: string | null;
  password?: string;
  first_name?: string;
  last_name?: string;
};

function localUser(input: ProfileInput, existing?: AppUser): AppUser {
  return {
    id: existing?.id ?? input.id ?? crypto.randomUUID(),
    email: input.email.trim().toLowerCase(),
    phone: input.phone.trim(),
    first_name: input.first_name ?? existing?.first_name ?? null,
    last_name: input.last_name ?? existing?.last_name ?? null,
    full_name: joinFullName(input.first_name ?? existing?.first_name, input.last_name ?? existing?.last_name) || existing?.full_name || null,
    role: input.role,
    company_id: input.company_id ?? existing?.company_id ?? null,
    login_password: input.password ?? existing?.login_password ?? null,
    created_at: existing?.created_at ?? new Date().toISOString(),
  };
}

export async function listAdminUsers(): Promise<AppUser[]> {
  let remote: AppUser[] = [];
  if (isSupabaseConfigured) {
    const { data, error } = await supabase.rpc('admin_list_profiles');
    if (!error) {
      remote = ((data as AppUser[]) ?? []).map((row) => ({
        ...row,
        phone: row.phone ?? '',
        first_name: row.first_name ?? null,
        last_name: row.last_name ?? null,
        full_name: row.full_name ?? null,
        role: (row.role as AppUserRole) || 'user',
        company_id: row.company_id ?? null,
        vip: Boolean((row as AppUser).vip),
        city: row.city ?? null,
      }));
    } else {
      const table = await supabase.from('profiles').select('*').order('created_at', { ascending: false });
      if (!table.error) {
        remote = ((table.data as AppUser[]) ?? []).map((row) => ({
          ...row,
          phone: row.phone ?? '',
          first_name: row.first_name ?? null,
          last_name: row.last_name ?? null,
          full_name: row.full_name ?? null,
          role: (row.role as AppUserRole) || 'user',
        company_id: row.company_id ?? null,
        vip: Boolean((row as AppUser).vip),
        city: (row as AppUser).city ?? null,
        }));
      }
    }
  }
  const passwords = { ...secretMap(), ...(await loadRemoteSecrets()) };
  return mergeById(remote, readLocalUsers())
    .map((row) => ({
      ...row,
      login_password: row.login_password || passwords[row.email.trim().toLowerCase()] || null,
    }))
    .sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());
}

export async function upsertAdminUser(input: ProfileInput): Promise<AppUser> {
  const existing = (await listAdminUsers()).find(
    (item) => item.id === input.id || item.email === input.email.trim().toLowerCase(),
  );

  if (input.password && input.password.length >= 6) {
    const provisioned = await provisionLoginAccount({
      email: input.email,
      password: input.password,
      role: input.role,
      phone: input.phone,
      fullName: joinFullName(input.first_name, input.last_name) || undefined,
      companyId: input.company_id,
    });
    if (!provisioned.ok) {
      throw new Error(provisioned.message ?? 'Giriş hesabı oluşturulamadı.');
    }
    if (provisioned.userId && !input.id) {
      input = { ...input, id: provisioned.userId };
    }
  }

  if (isSupabaseConfigured) {
    const companyId = input.company_id ? asUuid(input.company_id) : null;
    if (input.company_id && !companyId) throw new Error('Firma kaydı bulunamadı.');
    const { data, error } = await supabase.rpc('admin_upsert_profile', {
      p_id: asUuid(input.id ?? existing?.id),
      p_email: input.email,
      p_phone: input.phone,
      p_role: input.role,
      p_company_id: companyId,
    });
    if (error && !/admin_upsert_profile|schema cache/i.test(error.message)) {
      throw userRpcError(error);
    }
    if (!error && data) {
      const row = data as AppUser;
      const saved = {
        ...row,
        phone: row.phone ?? '',
        company_id: row.company_id ?? null,
        login_password: input.password || existing?.login_password || null,
        first_name: input.first_name ?? existing?.first_name ?? null,
        last_name: input.last_name ?? existing?.last_name ?? null,
        full_name: joinFullName(input.first_name, input.last_name) || existing?.full_name || null,
      };
      upsertLocalUser(saved);
      if (saved.id) {
        await supabase.from('profiles').upsert({
          id: saved.id,
          email: input.email.trim().toLowerCase(),
          role: input.role,
          full_name: saved.full_name,
        });
      }
      return saved;
    }
  }

  const row = localUser(input, existing);
  upsertLocalUser(row);
  return row;
}

export async function deleteAdminUser(id: string): Promise<void> {
  const profileId = asUuid(id);
  if (isSupabaseConfigured && profileId) {
    const deleted = await supabase.rpc('admin_delete_profile', { p_id: profileId });
    if (deleted.error) throw userRpcError(deleted.error);
  }
  removeLocalUser(id);
}

export async function listAdminRedemptions(): Promise<UserRedemption[]> {
  let remote: UserRedemption[] = [];
  if (isSupabaseConfigured) {
    const { data, error } = await supabase.rpc('admin_list_redemptions');
    if (!error) remote = (data as UserRedemption[]) ?? [];
  }
  return mergeById(remote, readAllLocalRedemptions()).sort(
    (a, b) => new Date(b.redeemed_at).getTime() - new Date(a.redeemed_at).getTime(),
  );
}
