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
  const userId = next.userId?.trim() ?? '';
  if (!isSupabaseConfigured || !userId || !value) return;
  const companyId = next.role === 'merchant' ? (next.companyId?.trim() || null) : null;
  await supabase.from('device_push_tokens').upsert(
    {
      user_id: userId,
      fcm_token: value,
      company_id: companyId,
      platform: Capacitor.getPlatform(),
      updated_at: new Date().toISOString(),
    },
    { onConflict: 'user_id,fcm_token' },
  );
  if (next.role === 'admin') {
    await saveAdminFcmToken(userId, value);
  }
  if (companyId) {
    await saveCompanyFcmToken(companyId, userId, value);
  }
}

async function persistCurrentToken() {
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
  void persistCurrentToken();
}

export async function startDevicePush(): Promise<void> {
  if (!Capacitor.isNativePlatform()) return;
  const run = ++generation;
  try {
    const { PushNotifications } = await import('@capacitor/push-notifications');
    if (run !== generation) return;
    const registration = await PushNotifications.addListener('registration', (event) => {
      rememberToken(event.value ?? '');
      void persistCurrentToken();
    });
    const registrationError = await PushNotifications.addListener('registrationError', () => {
      /* izin veya FCM yapılandırması yoksa uygulama açılışını bozma */
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
      await PushNotifications.register();
    }
  } catch {
    /* web veya eksik native plugin */
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
