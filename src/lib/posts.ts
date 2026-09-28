import { planLimits, planTierOf } from '@/lib/plans';
import { isSupabaseConfigured, supabase } from '@/lib/supabase';
import { subscribeTables } from '@/lib/live';
import { fileToJpegBlob } from '@/lib/utils';
import { useEffect, useState } from 'react';

const POST_IMAGE_BUCKET = 'post-images';

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
    company_id: String(row.business_id ?? row.company_id ?? ''),
    image_url: String(row.image_url ?? ''),
    caption: String(row.content ?? row.caption ?? ''),
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

export function dailyPostLimitReached(companyId: string, rows?: CompanyPost[], limit = FREE_DAILY_POST_LIMIT) {
  return postsTodayCount(companyId, rows) >= limit;
}

async function countPostsTodayRemote(companyId: string) {
  if (!isSupabaseConfigured) return postsTodayCount(companyId);
  const { count, error } = await supabase
    .from('posts')
    .select('id', { count: 'exact', head: true })
    .eq('business_id', companyId)
    .gte('created_at', startOfLocalDay().toISOString());
  if (error || typeof count !== 'number') return postsTodayCount(companyId);
  return count;
}

let postFetch = 0;

export async function refreshPosts() {
  if (!isSupabaseConfigured) return readRaw();
  const ticket = ++postFetch;
  const { data, error } = await supabase
    .from('posts')
    .select('*')
    .order('created_at', { ascending: false })
    .limit(80);
  if (ticket !== postFetch) return readRaw();
  if (error || !data) return readRaw();
  const rows = data.map((item) => asPost(item as Record<string, unknown>));
  writeRaw(rows);
  return rows;
}

function errorBits(err: unknown) {
  const record = err && typeof err === 'object' ? err as Record<string, unknown> : {};
  const message = err instanceof Error ? err.message : typeof record.message === 'string' ? record.message : '';
  const details = typeof record.details === 'string' ? record.details : '';
  const hint = typeof record.hint === 'string' ? record.hint : '';
  const code = typeof record.code === 'string' ? record.code : '';
  const status = record.statusCode ?? record.status ?? '';
  return { message, details, hint, code, status, raw: `${message} ${details} ${hint}`.toLowerCase() };
}

function postFailureMessage(err: unknown, fallback: string) {
  const bits = errorBits(err);
  if (bits.raw.includes('bucket not found') || bits.raw.includes('bucket does not exist')) {
    return 'Görsel klasörü (post-images) bulunamadı. Storage SQL dosyasını çalıştırın.';
  }
  if (bits.raw.includes('row-level security') || bits.raw.includes('not authorized') || bits.code === '42501' || String(bits.status) === '403') {
    return 'Bu firma adına görsel yükleme izniniz yok. Onaylı firma hesabıyla tekrar deneyin.';
  }
  if (bits.raw.includes('mime') || bits.raw.includes('invalid file')) {
    return 'Bu dosya türü kabul edilmiyor. JPG, PNG veya WEBP seçin.';
  }
  if (bits.raw.includes('too large') || bits.raw.includes('payload') || String(bits.status) === '413') {
    return 'Görsel çok büyük. Daha küçük bir fotoğraf seçin.';
  }
  const text = [bits.message, bits.details].map((part) => part.trim()).filter(Boolean).join(' ');
  return text || fallback;
}

export async function uploadPostImage(companyId: string, file: File): Promise<string> {
  try {
    if (!file.type.startsWith('image/')) {
      throw new Error('Yalnızca görsel dosyası yükleyebilirsiniz.');
    }
    const blob = await fileToJpegBlob(file, 1080);
    if (blob.size > 5 * 1024 * 1024) {
      throw new Error('Görsel çok büyük. Daha küçük bir fotoğraf seçin.');
    }
    const remote = isSupabaseConfigured && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(companyId);
    if (!remote) {
      return await new Promise<string>((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(String(reader.result ?? ''));
        reader.onerror = () => reject(new Error('Görsel okunamadı'));
        reader.readAsDataURL(blob);
      });
    }
    const path = `${companyId.toLowerCase()}/${crypto.randomUUID()}.jpg`;
    const uploaded = await supabase.storage.from(POST_IMAGE_BUCKET).upload(path, blob, {
      contentType: 'image/jpeg',
      upsert: false,
    });
    if (uploaded.error) throw uploaded.error;
    const { data } = supabase.storage.from(POST_IMAGE_BUCKET).getPublicUrl(path);
    if (!data.publicUrl) throw new Error('Görsel adresi alınamadı.');
    return data.publicUrl;
  } catch (err) {
    console.warn('Gönderi görseli yüklenemedi', err);
    throw new Error(postFailureMessage(err, 'Görsel yüklenemedi. Tekrar deneyin.'));
  }
}

function isCompanyUuid(value: string) {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value);
}

function companyIdFromLocation() {
  const search = new URLSearchParams(window.location.search);
  const hash = new URLSearchParams(window.location.hash.replace(/^#/, '').replace(/^\?/, ''));
  return search.get('company') || search.get('company_id') || hash.get('company') || hash.get('company_id') || '';
}

function panelCompanyId(hintId: string) {
  const saved = localStorage.getItem('qapla_active_company_id') ?? '';
  const candidates = [hintId, saved, companyIdFromLocation()].map((value) => value.trim()).filter(Boolean);
  return candidates.find(isCompanyUuid) || candidates[0] || '';
}

async function resolvePostBusinessId(hintId: string): Promise<string> {
  const panelId = panelCompanyId(hintId);
  try {
    const { data: authData } = await supabase.auth.getUser();
    const user = authData.user;
    const email = user?.email?.trim().toLowerCase() ?? '';
    const { data, error } = await supabase.from('companies').select('id,email,owner_email');
    if (error) console.warn('Firma sorgusu başarısız', error);
    const rows = (data ?? []) as { id: string; email?: string | null; owner_email?: string | null }[];
    const matchesEmail = (row: { email?: string | null; owner_email?: string | null }, value: string) => {
      const owner = (row.owner_email ?? '').trim().toLowerCase();
      const mail = (row.email ?? '').trim().toLowerCase();
      return Boolean(value) && (owner === value || mail === value);
    };
    const fromEmail = rows.find((row) => matchesEmail(row, email));
    const fromPanel = rows.find((row) => row.id === panelId);
    let fromProfile = '';
    if (user?.id) {
      const profile = await supabase
        .from('profiles')
        .select('company_id')
        .or(`id.eq.${user.id},auth_user_id.eq.${user.id}`)
        .limit(1);
      if (profile.error) console.warn('Profil firma sorgusu başarısız', profile.error);
      const linked = String(profile.data?.[0]?.company_id ?? '');
      if (linked && rows.some((row) => row.id === linked)) fromProfile = linked;
      if (!fromEmail && !fromProfile) {
        const application = await supabase
          .from('businesses')
          .select('email')
          .eq('user_id', user.id)
          .eq('status', 'approved')
          .limit(1);
        const applicationEmail = String(application.data?.[0]?.email ?? '').trim().toLowerCase();
        const owned = rows.find((row) => matchesEmail(row, applicationEmail));
        if (owned?.id) fromProfile = owned.id;
      }
    }
    const resolved = fromEmail?.id || fromProfile || fromPanel?.id || '';
    if (resolved) {
      localStorage.setItem('qapla_active_company_id', resolved);
      return resolved;
    }
    console.warn('Gönderi firma kimliği companies.id ile eşleşmedi', { panelId, email });
    return '';
  } catch (err) {
    console.warn('Firma kimliği çözülemedi', err);
  }
  return '';
}

export async function addCompanyPost(input: { company_id: string; image_url: string; caption: string }) {
  const businessId = isSupabaseConfigured ? await resolvePostBusinessId(input.company_id) : input.company_id;
  if (isSupabaseConfigured && !businessId) {
    throw new Error('Gönderi, firmanın companies kimliğiyle eşleşmedi.');
  }
  await refreshPosts();
  const todayCount = await countPostsTodayRemote(businessId);
  let dailyLimit = FREE_DAILY_POST_LIMIT;
  if (isSupabaseConfigured) {
    const firm = await supabase.from('companies').select('plan_tier, is_featured').eq('id', businessId).maybeSingle();
    if (!firm.error && firm.data) dailyLimit = planLimits(planTierOf(firm.data)).dailyPosts;
  }
  if (todayCount >= dailyLimit) {
    throw new Error(dailyLimit <= 1
      ? 'Standart pakette günde 1 paylaşım yapılabilir. Hakkın doldu.'
      : `Premium pakette günde ${dailyLimit} paylaşım yapılabilir. Hakkın doldu.`);
  }
  if (isSupabaseConfigured) {
    const { data, error } = await supabase
      .from('posts')
      .insert({
        business_id: businessId,
        image_url: input.image_url,
        content: input.caption.trim(),
      })
      .select('*')
      .single();
    if (error) {
      console.warn('Gönderi kaydı yazılamadı', error);
      throw new Error(postFailureMessage(error, 'Gönderi kaydedilemedi.'));
    }
    const row = asPost(data as Record<string, unknown>);
    if (!row.company_id) row.company_id = businessId;
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
    const stop = subscribeTables(['posts'], (change) => {
      if (change?.eventType === 'DELETE') {
        const id = String(change.old?.id ?? '');
        if (id) writeRaw(readRaw().filter((item) => item.id !== id));
      }
      void refreshPosts().then(sync);
    });
    return () => {
      window.removeEventListener(EVENT, sync);
      stop();
    };
  }, [companyId]);
  return rows;
}
