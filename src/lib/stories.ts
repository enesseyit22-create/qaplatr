import { useEffect, useState } from 'react';
import { distanceMeters, hasValidCoords, NEARBY_RADIUS_M } from '@/lib/geo';
import { isSupabaseConfigured, supabase } from '@/lib/supabase';
import { subscribeTables } from '@/lib/live';

export const STORY_TTL_MS = 24 * 60 * 60 * 1000;
const STORIES_KEY = 'qapla_stories';
const STORY_PERMS_KEY = 'qapla_story_permissions';
const STORY_SEEN_KEY = 'qapla_story_seen';
const STORY_EVENT = 'qapla-stories';
export type Story = {
  id: string;
  company_id: string | null;
  company_name: string;
  image_data: string;
  caption: string;
  created_at: string;
  expires_at: string;
  created_by: 'admin' | 'merchant';
  latitude?: number | null;
  longitude?: number | null;
};

export type StoryPermission = {
  company_id: string;
  allowed: boolean;
  updated_at: string;
};

function readJson<T>(key: string): T[] {
  try {
    const parsed = JSON.parse(localStorage.getItem(key) ?? '[]') as T[];
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function writeJson<T>(key: string, value: T[]) {
  localStorage.setItem(key, JSON.stringify(value));
  window.dispatchEvent(new Event(STORY_EVENT));
}

export function readStoryPermissions(): StoryPermission[] {
  return readJson<StoryPermission>(STORY_PERMS_KEY);
}

export function canCompanyPostStories(companyId: string | null | undefined) {
  if (!companyId) return false;
  return readStoryPermissions().some((item) => item.company_id === companyId && item.allowed);
}

export function setCompanyStoryPermission(companyId: string, allowed: boolean) {
  const next = [
    { company_id: companyId, allowed, updated_at: new Date().toISOString() },
    ...readStoryPermissions().filter((item) => item.company_id !== companyId),
  ];
  writeJson(STORY_PERMS_KEY, next);
  if (isSupabaseConfigured) {
    void supabase.from('story_permissions').upsert({
      company_id: companyId,
      allowed,
      updated_at: new Date().toISOString(),
    });
  }
}

export function readStories(): Story[] {
  if (!isSupabaseConfigured) ensureDemoStories();
  const now = Date.now();
  const live = readJson<Story>(STORIES_KEY).filter((item) => {
    const created = new Date(item.created_at).getTime();
    if (item.created_by !== 'admin') return created + STORY_TTL_MS > now;
    return new Date(item.expires_at).getTime() > now;
  });
  if (live.length !== readJson<Story>(STORIES_KEY).length) writeJson(STORIES_KEY, live);
  return live.sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());
}

function asStory(row: Record<string, unknown>): Story {
  return {
    id: String(row.id),
    company_id: (row.company_id as string | null) ?? null,
    company_name: String(row.company_name ?? 'QapLA'),
    image_data: String(row.image_data ?? ''),
    caption: String(row.caption ?? ''),
    created_at: String(row.created_at ?? new Date().toISOString()),
    expires_at: String(row.expires_at ?? new Date().toISOString()),
    created_by: row.created_by === 'merchant' ? 'merchant' : 'admin',
    latitude: typeof row.latitude === 'number' ? row.latitude : null,
    longitude: typeof row.longitude === 'number' ? row.longitude : null,
  };
}

export async function refreshStories() {
  if (!isSupabaseConfigured) return readStories();
  const [{ data: storyRows }, { data: permRows }] = await Promise.all([
    supabase.from('stories').select('*').gt('expires_at', new Date().toISOString()).order('created_at', { ascending: false }),
    supabase.from('story_permissions').select('*'),
  ]);
  if (storyRows) writeJson(STORIES_KEY, storyRows.map((item) => asStory(item as Record<string, unknown>)));
  if (permRows) writeJson(STORY_PERMS_KEY, permRows as StoryPermission[]);
  return readStories();
}

export function storiesForCompany(companyId: string) {
  return readStories().filter((item) => item.company_id === companyId);
}

export async function addStory(input: Omit<Story, 'id' | 'created_at' | 'expires_at'>) {
  const now = Date.now();
  const ttl = input.created_by === 'admin' ? 365 * STORY_TTL_MS : STORY_TTL_MS;
  const row: Story = {
    ...input,
    id: crypto.randomUUID(),
    created_at: new Date(now).toISOString(),
    expires_at: new Date(now + ttl).toISOString(),
  };
  if (isSupabaseConfigured) {
    const { data, error } = await supabase.from('stories').insert({
      company_id: row.company_id,
      company_name: row.company_name,
      image_data: row.image_data,
      caption: row.caption,
      created_by: row.created_by,
      latitude: row.latitude ?? null,
      longitude: row.longitude ?? null,
      expires_at: row.expires_at,
    }).select('*').single();
    if (error) throw error;
    const saved = asStory(data as Record<string, unknown>);
    writeJson(STORIES_KEY, [saved, ...readJson<Story>(STORIES_KEY).filter((item) => item.id !== saved.id)]);
    return saved;
  }
  writeJson(STORIES_KEY, [row, ...readJson<Story>(STORIES_KEY)]);
  return row;
}

export async function removeStory(id: string) {
  writeJson(STORIES_KEY, readJson<Story>(STORIES_KEY).filter((item) => item.id !== id));
  if (isSupabaseConfigured) {
    await supabase.from('stories').delete().eq('id', id);
  }
}

export function nearbyStories(
  origin: { latitude: number; longitude: number } | null,
  source = readStories(),
): Story[] {
  const rows = source;
  if (!origin || !hasValidCoords(origin)) {
    return rows
      .filter((item) => !item.company_id)
      .sort((a, b) => Number(b.created_by === 'admin') - Number(a.created_by === 'admin') || byFreshness(a, b));
  }
  return rows
    .map((item) => {
      const hasPin = hasValidCoords({ latitude: item.latitude, longitude: item.longitude });
      const meters = hasPin
        ? distanceMeters(origin.latitude, origin.longitude, Number(item.latitude), Number(item.longitude))
        : item.company_id
          ? Number.POSITIVE_INFINITY
          : 0;
      return { item, meters };
    })
    .filter((row) => !row.item.company_id || row.meters <= NEARBY_RADIUS_M)
    .sort((a, b) => {
      const vip = Number(b.item.created_by === 'admin') - Number(a.item.created_by === 'admin');
      if (vip) return vip;
      return a.meters - b.meters || new Date(b.item.created_at).getTime() - new Date(a.item.created_at).getTime();
    })
    .map((row) => row.item);
}

function byFreshness(a: Story, b: Story) {
  return new Date(b.created_at).getTime() - new Date(a.created_at).getTime();
}

export function readSeenStoryIds(): string[] {
  return readJson<string>(STORY_SEEN_KEY);
}

export function markStorySeen(id: string) {
  const ids = new Set(readSeenStoryIds());
  ids.add(id);
  writeJson(STORY_SEEN_KEY, [...ids]);
}

export async function fileToVerticalStoryImage(file: File): Promise<string> {
  const url = URL.createObjectURL(file);
  try {
    const image = await new Promise<HTMLImageElement>((resolve, reject) => {
      const img = new Image();
      img.onload = () => resolve(img);
      img.onerror = () => reject(new Error('Görsel okunamadı'));
      img.src = url;
    });
    const maxW = 1080;
    const maxH = 1920;
    let width = image.naturalWidth || image.width;
    let height = image.naturalHeight || image.height;
    const scale = Math.min(maxW / width, maxH / height, 1);
    width = Math.max(1, Math.round(width * scale));
    height = Math.max(1, Math.round(height * scale));
    const canvas = document.createElement('canvas');
    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext('2d');
    if (!ctx) throw new Error('Görsel işlenemedi');
    ctx.drawImage(image, 0, 0, width, height);
    return canvas.toDataURL('image/jpeg', 0.82);
  } finally {
    URL.revokeObjectURL(url);
  }
}

function ensureDemoStories() {
  if (localStorage.getItem(STORIES_KEY)) return;
  const now = Date.now();
  const demos: Story[] = [
    {
      id: 'demo-story-mod',
      company_id: 'demo-mod-kahve',
      company_name: 'Mod Kahve',
      caption: 'İkinci espresso bizden ☕',
      created_by: 'admin',
      latitude: 40.9873,
      longitude: 29.0285,
      created_at: new Date(now).toISOString(),
      expires_at: new Date(now + 365 * STORY_TTL_MS).toISOString(),
      image_data: posterSvg('#0f766e', '#99f6e4', 'Mod Kahve', 'Bugün 2. espresso hediye'),
    },
    {
      id: 'demo-story-burger',
      company_id: 'demo-burger-lab',
      company_name: 'Burger Lab',
      caption: 'Smash burger %35',
      created_by: 'admin',
      latitude: 40.9887,
      longitude: 29.0308,
      created_at: new Date(now - 3600000).toISOString(),
      expires_at: new Date(now + 365 * STORY_TTL_MS).toISOString(),
      image_data: posterSvg('#9a3412', '#fed7aa', 'Burger Lab', 'Akşam menüsünde %35'),
    },
    {
      id: 'demo-story-qapla',
      company_id: null,
      company_name: 'QapLA',
      caption: 'Yakındaki fırsatları keşfet',
      created_by: 'admin',
      latitude: null,
      longitude: null,
      created_at: new Date(now - 7200000).toISOString(),
      expires_at: new Date(now + 365 * STORY_TTL_MS).toISOString(),
      image_data: posterSvg('#115e59', '#5eead4', 'QapLA', '1 km içindeki hikayeler'),
    },
  ];
  writeJson(STORIES_KEY, demos);
  setCompanyStoryPermission('demo-mod-kahve', true);
  setCompanyStoryPermission('demo-burger-lab', true);
}

function posterSvg(from: string, to: string, title: string, line: string) {
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="720" height="1280">
    <defs><linearGradient id="g" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0" stop-color="${from}"/><stop offset="1" stop-color="${to}"/>
    </linearGradient></defs>
    <rect width="720" height="1280" fill="url(#g)"/>
    <circle cx="360" cy="420" r="86" fill="rgba(255,255,255,0.18)"/>
    <text x="360" y="640" text-anchor="middle" fill="white" font-size="54" font-family="system-ui" font-weight="800">${escapeXml(title)}</text>
    <text x="360" y="710" text-anchor="middle" fill="rgba(255,255,255,0.88)" font-size="28" font-family="system-ui">${escapeXml(line)}</text>
  </svg>`;
  return `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;
}

function escapeXml(value: string) {
  return value.replace(/[<>&"]/g, (char) => ({ '<': '&lt;', '>': '&gt;', '&': '&amp;', '"': '&quot;' }[char] ?? char));
}

export function useLiveStories() {
  const [rows, setRows] = useState(readStories);
  useEffect(() => {
    const sync = () => setRows(readStories());
    void refreshStories();
    window.addEventListener(STORY_EVENT, sync);
    const stop = subscribeTables(['stories', 'story_permissions'], () => { void refreshStories(); });
    return () => {
      window.removeEventListener(STORY_EVENT, sync);
      stop();
    };
  }, []);
  return rows;
}
