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
  const { data, error } = await supabase.rpc('count_company_followers', { p_company_id: companyId });
  if (!error && data != null && data !== '') {
    const next = Number(data);
    if (Number.isFinite(next)) return next;
  }
  const counted = await supabase
    .from('follows')
    .select('*', { count: 'exact', head: true })
    .eq('business_id', companyId);
  if (counted.error || counted.count == null) return local;
  return counted.count;
}

async function authUserId(fallback: string) {
  const session = await supabase.auth.getUser();
  return session.data.user?.id || fallback;
}

function remember(userId: string, ids: string[]) {
  const map = readMap();
  map[userId] = ids;
  writeMap(map);
}

export async function setFollowing(userId: string, companyId: string, follow: boolean) {
  const map = readMap();
  const current = new Set(map[userId] ?? []);
  if (follow) current.add(companyId);
  else current.delete(companyId);
  map[userId] = [...current];
  writeMap(map);

  if (!isSupabaseConfigured) return follow;
  const uid = await authUserId(userId);
  if (follow) {
    const { error } = await supabase.from('follows').upsert(
      { user_id: uid, business_id: companyId },
      { onConflict: 'user_id,business_id' },
    );
    if (error) {
      current.delete(companyId);
      map[userId] = [...current];
      writeMap(map);
      console.warn('Takip kaydı yazılamadı', error.message);
      return false;
    }
    if (uid !== userId) remember(uid, map[userId]);
    void notifyCompanyOfFollow(companyId);
    return true;
  }

  const { error } = await supabase.from('follows').delete().eq('user_id', uid).eq('business_id', companyId);
  if (error) {
    current.add(companyId);
    map[userId] = [...current];
    writeMap(map);
    console.warn('Takip kaydı silinemedi', error.message);
    return true;
  }
  if (uid !== userId) remember(uid, map[userId]);
  return false;
}

export async function hydrateFollows(userId: string) {
  if (!isSupabaseConfigured || !userId) return listFollowedIds(userId);
  const uid = await authUserId(userId);
  const { data, error } = await supabase.from('follows').select('business_id').eq('user_id', uid);
  if (error || !data) return listFollowedIds(userId);
  let ids = data.map((row) => String(row.business_id ?? '')).filter(Boolean);
  if (ids.length === 0) {
    const pending = listFollowedIds(userId);
    for (const companyId of pending) {
      const saved = await supabase.from('follows').upsert(
        { user_id: uid, business_id: companyId },
        { onConflict: 'user_id,business_id' },
      );
      if (!saved.error) ids.push(companyId);
    }
    if (ids.length === 0 && pending.length > 0) return pending;
  }
  remember(userId, ids);
  if (uid !== userId) remember(uid, ids);
  return ids;
}
