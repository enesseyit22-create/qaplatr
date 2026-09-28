import { useEffect, useState } from 'react';
import { fileToJpegBlob } from '@/lib/utils';
import { subscribeTables } from '@/lib/live';
import { isSupabaseConfigured, supabase } from '@/lib/supabase';

const KEY = 'qapla_explore_banners';
const EVENT = 'qapla-banners';
const BUCKET = 'banner-images';

export type ExploreBanner = {
  id: string;
  title: string;
  subtitle: string;
  image_url: string | null;
  sort_order: number;
  is_active: boolean;
  company_id?: string | null;
  source?: 'admin' | 'company';
  status?: 'pending' | 'live';
  created_at: string;
};

export type ExploreBannerInput = {
  id?: string;
  title: string;
  subtitle: string;
  image_url?: string | null;
  file?: File | null;
  is_active?: boolean;
  sort_order?: number;
  company_id?: string | null;
  source?: 'admin' | 'company';
  status?: 'pending' | 'live';
};

function readCache(): ExploreBanner[] {
  try {
    const parsed = JSON.parse(localStorage.getItem(KEY) ?? '[]') as ExploreBanner[];
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function writeCache(rows: ExploreBanner[]) {
  localStorage.setItem(KEY, JSON.stringify(rows));
  window.dispatchEvent(new Event(EVENT));
}

function asBanner(row: Record<string, unknown>): ExploreBanner {
  return {
    id: String(row.id ?? ''),
    title: String(row.title ?? ''),
    subtitle: String(row.subtitle ?? ''),
    image_url: row.image_url ? String(row.image_url) : null,
    sort_order: Number(row.sort_order ?? 0),
    is_active: row.is_active !== false,
    company_id: row.company_id ? String(row.company_id) : null,
    source: row.source === 'company' ? 'company' : 'admin',
    status: row.status === 'pending' ? 'pending' : 'live',
    created_at: String(row.created_at ?? new Date().toISOString()),
  };
}

function sortBanners(rows: ExploreBanner[]) {
  return [...rows].sort((a, b) => a.sort_order - b.sort_order || +new Date(b.created_at) - +new Date(a.created_at));
}

export async function listExploreBanners(): Promise<ExploreBanner[]> {
  if (!isSupabaseConfigured) return sortBanners(readCache());
  const { data, error } = await supabase
    .from('explore_banners')
    .select('id,title,subtitle,image_url,sort_order,is_active,created_at')
    .order('sort_order', { ascending: true })
    .order('created_at', { ascending: false });
  if (error) {
    console.warn('Vitrin okunamadı', error.message);
    return sortBanners(readCache());
  }
  const rows = sortBanners(((data as Record<string, unknown>[]) ?? []).map(asBanner).filter((item) => item.id));
  writeCache(rows);
  return rows;
}

async function uploadBannerImage(file: File): Promise<string> {
  if (!file.type.startsWith('image/')) throw new Error('Yalnızca görsel dosyası yükleyebilirsiniz.');
  const blob = await fileToJpegBlob(file, 1400);
  if (blob.size > 5 * 1024 * 1024) throw new Error('Görsel çok büyük. Daha küçük bir fotoğraf seçin.');
  if (!isSupabaseConfigured) {
    return await new Promise<string>((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(String(reader.result ?? ''));
      reader.onerror = () => reject(new Error('Görsel okunamadı'));
      reader.readAsDataURL(blob);
    });
  }
  const path = `banners/${crypto.randomUUID()}.jpg`;
  const uploaded = await supabase.storage.from(BUCKET).upload(path, blob, {
    contentType: 'image/jpeg',
    upsert: false,
  });
  if (uploaded.error) {
    const raw = uploaded.error.message.toLowerCase();
    if (raw.includes('bucket') || raw.includes('not found')) {
      throw new Error('Vitrin görsel klasörü yok. 20260927170000_explore_banners.sql dosyasını çalıştırın.');
    }
    throw new Error(uploaded.error.message || 'Görsel yüklenemedi.');
  }
  const { data } = supabase.storage.from(BUCKET).getPublicUrl(path);
  if (!data.publicUrl) throw new Error('Görsel adresi alınamadı.');
  return data.publicUrl;
}

export async function saveExploreBanner(input: ExploreBannerInput): Promise<ExploreBanner> {
  const title = input.title.trim();
  if (!title) throw new Error('Banner başlığı gerekli.');
  const imageUrl = input.file ? await uploadBannerImage(input.file) : (input.image_url ?? null);
  const payload: Record<string, unknown> = {
    title,
    subtitle: input.subtitle.trim(),
    image_url: imageUrl,
    is_active: input.is_active !== false,
    sort_order: Number.isFinite(Number(input.sort_order)) ? Number(input.sort_order) : 0,
  };
  if (input.company_id) payload.company_id = input.company_id;
  if (input.source) payload.source = input.source;
  if (input.status) payload.status = input.status;
  if (!isSupabaseConfigured) {
    const row = {
      id: input.id || crypto.randomUUID(),
      ...payload,
      created_at: new Date().toISOString(),
    } as unknown as ExploreBanner;
    const next = [row, ...readCache().filter((item) => item.id !== row.id)];
    writeCache(next);
    return row;
  }
  const run = (body: Record<string, unknown>) => (
    input.id
      ? supabase.from('explore_banners').update(body).eq('id', input.id).select('*').single()
      : supabase.from('explore_banners').insert(body).select('*').single()
  );
  let result = await run(payload);
  if (result.error && /source|status|schema cache|column/i.test(result.error.message)) {
    if (input.status === 'pending') {
      throw new Error('Vitrin onay kuyruğu yok. 20260928210000_showcase_review.sql dosyasını çalıştırın.');
    }
    const { source: _source, status: _status, ...plain } = payload;
    result = await run(plain);
  }
  const { data, error } = result;
  if (error || !data) {
    const raw = (error?.message ?? '').toLowerCase();
    if (raw.includes('explore_banners') || raw.includes('schema cache') || raw.includes('permission') || raw.includes('row-level')) {
      throw new Error('Vitrin kaydı yazılamadı. 20260927170000_explore_banners.sql dosyasını çalıştırın.');
    }
    throw new Error(error?.message || 'Banner kaydedilemedi.');
  }
  const row = asBanner(data as Record<string, unknown>);
  writeCache([row, ...readCache().filter((item) => item.id !== row.id)]);
  return row;
}

export async function approveExploreBanner(id: string): Promise<ExploreBanner> {
  if (!isSupabaseConfigured) {
    const row = readCache().find((item) => item.id === id);
    if (!row) throw new Error('Banner bulunamadı.');
    const next = { ...row, is_active: true, status: 'live' as const };
    writeCache(readCache().map((item) => (item.id === id ? next : item)));
    return next;
  }
  let result = await supabase.from('explore_banners').update({ is_active: true, status: 'live' }).eq('id', id).select('*').single();
  if (result.error && /status|column|schema cache/i.test(result.error.message)) {
    result = await supabase.from('explore_banners').update({ is_active: true }).eq('id', id).select('*').single();
  }
  if (result.error || !result.data) throw new Error(result.error?.message || 'Banner onaylanamadı.');
  const row = asBanner(result.data as Record<string, unknown>);
  writeCache(readCache().map((item) => (item.id === id ? row : item)));
  return row;
}

export async function deleteExploreBanner(id: string): Promise<void> {
  if (!id) return;
  if (isSupabaseConfigured) {
    const { error } = await supabase.from('explore_banners').delete().eq('id', id);
    if (error) throw new Error(error.message || 'Banner silinemedi.');
  }
  writeCache(readCache().filter((item) => item.id !== id));
}

export function useExploreBanners() {
  const [banners, setBanners] = useState<ExploreBanner[]>(() => sortBanners(readCache()));
  useEffect(() => {
    let alive = true;
    const load = () => {
      void listExploreBanners().then((rows) => {
        if (alive) setBanners(rows);
      });
    };
    load();
    const onLocal = () => setBanners(sortBanners(readCache()));
    window.addEventListener(EVENT, onLocal);
    const stop = subscribeTables(['explore_banners'], load);
    return () => {
      alive = false;
      window.removeEventListener(EVENT, onLocal);
      stop();
    };
  }, []);
  return banners;
}
