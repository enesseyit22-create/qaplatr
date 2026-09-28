import { isSupabaseConfigured, supabase } from '@/lib/supabase';

export type AdminNotifySettings = {
  admin_id: string;
  notify_user_signup: boolean;
  notify_business_signup: boolean;
  fcm_token: string | null;
};

const defaults = (adminId: string): AdminNotifySettings => ({
  admin_id: adminId,
  notify_user_signup: true,
  notify_business_signup: true,
  fcm_token: null,
});

function asSettings(row: Record<string, unknown> | null | undefined, adminId: string): AdminNotifySettings {
  if (!row) return defaults(adminId);
  return {
    admin_id: String(row.admin_id ?? adminId),
    notify_user_signup: row.notify_user_signup !== false,
    notify_business_signup: row.notify_business_signup !== false,
    fcm_token: (row.fcm_token as string | null) ?? null,
  };
}

export async function loadAdminNotifySettings(adminId: string): Promise<AdminNotifySettings> {
  if (!isSupabaseConfigured || !adminId) return defaults(adminId);
  const { data, error } = await supabase
    .from('admin_settings')
    .select('*')
    .eq('admin_id', adminId)
    .maybeSingle();
  if (error || !data) {
    const seed = defaults(adminId);
    await supabase.from('admin_settings').upsert(seed, { onConflict: 'admin_id' });
    return seed;
  }
  return asSettings(data as Record<string, unknown>, adminId);
}

export async function updateAdminNotifyFlag(
  adminId: string,
  field: 'notify_user_signup' | 'notify_business_signup',
  value: boolean,
): Promise<AdminNotifySettings | null> {
  if (!isSupabaseConfigured || !adminId) return null;
  const { data, error } = await supabase
    .from('admin_settings')
    .upsert(
      { admin_id: adminId, [field]: value },
      { onConflict: 'admin_id' },
    )
    .select('*')
    .maybeSingle();
  if (error) return null;
  return asSettings(data as Record<string, unknown> | null, adminId);
}

export async function saveAdminFcmToken(adminId: string, token: string): Promise<void> {
  if (!isSupabaseConfigured || !adminId || !token.trim()) return;
  await supabase.from('admin_settings').upsert(
    { admin_id: adminId, fcm_token: token.trim() },
    { onConflict: 'admin_id' },
  );
}

export async function notifyAdminsOfSignup(kind: 'user' | 'business'): Promise<void> {
  if (!isSupabaseConfigured) return;
  if (kind === 'user') {
    try {
      await supabase.rpc('notify_admins_signup', { p_kind: 'user' });
    } catch {
      /* RPC yoksa push dene */
    }
  }
  try {
    await supabase.functions.invoke('notify-admin', { body: { kind } });
  } catch {
    /* fonksiyon yoksa kaydı bozma */
  }
}
