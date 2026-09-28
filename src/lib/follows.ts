import { notifyCompanyOfFollow } from '@/lib/companyPush';
import { isSupabaseConfigured, supabase } from '@/lib/supabase';

const KEY = 'qapla_follows';

function readMap(): Record<string, string[]> {
  try {
    const parsed = JSON.parse(localStorage.getItem(KEY) ?? '{}') as Record<string, string[]>;
    return parsed && typeof parsed === 'object' ? parsed : {};
  } catch {
    return {};
  }
}

function writeMap(value: Record<string, string[]>) {
  localStorage.setItem(KEY, JSON.stringify(value));
}

export function listFollowedIds(userId: string): string[] {
  return readMap()[userId] ?? [];
}

export function isFollowing(userId: string, companyId: string) {
  return listFollowedIds(userId).includes(companyId);
}

export function countFollowers(companyId: string) {
  return Object.values(readMap()).filter((ids) => ids.includes(companyId)).length;
}

export async function countFollowersRemote(companyId: string) {
  const local = countFollowers(companyId);
  if (!isSupabaseConfigured) return local;
  const { count, error } = await supabase
    .from('follows')
    .select('*', { count: 'exact', head: true })
    .eq('business_id', companyId);
  if (error || count == null) return local;
  return Math.max(local, count);
}

export async function setFollowing(userId: string, companyId: string, follow: boolean) {
  const map = readMap();
  const current = new Set(map[userId] ?? []);
  if (follow) current.add(companyId);
  else current.delete(companyId);
  map[userId] = [...current];
  writeMap(map);

  if (isSupabaseConfigured) {
    if (follow) {
      const { error } = await supabase.from('follows').upsert(
        { user_id: userId, business_id: companyId },
        { onConflict: 'user_id,business_id' },
      );
      if (!error) void notifyCompanyOfFollow(companyId);
    } else {
      await supabase.from('follows').delete().eq('user_id', userId).eq('business_id', companyId);
    }
  }
  return follow;
}

export async function hydrateFollows(userId: string) {
  if (!isSupabaseConfigured || !userId) return listFollowedIds(userId);
  const { data, error } = await supabase.from('follows').select('business_id').eq('user_id', userId);
  if (error || !data) return listFollowedIds(userId);
  const ids = data.map((row) => String(row.business_id ?? '')).filter(Boolean);
  const map = readMap();
  map[userId] = ids;
  writeMap(map);
  return ids;
}
