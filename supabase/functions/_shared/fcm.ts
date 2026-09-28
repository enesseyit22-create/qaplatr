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

async function sendFcm(token: string, title: string, body: string, data: Record<string, string>) {
  const key = Deno.env.get('FCM_SERVER_KEY') ?? Deno.env.get('FIREBASE_SERVER_KEY') ?? '';
  if (!key) return false;
  const res = await fetch('https://fcm.googleapis.com/fcm/send', {
    method: 'POST',
    headers: {
      Authorization: `key=${key}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      to: token,
      priority: 'high',
      notification: { title, body, sound: 'default' },
      data,
    }),
  });
  return res.ok;
}

export async function deliverOutboxRow(admin: AdminClient, row: PushRow) {
  const companyId = String(row.company_id ?? '').trim();
  const title = String(row.title ?? '').trim() || 'QapLA';
  const body = String(row.body ?? '').trim();
  if (!companyId) {
    await admin.from('push_outbox').update({
      sent_at: new Date().toISOString(),
      last_error: 'company_id yok',
    }).eq('id', row.id);
    return { sent: 0, targets: 0 };
  }

  const tokens = row.kind === 'follow'
    ? await companyTokens(admin, companyId)
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
  for (const token of tokens) {
    if (await sendFcm(token, title, body, payload)) sent += 1;
  }

  await admin.from('push_outbox').update({
    sent_at: new Date().toISOString(),
    last_error: tokens.length === 0 ? 'hedef cihaz yok' : null,
  }).eq('id', row.id);

  return { sent, targets: tokens.length };
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
  for (const row of (rows ?? []) as PushRow[]) {
    const result = await deliverOutboxRow(admin, row);
    sent += result.sent;
    targets += result.targets;
  }
  return { queued: (rows ?? []).length, targets, sent };
}
