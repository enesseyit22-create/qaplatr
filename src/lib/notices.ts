import { useEffect, useState } from 'react';
import { useAuth } from '@/lib/authContext';
import { requestPushDispatch } from '@/lib/companyPush';
import { isSupabaseConfigured, supabase } from '@/lib/supabase';
import { subscribeTables } from '@/lib/live';
import type { ProfileRole } from '@/lib/auth';
import { campaignAlertsAllowed, useAppFeatures } from '@/lib/appFeatures';

const KEY = 'qapla_app_notices';
const EVENT = 'qapla-notices';

export type NoticeAudience = 'all' | 'guests' | 'users' | 'merchants' | 'admin';

export type AppNotice = {
  id: string;
  title: string;
  body: string;
  from_kind: 'admin' | 'company';
  from_name: string;
  audience: NoticeAudience;
  company_id?: string | null;
  created_at: string;
};

function readRaw(): AppNotice[] {
  try {
    const parsed = JSON.parse(localStorage.getItem(KEY) ?? '[]') as AppNotice[];
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function writeRaw(rows: AppNotice[]) {
  localStorage.setItem(KEY, JSON.stringify(rows.slice(0, 40)));
  window.dispatchEvent(new Event(EVENT));
}

export function isFollowNotice(notice: AppNotice) {
  return notice.audience === 'merchants'
    && Boolean(notice.company_id)
    && notice.title.trim().toLocaleLowerCase('tr') === 'yeni takipçi';
}

export function isCampaignNotice(notice: AppNotice) {
  if (isFollowNotice(notice)) return false;
  return notice.from_kind === 'company' || Boolean(notice.company_id);
}

export function isAdminInboxNotice(notice: AppNotice) {
  if (notice.audience === 'admin') return true;
  if (notice.from_kind !== 'admin') return false;
  const hay = `${notice.title} ${notice.body}`.toLocaleLowerCase('tr');
  return /yeni kullanıcı|yeni üye|kayıt oldu|firma başvurusu|onay bekliyor/.test(hay);
}

export function noticeVisibleTo(
  notice: AppNotice,
  role?: ProfileRole | null,
  companyId?: string | null,
  vip?: boolean | null,
) {
  if (isAdminInboxNotice(notice)) return role === 'admin';
  if (isCampaignNotice(notice) && !campaignAlertsAllowed({ vip })) return false;
  if (role === 'admin') return true;
  if (notice.audience === 'all') return true;
  if (notice.audience === 'guests') return !role;
  if (notice.audience === 'users') return role === 'user';
  if (notice.audience === 'merchants') {
    if (role !== 'merchant') return false;
    if (!notice.company_id) return true;
    return notice.company_id === companyId;
  }
  return false;
}

function asNotice(row: Record<string, unknown>): AppNotice {
  const audience = row.audience === 'guests' || row.audience === 'users' || row.audience === 'merchants' || row.audience === 'admin'
    ? row.audience
    : 'all';
  return {
    id: String(row.id),
    title: String(row.title ?? ''),
    body: String(row.body ?? ''),
    from_kind: row.from_kind === 'company' ? 'company' : 'admin',
    from_name: String(row.from_name ?? 'QapLA'),
    audience,
    company_id: (row.company_id as string | null) ?? null,
    created_at: String(row.created_at ?? new Date().toISOString()),
  };
}

export function readAppNotices(): AppNotice[] {
  return readRaw().sort((a, b) => +new Date(b.created_at) - +new Date(a.created_at));
}

export function pushLocalNotice(input: { title: string; body: string }) {
  const title = input.title.trim();
  const body = input.body.trim();
  if (!title && !body) return;
  const row: AppNotice = {
    id: crypto.randomUUID(),
    title: title || 'QapLA',
    body: body || title,
    from_kind: 'admin',
    from_name: 'QapLA',
    audience: 'all',
    created_at: new Date().toISOString(),
  };
  writeRaw([row, ...readRaw().filter((item) => item.id !== row.id)]);
}

export async function refreshAppNotices() {
  if (!isSupabaseConfigured) return readAppNotices();
  const { data, error } = await supabase
    .from('app_notices')
    .select('id,title,body,from_kind,from_name,audience,company_id,created_at')
    .order('created_at', { ascending: false })
    .limit(40);
  if (error || !data) return readAppNotices();
  const rows = data.map((item) => asNotice(item as Record<string, unknown>));
  writeRaw(rows);
  return rows;
}

export type PublishedNotice = AppNotice & { warning: string | null };

async function saveNotificationRow(row: AppNotice) {
  const { error } = await supabase.from('notifications').insert({
    id: row.id,
    title: row.title,
    body: row.body,
    audience: row.audience,
    from_kind: row.from_kind,
    from_name: row.from_name,
    company_id: row.company_id ?? null,
  });
  if (error) console.error('notifications kaydı yazılamadı', error.message, error);
}

const SPLIT_AUDIENCES = ['guests', 'users', 'merchants'] as const satisfies readonly NoticeAudience[];

function publishTargets(audience: NoticeAudience): NoticeAudience[] {
  return audience === 'all' ? [...SPLIT_AUDIENCES] : [audience];
}

async function insertNotice(input: Omit<AppNotice, 'id' | 'created_at'>): Promise<AppNotice> {
  const { data, error } = await supabase
    .from('app_notices')
    .insert({
      title: input.title,
      body: input.body,
      from_kind: input.from_kind,
      from_name: input.from_name,
      audience: input.audience,
      company_id: input.company_id ?? null,
    })
    .select('id,title,body,from_kind,from_name,audience,company_id,created_at')
    .single();
  if (error) throw error;
  const row = asNotice(data as Record<string, unknown>);
  writeRaw([row, ...readRaw().filter((item) => item.id !== row.id)]);
  await saveNotificationRow(row);
  const queued = await supabase.rpc('enqueue_admin_notice_push', { p_notice: row.id });
  if (queued.error) console.error('Bildirim kuyruğa yazılamadı', queued.error.message, queued.error);
  console.log('Bildirim ayrı kuyruğa alındı', { audience: row.audience, noticeId: row.id });
  return row;
}

export async function addAppNotice(input: Omit<AppNotice, 'id' | 'created_at'>): Promise<PublishedNotice> {
  const targets = publishTargets(input.audience);
  if (isSupabaseConfigured) {
    const rows: AppNotice[] = [];
    for (const audience of targets) {
      rows.push(await insertNotice({ ...input, audience }));
    }
    const row = rows[0];
    try {
      const push = await requestPushDispatch();
      if (!push.ok) {
        console.error('Yönetim bildirimi push iletilemedi', {
          audiences: targets,
          noticeId: row.id,
          message: push.message,
          sent: push.sent,
          targets: push.targets,
          queued: push.queued,
        });
        return { ...row, warning: push.message || 'Bildirim kaydedildi. Anlık push şu an ulaşılamıyor.' };
      }
      return { ...row, warning: null };
    } catch (pushError) {
      console.error('Yönetim bildirimi push iletilemedi', pushError);
      return { ...row, warning: 'Bildirim kaydedildi. Anlık push şu an ulaşılamıyor.' };
    }
  }
  const rows = targets.map((audience) => ({
    ...input,
    audience,
    id: crypto.randomUUID(),
    created_at: new Date().toISOString(),
  }));
  writeRaw([...rows, ...readRaw()]);
  return { ...rows[0], warning: null };
}

export async function updateAppNotice(id: string, input: Partial<Pick<AppNotice, 'title' | 'body' | 'audience' | 'from_name' | 'from_kind' | 'company_id'>>) {
  if (isSupabaseConfigured) {
    const { data, error } = await supabase
      .from('app_notices')
      .update({
        ...(input.title != null ? { title: input.title } : {}),
        ...(input.body != null ? { body: input.body } : {}),
        ...(input.audience != null ? { audience: input.audience } : {}),
        ...(input.from_name != null ? { from_name: input.from_name } : {}),
        ...(input.from_kind != null ? { from_kind: input.from_kind } : {}),
        ...(input.company_id !== undefined ? { company_id: input.company_id } : {}),
      })
      .eq('id', id)
      .select('id,title,body,from_kind,from_name,audience,company_id,created_at')
      .single();
    if (error) throw error;
    const row = asNotice(data as Record<string, unknown>);
    writeRaw(readRaw().map((item) => item.id === id ? row : item));
    return row;
  }
  const next = readRaw().map((item) => item.id === id ? { ...item, ...input } : item);
  writeRaw(next);
  return next.find((item) => item.id === id) ?? null;
}

export async function deleteAppNotice(id: string) {
  writeRaw(readRaw().filter((item) => item.id !== id));
  if (isSupabaseConfigured) {
    const { error } = await supabase.from('app_notices').delete().eq('id', id);
    if (error) throw error;
  }
}

export async function deleteAppNoticesForCompany(companyId: string, companyName?: string) {
  const name = (companyName ?? '').trim().toLocaleLowerCase('tr');
  writeRaw(readRaw().filter((item) => {
    if (item.company_id === companyId) return false;
    if (name && item.from_kind === 'company' && item.from_name.trim().toLocaleLowerCase('tr') === name) return false;
    return true;
  }));
  if (isSupabaseConfigured) {
    const { error } = await supabase.from('app_notices').delete().eq('company_id', companyId);
    if (error) throw error;
  }
}

export async function deleteAllCompanyNotices() {
  writeRaw(readRaw().filter((item) => item.from_kind !== 'company' && !item.company_id));
  if (isSupabaseConfigured) {
    const byKind = await supabase.from('app_notices').delete().eq('from_kind', 'company');
    if (byKind.error) throw byKind.error;
    const byId = await supabase.from('app_notices').delete().not('company_id', 'is', null);
    if (byId.error) throw byId.error;
  }
}

export function useAppNotices() {
  const { profile } = useAuth();
  const features = useAppFeatures();
  const [rows, setRows] = useState(readAppNotices);
  useEffect(() => {
    const sync = () => setRows(readAppNotices());
    void refreshAppNotices();
    window.addEventListener(EVENT, sync);
    const stop = subscribeTables(['app_notices'], () => { void refreshAppNotices(); });
    return () => {
      window.removeEventListener(EVENT, sync);
      stop();
    };
  }, [profile?.role, profile?.company_id, features.vip.campaignAlerts]);
  const vip = Boolean((profile as { vip?: boolean } | null)?.vip);
  return rows.filter((item) => noticeVisibleTo(item, profile?.role, profile?.company_id, vip));
}
