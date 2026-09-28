import { useEffect, useState } from 'react';
import { isSupabaseConfigured, supabase } from '@/lib/supabase';
import { subscribeTables } from '@/lib/live';

export type ReachKey = 'campaignKm' | 'storyKm' | 'postKm' | 'pushKm' | 'couponKm';

export type ReachSettings = Record<ReachKey, number>;

const KEY = 'qapla_reach';
const EVENT = 'qapla-reach';

export const REACH_FIELDS: { id: ReachKey; label: string; hint: string }[] = [
  { id: 'campaignKm', label: 'Kampanya', hint: 'Harita ve keşif listesi' },
  { id: 'storyKm', label: 'Hikaye', hint: 'Firma hikayesinin göründüğü çevre' },
  { id: 'postKm', label: 'Gönderi', hint: 'Firma gönderilerinin göründüğü çevre' },
  { id: 'pushKm', label: 'Bildirim', hint: 'Bölgesel duyurunun gittiği çevre' },
  { id: 'couponKm', label: 'Kupon', hint: 'Kuponun doğrulanabildiği çevre' },
];

const DEFAULTS: ReachSettings = {
  campaignKm: 2,
  storyKm: 1,
  postKm: 2,
  pushKm: 2,
  couponKm: 1,
};

function clampKm(value: number) {
  if (!Number.isFinite(value)) return 2;
  return Math.min(50, Math.max(0.5, Math.round(value * 10) / 10));
}

export function normalizeReach(raw: unknown): ReachSettings {
  const row = raw && typeof raw === 'object' ? raw as Partial<ReachSettings> : {};
  return {
    campaignKm: clampKm(Number(row.campaignKm ?? DEFAULTS.campaignKm)),
    storyKm: clampKm(Number(row.storyKm ?? DEFAULTS.storyKm)),
    postKm: clampKm(Number(row.postKm ?? DEFAULTS.postKm)),
    pushKm: clampKm(Number(row.pushKm ?? DEFAULTS.pushKm)),
    couponKm: clampKm(Number(row.couponKm ?? DEFAULTS.couponKm)),
  };
}

let live: ReachSettings = readReach();

function readReach(): ReachSettings {
  try {
    return normalizeReach(JSON.parse(localStorage.getItem(KEY) ?? '{}'));
  } catch {
    return { ...DEFAULTS };
  }
}

function apply(next: ReachSettings) {
  live = next;
  localStorage.setItem(KEY, JSON.stringify(next));
  window.dispatchEvent(new Event(EVENT));
}

export function campaignRadiusM() { return Math.round(live.campaignKm * 1000); }
export function storyRadiusM() { return Math.round(live.storyKm * 1000); }
export function postRadiusM() { return Math.round(live.postKm * 1000); }
export function pushRadiusM() { return Math.round(live.pushKm * 1000); }
export function couponRadiusM() { return Math.round(live.couponKm * 1000); }

export async function refreshReach() {
  if (!isSupabaseConfigured) return readReach();
  const { data, error } = await supabase.from('app_live_settings').select('reach').eq('id', 'main').maybeSingle();
  if (error) return readReach();
  const next = normalizeReach(data?.reach);
  apply(next);
  return next;
}

export async function saveReach(next: ReachSettings) {
  const clean = normalizeReach(next);
  apply(clean);
  if (!isSupabaseConfigured) return clean;
  const saved = await supabase.from('app_live_settings').update({ reach: clean }).eq('id', 'main');
  if (saved.error && /reach|schema cache|column/i.test(saved.error.message)) {
    throw new Error('Mesafe kaydı yok. 20260928230000_delete_cast_reach.sql dosyasını çalıştırın.');
  }
  if (saved.error) throw new Error(saved.error.message);
  return clean;
}

export function useReach() {
  const [reach, setReach] = useState(live);
  useEffect(() => {
    const sync = () => setReach(readReach());
    void refreshReach();
    window.addEventListener(EVENT, sync);
    const stop = subscribeTables(['app_live_settings'], () => { void refreshReach(); });
    return () => {
      window.removeEventListener(EVENT, sync);
      stop();
    };
  }, []);
  live = reach;
  return reach;
}
