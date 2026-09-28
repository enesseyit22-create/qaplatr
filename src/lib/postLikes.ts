import { useEffect, useState } from 'react';
import { isSupabaseConfigured, supabase } from '@/lib/supabase';
import { subscribeTables } from '@/lib/live';

const KEY = 'qapla_post_likes';
const EVENT = 'qapla-post-likes';

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
  window.dispatchEvent(new Event(EVENT));
}

export function isPostLiked(userId: string, postId: string) {
  return (readMap()[userId] ?? []).includes(postId);
}

export function countPostLikes(postId: string) {
  return Object.values(readMap()).filter((ids) => ids.includes(postId)).length;
}

export async function togglePostLike(userId: string, postId: string) {
  const map = readMap();
  const current = new Set(map[userId] ?? []);
  const liked = current.has(postId);
  if (liked) current.delete(postId);
  else current.add(postId);
  map[userId] = [...current];
  writeMap(map);

  if (isSupabaseConfigured) {
    try {
      if (liked) {
        await supabase.from('post_likes').delete().eq('user_id', userId).eq('post_id', postId);
      } else {
        await supabase.from('post_likes').upsert({ user_id: userId, post_id: postId }, { onConflict: 'user_id,post_id' });
      }
    } catch {
      // local like still counts if remote table lags
    }
  }
  return !liked;
}

export async function hydratePostLikes() {
  if (!isSupabaseConfigured) return readMap();
  const { data, error } = await supabase.from('post_likes').select('user_id, post_id');
  if (error || !data) return readMap();
  const map: Record<string, string[]> = {};
  for (const row of data) {
    const userId = String(row.user_id);
    const postId = String(row.post_id);
    map[userId] = [...(map[userId] ?? []), postId];
  }
  writeMap(map);
  return map;
}

export function usePostLikes(postId: string, userId?: string | null) {
  const [liked, setLiked] = useState(() => (userId ? isPostLiked(userId, postId) : false));
  const [count, setCount] = useState(() => countPostLikes(postId));

  useEffect(() => {
    const sync = () => {
      setLiked(userId ? isPostLiked(userId, postId) : false);
      setCount(countPostLikes(postId));
    };
    void hydratePostLikes().then(sync);
    window.addEventListener(EVENT, sync);
    const stop = subscribeTables(['post_likes'], () => { void hydratePostLikes().then(sync); });
    return () => {
      window.removeEventListener(EVENT, sync);
      stop();
    };
  }, [postId, userId]);

  return { liked, count };
}
