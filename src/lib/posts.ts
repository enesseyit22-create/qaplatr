import { isSupabaseConfigured, supabase } from '@/lib/supabase';
import { subscribeTables } from '@/lib/live';
import { useEffect, useState } from 'react';

export type CompanyPost = {
  id: string;
  company_id: string;
  image_url: string;
  caption: string;
  created_at: string;
};

const KEY = 'qapla_company_posts';
const EVENT = 'qapla-posts';

function readRaw(): CompanyPost[] {
  try {
    const parsed = JSON.parse(localStorage.getItem(KEY) ?? '[]') as CompanyPost[];
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function writeRaw(rows: CompanyPost[]) {
  localStorage.setItem(KEY, JSON.stringify(rows.slice(0, 80)));
  window.dispatchEvent(new Event(EVENT));
}

function asPost(row: Record<string, unknown>): CompanyPost {
  return {
    id: String(row.id),
    company_id: String(row.company_id),
    image_url: String(row.image_url ?? ''),
    caption: String(row.caption ?? ''),
    created_at: String(row.created_at ?? new Date().toISOString()),
  };
}

export const FREE_DAILY_POST_LIMIT = 1;

export function postsForCompany(companyId: string) {
  return readRaw()
    .filter((item) => item.company_id === companyId)
    .sort((a, b) => +new Date(b.created_at) - +new Date(a.created_at));
}

function startOfLocalDay(date = new Date()) {
  const start = new Date(date);
  start.setHours(0, 0, 0, 0);
  return start;
}

export function postsTodayCount(companyId: string, rows?: CompanyPost[]) {
  const start = +startOfLocalDay();
  return (rows ?? postsForCompany(companyId)).filter((item) => {
    if (item.company_id !== companyId) return false;
    const at = +new Date(item.created_at);
    return Number.isNaN(at) || at >= start;
  }).length;
}

export function dailyPostLimitReached(companyId: string, rows?: CompanyPost[]) {
  return postsTodayCount(companyId, rows) >= FREE_DAILY_POST_LIMIT;
}

async function countPostsTodayRemote(companyId: string) {
  if (!isSupabaseConfigured) return postsTodayCount(companyId);
  const { count, error } = await supabase
    .from('posts')
    .select('id', { count: 'exact', head: true })
    .eq('company_id', companyId)
    .gte('created_at', startOfLocalDay().toISOString());
  if (error || typeof count !== 'number') return postsTodayCount(companyId);
  return count;
}

export async function refreshPosts() {
  if (!isSupabaseConfigured) return readRaw();
  const { data, error } = await supabase
    .from('posts')
    .select('*')
    .order('created_at', { ascending: false })
    .limit(80);
  if (error || !data) return readRaw();
  const rows = data.map((item) => asPost(item as Record<string, unknown>));
  writeRaw(rows);
  return rows;
}

export async function addCompanyPost(input: { company_id: string; image_url: string; caption: string }) {
  await refreshPosts();
  const todayCount = await countPostsTodayRemote(input.company_id);
  if (todayCount >= FREE_DAILY_POST_LIMIT) {
    throw new Error('VIP olmadan günde yalnızca 1 paylaşım yapılabilir. Hakkın doldu.');
  }
  if (isSupabaseConfigured) {
    const { data, error } = await supabase
      .from('posts')
      .insert({
        company_id: input.company_id,
        image_url: input.image_url,
        caption: input.caption.trim(),
      })
      .select('*')
      .single();
    if (error) throw error;
    const row = asPost(data as Record<string, unknown>);
    writeRaw([row, ...readRaw().filter((item) => item.id !== row.id)]);
    return row;
  }
  const row: CompanyPost = {
    id: crypto.randomUUID(),
    created_at: new Date().toISOString(),
    ...input,
  };
  writeRaw([row, ...readRaw()]);
  return row;
}

export async function deleteCompanyPost(id: string) {
  writeRaw(readRaw().filter((item) => item.id !== id));
  if (isSupabaseConfigured) {
    const { error } = await supabase.from('posts').delete().eq('id', id);
    if (error) throw error;
  }
}

export function useCompanyPosts(companyId?: string | null) {
  const [rows, setRows] = useState(() => (companyId ? postsForCompany(companyId) : readRaw()));
  useEffect(() => {
    const sync = () => setRows(companyId ? postsForCompany(companyId) : readRaw());
    void refreshPosts().then(sync);
    window.addEventListener(EVENT, sync);
    const stop = subscribeTables(['posts'], () => { void refreshPosts().then(sync); });
    return () => {
      window.removeEventListener(EVENT, sync);
      stop();
    };
  }, [companyId]);
  return rows;
}
