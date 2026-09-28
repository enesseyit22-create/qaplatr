export type PushRow = {
  id: string;
  kind: string;
  title: string;
  body: string;
  company_id: string | null;
  payload: Record<string, unknown> | null;
};

// Supabase query builder is thenable; keep this loose so both .eq() and .in() chains work.
// deno-lint-ignore no-explicit-any
type AdminClient = any;

function tokensFrom(rows: Record<string, unknown>[] | null | undefined) {
  return (rows ?? [])
    .map((row) => String(row.fcm_token ?? '').trim())
    .filter(Boolean);
}

async function companyTokens(admin: AdminClient, companyId: string) {
  const [owned, devices] = await Promise.all([
    admin.from('company_push_tokens').select('fcm_token').eq('company_id', companyId),
    admin.from('device_push_tokens').select('fcm_token').eq('company_id', companyId),
  ]);
  return [...new Set([...tokensFrom(owned.data), ...tokensFrom(devices.data)])];
}

async function followerTokens(admin: AdminClient, companyId: string) {
  const follows = await admin.from('follows').select('user_id').eq('business_id', companyId);
  if (follows.error) throw new Error(follows.error.message);
  const userIds = [...new Set((follows.data ?? []).map((row) => String(row.user_id ?? '').trim()).filter(Boolean))];
  if (userIds.length === 0) return [];
  const devices = await admin.from('device_push_tokens').select('fcm_token,user_id').in('user_id', userIds);
  if (devices.error) throw new Error(devices.error.message);
  return [...new Set(tokensFrom(devices.data))];
}

const FCM_CHANNEL = 'qapla_alerts';

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
  } catch {
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
      const detail = (await res.text()).slice(0, 180);
      return `fcm-v1 ${res.status} ${detail}`;
    }
    return '';
  }

  const key = Deno.env.get('FCM_SERVER_KEY') ?? Deno.env.get('FIREBASE_SERVER_KEY') ?? '';
  if (!key) return 'FCM kimliği yok';
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
  if (!res.ok) return `fcm-legacy ${res.status}`;
  return '';
}

type DeviceRow = {
  fcm_token?: string;
  user_id?: string | null;
  role?: string | null;
  company_id?: string | null;
};

function deviceBucket(row: DeviceRow, adminIds: Set<string>): 'guest' | 'user' | 'merchant' | 'admin' {
  const role = String(row.role ?? '').trim();
  const userId = String(row.user_id ?? '').trim();
  if (role === 'admin' || (userId && adminIds.has(userId))) return 'admin';
  if (role === 'merchant' || row.company_id) return 'merchant';
  if (role === 'guest' || !userId) return 'guest';
  return 'user';
}

async function noticeTokens(admin: AdminClient, audience: string, companyId = '') {
  if (audience === 'merchants' && companyId) {
    return companyTokens(admin, companyId);
  }
  const [devices, profiles, companies] = await Promise.all([
    admin.from('device_push_tokens').select('fcm_token,user_id,role,company_id'),
    admin.from('profiles').select('id,auth_user_id,role'),
    audience === 'merchants' || audience === 'all'
      ? admin.from('company_push_tokens').select('fcm_token')
      : Promise.resolve({ data: [], error: null }),
  ]);
  if (devices.error) throw new Error(devices.error.message);
  const adminIds = new Set<string>();
  for (const profile of profiles.data ?? []) {
    if (String(profile.role ?? '') !== 'admin') continue;
    if (profile.id) adminIds.add(String(profile.id));
    if (profile.auth_user_id) adminIds.add(String(profile.auth_user_id));
  }
  const rows = (devices.data ?? []) as DeviceRow[];
  const picked = audience === 'admin'
    ? rows.filter((row) => deviceBucket(row, adminIds) === 'admin')
    : audience === 'guests'
      ? rows.filter((row) => deviceBucket(row, adminIds) === 'guest')
      : audience === 'users'
        ? rows.filter((row) => deviceBucket(row, adminIds) === 'user')
        : audience === 'merchants'
          ? rows.filter((row) => deviceBucket(row, adminIds) === 'merchant')
          : rows;
  const firmTokens = audience === 'merchants' || audience === 'all' ? tokensFrom(companies.data) : [];
  return [...new Set([...tokensFrom(picked), ...firmTokens])];
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

async function userTokens(admin: AdminClient, userId: string) {
  if (!userId) return [];
  const devices = await admin.from('device_push_tokens').select('fcm_token').eq('user_id', userId);
  return tokensFrom(devices.data);
}

export async function deliverOutboxRow(admin: AdminClient, row: PushRow) {
  const companyId = String(row.company_id ?? '').trim();
  const userId = String(row.payload?.userId ?? '').trim();
  const audience = String(row.payload?.audience ?? 'all');
  const title = String(row.title ?? '').trim() || 'QapLA';
  const body = String(row.body ?? '').trim();
  if (row.kind !== 'notice' && row.kind !== 'approval' && !companyId && !(row.kind.startsWith('coupon') && userId)) {
    await admin.from('push_outbox').update({
      sent_at: new Date().toISOString(),
      last_error: 'company_id yok',
    }).eq('id', row.id);
    return { sent: 0, targets: 0, error: 'company_id yok' };
  }

  const tokens = row.kind === 'notice'
    ? await noticeTokens(admin, audience, audience === 'merchants' ? companyId : '')
    : row.kind === 'approval'
      ? await userTokens(admin, userId)
    : row.kind === 'follow'
    ? await companyTokens(admin, companyId)
    : row.kind.startsWith('coupon')
      ? [...new Set([...(await userTokens(admin, userId)), ...(await companyTokens(admin, companyId))])]
      : await followerTokens(admin, companyId);
  const data = {
    kind: row.kind,
    companyId,
    title,
    body,
    ...(row.payload ?? {}),
  };
  const payload = Object.fromEntries(
    Object.entries(data).map(([key, value]) => [key, value == null ? '' : String(value)]),
  );

  let sent = 0;
  let failure = '';
  for (const token of tokens) {
    const error = await sendFcm(token, title, body, payload);
    if (!error) sent += 1;
    else failure = error;
  }

  const failureText = tokens.length === 0
    ? 'hedef cihaz yok'
    : failure && sent < tokens.length
      ? failure
      : '';

  await admin.from('push_outbox').update({
    sent_at: new Date().toISOString(),
    last_error: failureText || null,
  }).eq('id', row.id);

  if (row.kind === 'notice' || failureText) {
    await writeNotificationLog(admin, {
      noticeId: String(row.payload?.noticeId ?? ''),
      audience,
      kind: row.kind,
      targets: tokens.length,
      sent,
      error: failureText,
    });
  }

  return { sent, targets: tokens.length, error: failureText };
}

export async function drainPushOutbox(admin: AdminClient) {
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
  for (const row of (rows ?? []) as PushRow[]) {
    const result = await deliverOutboxRow(admin, row);
    sent += result.sent;
    targets += result.targets;
    if (result.error) errorText = result.error;
  }
  if (errorText) console.error('Push kuyruğu tamamlanamadı', { queued: (rows ?? []).length, targets, sent, error: errorText });
  return { queued: (rows ?? []).length, targets, sent, error: errorText };
}
