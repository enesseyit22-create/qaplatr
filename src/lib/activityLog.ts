import { isSupabaseConfigured, supabase } from '@/lib/supabase';

export async function recordActivity(
  action: string,
  details: Record<string, unknown> = {},
  companyId?: string | null,
) {
  if (!isSupabaseConfigured) return;
  const { error } = await supabase.rpc('log_activity', {
    p_action: action,
    p_company: companyId ?? null,
    p_details: details,
  });
  if (error) console.warn('Aktivite kaydı yazılamadı', error.message);
}
