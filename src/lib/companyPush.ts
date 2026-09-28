import { isSupabaseConfigured, supabase } from '@/lib/supabase';

export async function saveCompanyFcmToken(companyId: string, userId: string, token: string): Promise<void> {
  if (!isSupabaseConfigured || !companyId || !userId || !token.trim()) return;
  await supabase.from('company_push_tokens').upsert(
    { company_id: companyId, user_id: userId, fcm_token: token.trim(), updated_at: new Date().toISOString() },
    { onConflict: 'company_id,user_id' },
  );
}

export async function requestPushDispatch(): Promise<void> {
  if (!isSupabaseConfigured) return;
  try {
    await supabase.functions.invoke('dispatch-push', { body: {} });
  } catch {
    /* kuyruk durur, takip veya kampanya kaydı bozulmasın */
  }
}

export async function notifyCompanyOfFollow(companyId: string): Promise<void> {
  if (!isSupabaseConfigured || !companyId) return;
  await requestPushDispatch();
}
