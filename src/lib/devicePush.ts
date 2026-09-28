import { Capacitor } from '@capacitor/core';
import { saveAdminFcmToken } from '@/lib/adminSettings';
import { saveCompanyFcmToken } from '@/lib/companyPush';
import { pushLocalNotice } from '@/lib/notices';
import { isSupabaseConfigured, supabase } from '@/lib/supabase';

const TOKEN_KEY = 'qapla_fcm_token';

export type PushIdentity = {
  userId: string | null;
  companyId: string | null;
  role: string | null;
};

type PushHandle = { remove: () => Promise<void> };

let identity: PushIdentity = { userId: null, companyId: null, role: null };
let lastToken = '';
let generation = 0;
let handles: PushHandle[] = [];

function rememberToken(token: string) {
  lastToken = token.trim();
  if (!lastToken) return;
  try {
    localStorage.setItem(TOKEN_KEY, lastToken);
  } catch {
    /* depolama kapalıysa oturum içi token yeter */
  }
}

function readStoredToken() {
  if (lastToken) return lastToken;
  try {
    lastToken = localStorage.getItem(TOKEN_KEY)?.trim() ?? '';
  } catch {
    lastToken = '';
  }
  return lastToken;
}

export async function saveDevicePushToken(next: PushIdentity, token: string): Promise<void> {
  const value = token.trim();
  if (!isSupabaseConfigured || !value) return;
  const session = await supabase.auth.getUser();
  const userId = session.data.user?.id || next.userId?.trim() || '';
  const role = userId ? (next.role === 'admin' || next.role === 'merchant' || next.role === 'user' ? next.role : 'user') : 'guest';
  const companyId = role === 'merchant' ? (next.companyId?.trim() || null) : null;
  const registered = await supabase.rpc('register_device_push', {
    p_token: value,
    p_company: companyId,
    p_platform: Capacitor.getPlatform(),
    p_role: role,
  });
  if (registered.error) {
    const row = {
      user_id: userId || null,
      fcm_token: value,
      company_id: companyId,
      platform: Capacitor.getPlatform(),
      role,
      updated_at: new Date().toISOString(),
    };
    const saved = await supabase.from('device_push_tokens').upsert(row, { onConflict: 'user_id,fcm_token' });
    const moved = saved.error
      ? await supabase.from('device_push_tokens').upsert(row, { onConflict: 'fcm_token' })
      : null;
    if (saved.error && moved?.error) {
      console.warn('FCM token kaydı başarısız', registered.error.message, moved.error.message);
    }
  }
  if (next.role === 'admin') {
    await saveAdminFcmToken(userId, value);
  }
  if (companyId) {
    await saveCompanyFcmToken(companyId, userId, value);
  }
}

let lastAreaAt = 0;

export async function rememberDeviceArea(latitude: number, longitude: number) {
  if (!isSupabaseConfigured || !Number.isFinite(latitude) || !Number.isFinite(longitude)) return;
  const now = Date.now();
  if (now - lastAreaAt < 60_000) return;
  const token = readStoredToken();
  if (!token) return;
  lastAreaAt = now;
  const saved = await supabase.rpc('touch_device_location', {
    p_token: token,
    p_lat: latitude,
    p_lng: longitude,
  });
  if (saved.error) lastAreaAt = 0;
}

export async function flushDevicePushToken(next?: PushIdentity) {
  if (next) {
    identity = {
      userId: next.userId?.trim() || null,
      companyId: next.companyId?.trim() || null,
      role: next.role ?? null,
    };
  }
  const token = readStoredToken();
  if (!token) return;
  try {
    await saveDevicePushToken(identity, token);
  } catch {
    /* tablo henüz yoksa oturumu bozma */
  }
}

function showIncoming(title: string, body: string) {
  const safeTitle = title.trim() || 'QapLA';
  const safeBody = body.trim();
  if (!safeTitle && !safeBody) return;
  pushLocalNotice({ title: safeTitle, body: safeBody || safeTitle });
}

export function syncPushIdentity(next: PushIdentity) {
  identity = {
    userId: next.userId?.trim() || null,
    companyId: next.companyId?.trim() || null,
    role: next.role ?? null,
  };
  if (!Capacitor.isNativePlatform()) return;
  void flushDevicePushToken();
}

export async function startDevicePush(): Promise<void> {
  if (!Capacitor.isNativePlatform()) return;
  const run = ++generation;
  try {
    const { PushNotifications } = await import('@capacitor/push-notifications');
    if (run !== generation) return;
    const registration = await PushNotifications.addListener('registration', (event) => {
      rememberToken(event.value ?? '');
      void flushDevicePushToken();
    });
    const registrationError = await PushNotifications.addListener('registrationError', (error) => {
      console.warn('FCM kaydı başarısız', error.error);
    });
    const received = await PushNotifications.addListener('pushNotificationReceived', (notification) => {
      const data = notification.data ?? {};
      showIncoming(
        notification.title || String(data.title ?? ''),
        notification.body || String(data.body ?? ''),
      );
    });
    const action = await PushNotifications.addListener('pushNotificationActionPerformed', (event) => {
      const notification = event.notification;
      const data = notification?.data ?? {};
      showIncoming(
        notification?.title || String(data.title ?? ''),
        notification?.body || String(data.body ?? ''),
      );
    });
    if (run !== generation) {
      await Promise.all([registration, registrationError, received, action].map((handle) => handle.remove().catch(() => undefined)));
      return;
    }
    handles = [registration, registrationError, received, action];

    let status = await PushNotifications.checkPermissions();
    if (run !== generation) return;
    if (status.receive !== 'granted') {
      status = await PushNotifications.requestPermissions();
    }
    if (run !== generation) return;
    if (status.receive === 'granted') {
      try {
        await PushNotifications.createChannel({
          id: 'qapla_alerts',
          name: 'QapLA bildirimleri',
          description: 'Kampanya ve kupon',
          importance: 5,
          visibility: 1,
          sound: 'default',
          vibration: true,
        });
      } catch (channelError) {
        console.warn('Bildirim kanalı kurulamadı', channelError);
      }
      await PushNotifications.register();
    }
  } catch (error) {
    console.warn('Push başlatılamadı', error);
  }
}

export async function stopDevicePush() {
  generation += 1;
  const current = handles;
  handles = [];
  await Promise.all(current.map(async (handle) => {
    try {
      await handle.remove();
    } catch {
      /* dinleyici zaten kalkmış olabilir */
    }
  }));
}
