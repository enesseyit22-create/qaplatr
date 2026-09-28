import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

type PushRow = {
  id: string;
  kind: string;
  title: string;
  body: string;
  company_id: string | null;
  payload: Record<string, unknown> | null;
};

// deno-lint-ignore no-explicit-any
type AdminClient = any;

type DeviceRow = {
  fcm_token?: string;
  user_id?: string | null;
  role?: string | null;
  company_id?: string | null;
};

const FCM_CHANNEL = 'qapla_alerts';

type DevicePlatform = 'android' | 'ios' | 'web' | 'unknown';

type ParsedToken = {
  token: string;
  platform: DevicePlatform;
  role: string;
  userId: string;
  companyId: string;
  latitude?: number;
  longitude?: number;
};

function asRecord(value: unknown): Record<string, unknown> | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  return value as Record<string, unknown>;
}

function readNumber(row: Record<string, unknown>, keys: string[]) {
  for (const key of keys) {
    const value = row[key];
    const parsed = typeof value === 'number' ? value : Number(value);
    if (Number.isFinite(parsed)) return parsed;
  }
  return undefined;
}

function readText(row: Record<string, unknown>, keys: string[]) {
  for (const key of keys) {
    const value = row[key];
    if (typeof value === 'string' && value.trim()) return value.trim();
    if (typeof value === 'number' && Number.isFinite(value)) return String(value);
  }
  return '';
}

function parsePlatform(value: unknown): DevicePlatform {
  const raw = String(value ?? '').trim().toLowerCase();
  if (raw === 'android' || raw === 'and' || raw === 'aos') return 'android';
  if (raw === 'ios' || raw === 'iphone' || raw === 'ipad' || raw === 'apple') return 'ios';
  if (raw === 'web' || raw === 'browser' || raw === 'pwa') return 'web';
  return 'unknown';
}

function parsePayload(value: unknown, source: string, depth = 0): Record<string, unknown> {
  if (depth > 3) return {};
  try {
    let current = value;
    if (typeof current === 'string') {
      const trimmed = current.trim();
      if (!trimmed) return {};
      current = JSON.parse(trimmed);
    }
    const record = asRecord(current);
    if (!record) {
      if (current != null) {
        console.error('dispatch-push payload nesne değil', {
          source,
          type: Array.isArray(current) ? 'array' : typeof current,
        });
      }
      return {};
    }
    const nested = record.payload ?? record.data ?? record.message;
    if (typeof nested === 'string' && nested.trim().startsWith('{')) {
      console.log('dispatch-push iç içe payload metni açıldı', { source });
      return { ...record, ...parsePayload(nested, `${source}.payload`, depth + 1) };
    }
    const nestedRecord = asRecord(nested);
    if (nestedRecord && !record.audience && !record.userId && !record.user_id) {
      console.log('dispatch-push iç içe payload açıldı', { source, keys: Object.keys(nestedRecord) });
      return { ...record, ...nestedRecord };
    }
    return record;
  } catch (error) {
    console.error('dispatch-push payload ayrıştırılamadı', {
      source,
      error: error instanceof Error ? error.message : String(error),
    });
    return {};
  }
}

function parseTokenRow(row: unknown, source: string): ParsedToken | null {
  try {
    if (typeof row === 'string') {
      const token = row.trim();
      if (!token) return null;
      return { token, platform: 'unknown', role: '', userId: '', companyId: '' };
    }
    const record = asRecord(row);
    if (!record) return null;
    const token = readText(record, [
      'fcm_token', 'fcmToken', 'token', 'registration_token', 'registrationToken',
      'device_token', 'deviceToken', 'push_token', 'pushToken',
    ]);
    if (!token) return null;
    const platform = parsePlatform(readText(record, ['platform', 'os', 'device_platform', 'devicePlatform']));
    return {
      token,
      platform,
      role: readText(record, ['role', 'p_role']) || 'guest',
      userId: readText(record, ['user_id', 'userId', 'uid']),
      companyId: readText(record, ['company_id', 'companyId', 'business_id', 'businessId']),
      latitude: readNumber(record, ['latitude', 'lat']),
      longitude: readNumber(record, ['longitude', 'lng', 'lon']),
    };
  } catch (error) {
    console.error('dispatch-push token satırı okunamadı', {
      source,
      error: error instanceof Error ? error.message : String(error),
    });
    return null;
  }
}

function parseDeviceList(rows: unknown, source: string): ParsedToken[] {
  try {
    if (typeof rows === 'string' || (asRecord(rows) && readText(asRecord(rows) ?? {}, ['fcm_token', 'fcmToken', 'token', 'registration_token', 'device_token', 'push_token']))) {
      const one = parseTokenRow(rows, source);
      const parsed = one ? [one] : [];
      if (parsed.length) {
        console.log('dispatch-push cihaz', {
          source,
          platform: parsed[0].platform,
          role: parsed[0].role || 'guest',
          token: `${parsed[0].token.slice(0, 8)}…`,
        });
      }
      return parsed;
    }
    const record = asRecord(rows);
    const list = Array.isArray(rows)
      ? rows
      : Array.isArray(record?.data)
        ? record.data as unknown[]
        : Array.isArray(record?.tokens)
          ? record.tokens as unknown[]
          : Array.isArray(record?.devices)
            ? record.devices as unknown[]
            : [];
    const parsed = uniqueTokens(list.map((row) => parseTokenRow(row, source)).filter((row): row is ParsedToken => Boolean(row)));
    const platforms = parsed.reduce<Record<string, number>>((sum, item) => {
      sum[item.platform] = (sum[item.platform] ?? 0) + 1;
      return sum;
    }, {});
    console.log('dispatch-push token özeti', { source, count: parsed.length, platforms });
    parsed.slice(0, 40).forEach((item) => {
      console.log('dispatch-push cihaz', {
        source,
        platform: item.platform,
        role: item.role || 'guest',
        userId: item.userId || null,
        companyId: item.companyId || null,
        token: `${item.token.slice(0, 8)}…`,
      });
    });
    if (parsed.length > 40) console.log('dispatch-push cihaz günlüğü kısaldı', { source, hidden: parsed.length - 40 });
    return parsed;
  } catch (error) {
    console.error('dispatch-push token listesi ayrıştırılamadı', {
      source,
      error: error instanceof Error ? error.message : String(error),
    });
    return [];
  }
}

function uniqueTokens(items: ParsedToken[]) {
  const seen = new Set<string>();
  const out: ParsedToken[] = [];
  let dropped = 0;
  for (const item of items) {
    const token = item.token.trim();
    if (!token || seen.has(token)) {
      if (token) dropped += 1;
      continue;
    }
    seen.add(token);
    out.push({ ...item, token });
  }
  if (dropped > 0) console.log('dispatch-push mükerrer token elendi', { dropped, kept: out.length });
  return out;
}

function toFcmData(data: Record<string, unknown>) {
  const out: Record<string, string> = {};
  try {
    for (const [key, value] of Object.entries(data)) {
      if (value == null) out[key] = '';
      else if (typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean') out[key] = String(value);
      else {
        try {
          out[key] = JSON.stringify(value);
        } catch {
          out[key] = '';
        }
      }
    }
  } catch (error) {
    console.error('dispatch-push fcm verisi kurulamadı', {
      error: error instanceof Error ? error.message : String(error),
    });
  }
  return out;
}

async function companyTokens(admin: AdminClient, companyId: string) {
  const [owned, devices] = await Promise.all([
    admin.from('company_push_tokens').select('*').eq('company_id', companyId),
    admin.from('device_push_tokens').select('*').eq('company_id', companyId),
  ]);
  return uniqueTokens([
    ...parseDeviceList(owned.data, 'company_push_tokens'),
    ...parseDeviceList(devices.data, 'device_push_tokens.company'),
  ]);
}

async function followerTokens(admin: AdminClient, companyId: string) {
  const follows = await admin.from('follows').select('user_id').eq('business_id', companyId);
  if (follows.error) throw new Error(follows.error.message);
  const userIds = [...new Set((follows.data ?? []).map((row: { user_id?: string | null }) => String(row.user_id ?? '').trim()).filter(Boolean))];
  if (userIds.length === 0) return [];
  const devices = await admin.from('device_push_tokens').select('*').in('user_id', userIds);
  if (devices.error) throw new Error(devices.error.message);
  return parseDeviceList(devices.data, 'device_push_tokens.followers');
}

function pemToBytes(pem: string) {
  const body = pem.replace(/-----BEGIN PRIVATE KEY-----/g, '').replace(/-----END PRIVATE KEY-----/g, '').replace(/\s/g, '');
  const binary = atob(body);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i += 1) bytes[i] = binary.charCodeAt(i);
  return bytes;
}

function b64url(input: string | Uint8Array) {
  const bytes = typeof input === 'string' ? new TextEncoder().encode(input) : input;
  let raw = '';
  for (const byte of bytes) raw += String.fromCharCode(byte);
  return btoa(raw).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/g, '');
}

let cachedAccess: { accessToken: string; projectId: string; exp: number } | null = null;

async function fcmAccessToken() {
  const raw = Deno.env.get('FIREBASE_SERVICE_ACCOUNT') ?? '';
  if (!raw.trim()) return null;
  if (cachedAccess && cachedAccess.exp > Date.now() + 60_000) return cachedAccess;
  let account: { client_email?: string; private_key?: string; project_id?: string };
  try {
    account = JSON.parse(raw) as { client_email?: string; private_key?: string; project_id?: string };
  } catch (error) {
    console.error('dispatch-push FCM kimliği okunamadı', {
      error: error instanceof Error ? error.message : String(error),
    });
    return null;
  }
  if (!account.client_email || !account.private_key) return null;
  const now = Math.floor(Date.now() / 1000);
  const header = b64url(JSON.stringify({ alg: 'RS256', typ: 'JWT' }));
  const claim = b64url(JSON.stringify({
    iss: account.client_email,
    scope: 'https://www.googleapis.com/auth/firebase.messaging',
    aud: 'https://oauth2.googleapis.com/token',
    iat: now,
    exp: now + 3600,
  }));
  const key = await crypto.subtle.importKey(
    'pkcs8',
    pemToBytes(account.private_key),
    { name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256' },
    false,
    ['sign'],
  );
  const signature = new Uint8Array(await crypto.subtle.sign(
    'RSASSA-PKCS1-v1_5',
    key,
    new TextEncoder().encode(`${header}.${claim}`),
  ));
  const jwt = `${header}.${claim}.${b64url(signature)}`;
  const tokenRes = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer',
      assertion: jwt,
    }),
  });
  if (!tokenRes.ok) return null;
  const json = await tokenRes.json() as { access_token?: string };
  if (!json.access_token) return null;
  cachedAccess = {
    accessToken: json.access_token,
    projectId: account.project_id || Deno.env.get('FCM_PROJECT_ID') || 'qlap-17301',
    exp: Date.now() + 50 * 60 * 1000,
  };
  return cachedAccess;
}

function isStaleFcmError(status: number, detail: string) {
  const hay = detail.toUpperCase();
  return status === 404
    || hay.includes('NOT_FOUND')
    || hay.includes('UNREGISTERED')
    || hay.includes('NOTREGISTERED')
    || hay.includes('NOT_REGISTERED');
}

async function sendFcm(token: string, title: string, body: string, data: Record<string, string>) {
  const v1 = await fcmAccessToken();
  if (v1) {
    const res = await fetch(`https://fcm.googleapis.com/v1/projects/${v1.projectId}/messages:send`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${v1.accessToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        message: {
          token,
          notification: { title, body },
          data,
          android: {
            priority: 'HIGH',
            notification: { channel_id: FCM_CHANNEL, sound: 'default', icon: 'ic_stat_qapla', color: '#14B8A6' },
          },
          apns: { payload: { aps: { sound: 'default' } } },
        },
      }),
    });
    if (!res.ok) {
      const detail = (await res.text()).slice(0, 400);
      return { error: `fcm-v1 ${res.status} ${detail.slice(0, 180)}`, stale: isStaleFcmError(res.status, detail) };
    }
    return { error: '', stale: false };
  }

  const key = Deno.env.get('FCM_SERVER_KEY') ?? Deno.env.get('FIREBASE_SERVER_KEY') ?? '';
  if (!key) return { error: 'FCM kimliği yok', stale: false };
  const res = await fetch('https://fcm.googleapis.com/fcm/send', {
    method: 'POST',
    headers: {
      Authorization: `key=${key}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      to: token,
      priority: 'high',
      notification: { title, body, sound: 'default', android_channel_id: FCM_CHANNEL, icon: 'ic_stat_qapla', color: '#14B8A6' },
      data,
    }),
  });
  const detail = (await res.text()).slice(0, 400);
  if (!res.ok) {
    return { error: `fcm-legacy ${res.status} ${detail.slice(0, 180)}`, stale: isStaleFcmError(res.status, detail) };
  }
  return { error: '', stale: isStaleFcmError(200, detail) && /NotRegistered|NOT_FOUND|UNREGISTERED/i.test(detail) };
}

async function dropStaleToken(admin: AdminClient, token: string) {
  const [devices, firms] = await Promise.all([
    admin.from('device_push_tokens').delete().eq('fcm_token', token),
    admin.from('company_push_tokens').delete().eq('fcm_token', token),
  ]);
  if (devices.error) console.error('Geçersiz cihaz token silinemedi', devices.error.message);
  if (firms.error) console.error('Geçersiz firma token silinemedi', firms.error.message);
  else console.error('Kayıtsız FCM token silindi', { token: `${token.slice(0, 8)}…` });
}

function deviceBucket(row: ParsedToken, adminIds: Set<string>): 'guest' | 'user' | 'merchant' | 'admin' {
  const role = row.role.trim();
  const userId = row.userId.trim();
  if (role === 'admin' || (userId && adminIds.has(userId))) return 'admin';
  if (role === 'merchant' || row.companyId) return 'merchant';
  if (role === 'guest' || !userId) return 'guest';
  return 'user';
}

async function noticeBatches(admin: AdminClient, audience: string, companyId = '') {
  const groups = audience === 'all' ? ['guests', 'users', 'merchants'] : [audience];
  const seen = new Set<string>();
  const batches: { audience: string; tokens: ParsedToken[] }[] = [];
  for (const group of groups) {
    const tokens = (await noticeTokens(admin, group, group === 'merchants' ? companyId : '')).filter((item) => {
      if (seen.has(item.token)) return false;
      seen.add(item.token);
      return true;
    });
    batches.push({ audience: group, tokens });
  }
  return batches;
}

async function noticeTokens(admin: AdminClient, audience: string, companyId = '') {
  if (audience === 'merchants' && companyId) {
    return companyTokens(admin, companyId);
  }
  const [devices, profiles, companies] = await Promise.all([
    admin.from('device_push_tokens').select('*'),
    admin.from('profiles').select('id,auth_user_id,role'),
    audience === 'merchants' || audience === 'all'
      ? admin.from('company_push_tokens').select('*')
      : Promise.resolve({ data: [], error: null }),
  ]);
  if (devices.error) throw new Error(devices.error.message);
  const adminIds = new Set<string>();
  for (const profile of profiles.data ?? []) {
    if (String(profile.role ?? '') !== 'admin') continue;
    if (profile.id) adminIds.add(String(profile.id));
    if (profile.auth_user_id) adminIds.add(String(profile.auth_user_id));
  }
  const rows = parseDeviceList(devices.data, `device_push_tokens.${audience || 'all'}`);
  const picked = audience === 'admin'
    ? rows.filter((row) => deviceBucket(row, adminIds) === 'admin')
    : audience === 'guests'
      ? rows.filter((row) => deviceBucket(row, adminIds) === 'guest')
      : audience === 'users'
        ? rows.filter((row) => deviceBucket(row, adminIds) === 'user')
        : audience === 'merchants'
          ? rows.filter((row) => deviceBucket(row, adminIds) === 'merchant')
          : rows;
  const firmTokens = audience === 'merchants' || audience === 'all'
    ? parseDeviceList(companies.data, 'company_push_tokens')
    : [];
  return uniqueTokens([...picked, ...firmTokens]);
}

async function writeNotificationLog(
  admin: AdminClient,
  entry: { noticeId: string; audience: string; kind: string; targets: number; sent: number; error: string },
) {
  const { error } = await admin.from('notification_logs').insert({
    notice_id: entry.noticeId || null,
    audience: entry.audience,
    kind: entry.kind,
    targets: entry.targets,
    sent: entry.sent,
    error: entry.error || null,
  });
  if (error) console.error('notification_logs yazılamadı', error.message, entry);
  else if (entry.error || entry.sent < entry.targets) console.error('Bildirim push hatası', entry);
}

function distanceMeters(lat1: number, lng1: number, lat2: number, lng2: number) {
  const earth = 6371000;
  const p1 = lat1 * Math.PI / 180;
  const p2 = lat2 * Math.PI / 180;
  const dLat = (lat2 - lat1) * Math.PI / 180;
  const dLng = (lng2 - lng1) * Math.PI / 180;
  const a = Math.sin(dLat / 2) ** 2 + Math.cos(p1) * Math.cos(p2) * Math.sin(dLng / 2) ** 2;
  return 2 * earth * Math.asin(Math.min(1, Math.sqrt(a)));
}

async function nearbyTokens(admin: AdminClient, payload: Record<string, unknown>) {
  const lat = Number(payload.latitude ?? payload.lat);
  const lng = Number(payload.longitude ?? payload.lng);
  const radius = Number(payload.radius_m ?? payload.radiusM ?? 2000);
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) return [];
  const devices = await admin.from('device_push_tokens').select('*');
  const parsed = parseDeviceList(devices.data, 'device_push_tokens.nearby');
  const limit = Number.isFinite(radius) && radius > 0 ? radius : 2000;
  const near = parsed.filter((item) => (
    Number.isFinite(item.latitude)
    && Number.isFinite(item.longitude)
    && distanceMeters(lat, lng, Number(item.latitude), Number(item.longitude)) <= limit
  ));
  console.log('dispatch-push bölgesel kitle', { targets: near.length, scanned: parsed.length, radius: limit });
  return near;
}

async function userTokens(admin: AdminClient, userId: string) {
  if (!userId) return [];
  const devices = await admin.from('device_push_tokens').select('*').eq('user_id', userId);
  return parseDeviceList(devices.data, 'device_push_tokens.user');
}

async function deliverOutboxRow(admin: AdminClient, row: PushRow, sentKeys: Set<string>) {
  const payloadRecord = parsePayload(row.payload, `outbox:${row.id || row.kind || 'row'}`);
  const companyId = String(row.company_id ?? payloadRecord.companyId ?? payloadRecord.company_id ?? '').trim();
  const userId = String(payloadRecord.userId ?? payloadRecord.user_id ?? '').trim();
  let audience = String(payloadRecord.audience ?? 'all').trim() || 'all';
  const title = String(row.title ?? payloadRecord.title ?? '').trim() || 'QapLA';
  const body = String(row.body ?? payloadRecord.body ?? '').trim();
  if ((row.kind || 'notice') === 'notice' && /onay bekliyor|firma başvurusu|yeni kullanıcı|yeni üye|kayıt oldu/.test(`${title} ${body}`.toLocaleLowerCase('tr'))) {
    audience = 'admin';
  }
  console.log('dispatch-push kuyruk satırı', {
    id: row.id,
    kind: row.kind || 'notice',
    audience,
    platformHint: parsePlatform(payloadRecord.platform),
    payloadKeys: Object.keys(payloadRecord),
  });
  if ((row.kind || 'notice') !== 'notice' && (row.kind || '') !== 'approval' && !companyId && !((row.kind || '').startsWith('coupon') && userId)) {
    await admin.from('push_outbox').update({
      sent_at: new Date().toISOString(),
      last_error: 'company_id yok',
    }).eq('id', row.id);
    return { sent: 0, targets: 0, error: 'company_id yok' };
  }

  const batches = (row.kind || 'notice') === 'notice'
    ? await noticeBatches(admin, audience, companyId)
    : [{
      audience,
      tokens: (row.kind || '') === 'approval'
        ? await userTokens(admin, userId)
        : (row.kind || '') === 'follow'
          ? await companyTokens(admin, companyId)
          : (row.kind || '') === 'nearby'
            ? await nearbyTokens(admin, payloadRecord)
          : (row.kind || '').startsWith('coupon')
            ? uniqueTokens([...(await userTokens(admin, userId)), ...(await companyTokens(admin, companyId))])
            : await followerTokens(admin, companyId),
    }];
  const payload = toFcmData({
    kind: row.kind || 'notice',
    companyId,
    title,
    body,
    audience,
    ...payloadRecord,
  });

  let sent = 0;
  let failure = '';
  let removed = 0;
  const tokens = batches.flatMap((batch) => batch.tokens);
  for (const batch of batches) {
    console.log('dispatch-push kitle gönderimi', {
      audience: batch.audience,
      targets: batch.tokens.length,
      platforms: batch.tokens.reduce<Record<string, number>>((sum, item) => {
        sum[item.platform] = (sum[item.platform] ?? 0) + 1;
        return sum;
      }, {}),
    });
    let batchSent = 0;
    let batchRemoved = 0;
    let batchFailure = '';
    const pending = batch.tokens.filter((device) => {
      const key = `${device.token}\n${title}\n${body}`;
      if (!sentKeys.has(key)) return true;
      console.log('dispatch-push aynı cihaza tekrar gönderilmedi', {
        audience: batch.audience,
        platform: device.platform,
        token: `${device.token.slice(0, 8)}…`,
      });
      return false;
    });
    for (const device of pending) {
      const result = await sendFcm(device.token, title, body, { ...payload, audience: batch.audience });
      if (!result.error) {
        sentKeys.add(`${device.token}\n${title}\n${body}`);
        sent += 1;
        batchSent += 1;
        if ((row.kind || '') === 'nearby' && batchSent % 25 === 0) {
          await new Promise((resolve) => setTimeout(resolve, 200));
        }
      } else {
        failure = result.error;
        batchFailure = result.error;
        console.error('dispatch-push gönderilemedi', {
          audience: batch.audience,
          platform: device.platform,
          role: device.role || 'guest',
          token: `${device.token.slice(0, 8)}…`,
          error: result.error,
          stale: result.stale,
        });
        if (result.stale) {
          await dropStaleToken(admin, device.token);
          removed += 1;
          batchRemoved += 1;
        }
      }
    }
    if ((row.kind || 'notice') === 'notice') {
      const batchLive = pending.length - batchSent - batchRemoved;
      await writeNotificationLog(admin, {
        noticeId: String(payloadRecord.noticeId ?? payloadRecord.notice_id ?? ''),
        audience: batch.audience,
        kind: row.kind || 'notice',
        targets: pending.length,
        sent: batchSent,
        error: pending.length === 0 ? '' : batchLive > 0 ? batchFailure : '',
      });
    }
  }

  const liveFailures = tokens.length - sent - removed;
  const failureText = tokens.length === 0
    ? 'hedef cihaz yok'
    : liveFailures > 0
      ? failure
      : '';
  if (removed > 0) console.error('Kayıtsız FCM token temizlendi', { removed, sent, targets: tokens.length });

  await admin.from('push_outbox').update({
    sent_at: new Date().toISOString(),
    last_error: failureText || null,
  }).eq('id', row.id);

  if ((row.kind || 'notice') !== 'notice' && failureText) {
    await writeNotificationLog(admin, {
      noticeId: String(payloadRecord.noticeId ?? payloadRecord.notice_id ?? ''),
      audience,
      kind: row.kind || 'notice',
      targets: tokens.length,
      sent,
      error: failureText,
    });
  }

  return { sent, targets: tokens.length, error: failureText };
}

async function drainPushOutbox(admin: AdminClient) {
  const { data: rows, error } = await admin
    .from('push_outbox')
    .select('id,kind,title,body,company_id,payload')
    .is('sent_at', null)
    .order('created_at', { ascending: true })
    .limit(25);
  if (error) throw new Error(error.message);
  let sent = 0;
  let targets = 0;
  let errorText = '';
  const sentKeys = new Set<string>();
  for (const raw of rows ?? []) {
    try {
      const row = asRecord(raw) ?? {};
      const result = await deliverOutboxRow(admin, {
        id: String(row.id ?? ''),
        kind: String(row.kind ?? 'notice'),
        title: String(row.title ?? ''),
        body: String(row.body ?? ''),
        company_id: row.company_id == null ? null : String(row.company_id),
        payload: row.payload ?? null,
      }, sentKeys);
      sent += result.sent;
      targets += result.targets;
      if (result.error) errorText = result.error;
    } catch (error) {
      errorText = error instanceof Error ? error.message : 'Satır işlenemedi';
      console.error('dispatch-push satır işlenemedi', { error: errorText });
    }
  }
  if (errorText) console.error('Push kuyruğu tamamlanamadı', { queued: (rows ?? []).length, targets, sent, error: errorText });
  return { queued: (rows ?? []).length, targets, sent, error: errorText };
}

async function authorized(req: Request, url: string, anon: string, service: string) {
  const authHeader = req.headers.get('Authorization') ?? '';
  if (!authHeader) return false;
  const bearer = authHeader.replace(/^Bearer\s+/i, '').trim();
  if (service && bearer === service) return true;
  if (anon && bearer === anon) return true;
  const userClient = createClient(url, anon, {
    global: { headers: { Authorization: authHeader } },
  });
  const { data, error } = await userClient.auth.getUser();
  return !error && Boolean(data.user);
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    const url = Deno.env.get('SUPABASE_URL') ?? '';
    const anon = Deno.env.get('SUPABASE_ANON_KEY') ?? '';
    const service = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '';
    if (!(await authorized(req, url, anon, service))) {
      return new Response(JSON.stringify({ ok: false, message: 'unauthorized' }), {
        status: 401,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const admin = createClient(url, service || anon);
    if (!service) {
      console.error('dispatch-push: SUPABASE_SERVICE_ROLE_KEY yok, diğer kullanıcıların cihaz tokenları okunamaz');
    }
    let requestBody: unknown = {};
    try {
      const text = await req.text();
      requestBody = text.trim() ? JSON.parse(text) : {};
    } catch (error) {
      console.error('dispatch-push istek gövdesi okunamadı', {
        error: error instanceof Error ? error.message : String(error),
      });
      requestBody = {};
    }
    const requestPayload = parsePayload(requestBody, 'http');
    const requestRecord = asRecord(requestBody) ?? {};
    const requestTokens = uniqueTokens([
      ...parseDeviceList(requestRecord.tokens ?? requestRecord.fcm_tokens ?? requestRecord.fcmTokens ?? requestRecord.devices ?? requestRecord.device, 'http.tokens'),
      ...parseDeviceList(requestRecord.token ?? requestRecord.fcm_token ?? requestRecord.fcmToken, 'http.token'),
    ]);
    console.log('dispatch-push istek', {
      method: req.method,
      contentType: req.headers.get('content-type') || '',
      payloadKeys: Object.keys(requestPayload),
      tokenCount: requestTokens.length,
      platforms: requestTokens.reduce<Record<string, number>>((sum, item) => {
        sum[item.platform] = (sum[item.platform] ?? 0) + 1;
        return sum;
      }, {}),
    });
    const result = await drainPushOutbox(admin);
    return new Response(JSON.stringify({ ok: true, ...result, requestTokens: requestTokens.length }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  } catch (error) {
    return new Response(JSON.stringify({
      ok: false,
      message: error instanceof Error ? error.message : 'İstek işlenemedi.',
    }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
