import { isSupabaseConfigured, supabase } from '@/lib/supabase';

export async function saveCompanyFcmToken(companyId: string, userId: string, token: string): Promise<void> {
  if (!isSupabaseConfigured || !companyId || !userId || !token.trim()) return;
  const value = token.trim();
  const saved = await supabase.rpc('register_company_push', { p_company: companyId, p_token: value });
  if (!saved.error) return;
  await supabase.from('company_push_tokens').delete().eq('fcm_token', value).eq('user_id', userId);
  const fallback = await supabase.from('company_push_tokens').upsert(
    { company_id: companyId, user_id: userId, fcm_token: value, updated_at: new Date().toISOString() },
    { onConflict: 'company_id,user_id' },
  );
  if (fallback.error) console.warn('Firma FCM token kaydı başarısız', saved.error.message, fallback.error.message);
}

export type PushDispatchResult = {
  ok: boolean;
  sent: number;
  targets: number;
  queued: number;
  message: string;
};

function readablePushError(error: unknown) {
  const raw = error instanceof Error ? error.message : '';
  if (/failed to send a request to the edge function/i.test(raw) || /failed to fetch/i.test(raw) || /functionsrelayerror/i.test(raw)) {
    return 'Anlık push servisi şu an kapalı. Bildirim kayda alındı.';
  }
  return raw || 'Push servisi çağrılamadı';
}

export async function requestPushDispatch(): Promise<PushDispatchResult> {
  if (!isSupabaseConfigured) {
    return { ok: false, sent: 0, targets: 0, queued: 0, message: 'Supabase yapılandırılmamış' };
  }
  try {
    const { data, error } = await supabase.functions.invoke('dispatch-push', { body: {} });
    if (error) {
      console.error('Bildirim push servisi çağrılamadı', error.message, error);
      return { ok: false, sent: 0, targets: 0, queued: 0, message: readablePushError(error) };
    }
    const sent = Number(data?.sent ?? 0);
    const targets = Number(data?.targets ?? 0);
    const queued = Number(data?.queued ?? 0);
    const remoteError = String(data?.error ?? data?.message ?? '').trim();
    if (!data?.ok) {
      console.error('Bildirim push servisi hata döndü', data);
      return { ok: false, sent, targets, queued, message: remoteError || 'Push servisi bildirimi iletmedi' };
    }
    if (queued === 0) {
      const message = 'Bildirim kayda geçti ama push kuyruğu boş. SQL tetikleyicisini çalıştırın.';
      console.error(message, data);
      return { ok: false, sent, targets, queued, message };
    }
    if (targets === 0 || remoteError) {
      const message = remoteError === 'hedef cihaz yok'
        ? 'Bu kitle için kayıtlı cihaz tokenı yok. Uygulamayı açıp bildirim iznini verin.'
        : remoteError || 'Hedef cihaza push iletilemedi';
      console.error('Bildirim hedefe gitmedi', { sent, targets, queued, message, data });
      return { ok: false, sent, targets, queued, message };
    }
    if (sent === 0) {
      const message = 'FCM gönderimi başarısız. FIREBASE_SERVICE_ACCOUNT sırrını kontrol edin.';
      console.error(message, data);
      return { ok: false, sent, targets, queued, message };
    }
    return { ok: true, sent, targets, queued, message: '' };
  } catch (error) {
    console.error('Bildirim push servisi çağrılamadı', error);
    return {
      ok: false,
      sent: 0,
      targets: 0,
      queued: 0,
      message: readablePushError(error),
    };
  }
}

export async function notifyCompanyOfFollow(companyId: string): Promise<void> {
  if (!isSupabaseConfigured || !companyId) return;
  await requestPushDispatch();
}
