import { useEffect, useState } from 'react';
import { isSupabaseConfigured, supabase } from '@/lib/supabase';
import { subscribeTables } from '@/lib/live';

const KEY = 'qapla_app_features';
const EVENT = 'qapla-features';

export type FeatureAudience = 'user' | 'merchant';

export type UserFeatureId =
  | 'details'
  | 'security'
  | 'settings'
  | 'explore'
  | 'coupons'
  | 'saved'
  | 'notify'
  | 'reviews'
  | 'help'
  | 'legal'
  | 'contact';

export type MerchantFeatureId =
  | 'details'
  | 'security'
  | 'settings'
  | 'explore'
  | 'notify'
  | 'help'
  | 'legal'
  | 'contact'
  | 'code'
  | 'campaigns'
  | 'stories'
  | 'report';

export type VipFeatureId = 'campaignAlerts';

export type AppFeatures = {
  user: Record<UserFeatureId, boolean>;
  merchant: Record<MerchantFeatureId, boolean>;
  vip: Record<VipFeatureId, boolean>;
};

export const USER_FEATURE_ITEMS: { id: UserFeatureId; label: string; hint: string }[] = [
  { id: 'details', label: 'Bilgilerim', hint: 'Ad, soyad, telefon' },
  { id: 'security', label: 'Şifre ve e-posta', hint: 'Şifre ve e-posta değiştir' },
  { id: 'settings', label: 'Ayarlar', hint: 'Tercih ekranı' },
  { id: 'explore', label: 'Harita ve Keşfet', hint: 'Haritaya dönüş' },
  { id: 'coupons', label: 'Kuponlarım ve geçmişim', hint: 'Ziyaretler' },
  { id: 'saved', label: 'Kaydedilen fırsatlar', hint: 'Favoriler' },
  { id: 'notify', label: 'Bildirim tercihleri ve sesleri', hint: 'Push ve ses' },
  { id: 'reviews', label: 'Yorumlarım', hint: 'Kullanıcı yorumları' },
  { id: 'help', label: 'Yardım ve destek', hint: 'SSS' },
  { id: 'legal', label: 'Sözleşmeler', hint: 'Yasal metinler' },
  { id: 'contact', label: 'Destek', hint: 'destek@qlaptr.com' },
];

export const MERCHANT_FEATURE_ITEMS: { id: MerchantFeatureId; label: string; hint: string }[] = [
  { id: 'details', label: 'Firma bilgileri', hint: 'Profil ve iletişim' },
  { id: 'security', label: 'Şifre ve e-posta', hint: 'Şifre ve e-posta değiştir' },
  { id: 'settings', label: 'Ayarlar', hint: 'Tercih ekranı' },
  { id: 'explore', label: 'Harita ve Keşfet', hint: 'Haritaya dönüş' },
  { id: 'code', label: 'Kod onay', hint: 'Kupon doğrulama' },
  { id: 'campaigns', label: 'Kampanya', hint: 'Oluştur / stok' },
  { id: 'stories', label: 'Hikaye', hint: 'Firma paylaşımı' },
  { id: 'report', label: 'Rapor', hint: 'Kullanım özeti' },
  { id: 'notify', label: 'Bildirim tercihleri', hint: 'Push ve ses' },
  { id: 'help', label: 'Yardım ve destek', hint: 'SSS' },
  { id: 'legal', label: 'Sözleşmeler', hint: 'Yasal metinler' },
  { id: 'contact', label: 'Destek', hint: 'destek@qlaptr.com' },
];

const DEFAULT_FEATURES: AppFeatures = {
  user: {
    details: true,
    security: true,
    settings: true,
    explore: true,
    coupons: true,
    saved: true,
    notify: true,
    reviews: true,
    help: true,
    legal: true,
    contact: true,
  },
  merchant: {
    details: true,
    security: true,
    settings: true,
    explore: true,
    notify: true,
    help: true,
    legal: true,
    contact: true,
    code: true,
    campaigns: true,
    stories: true,
    report: true,
  },
  vip: {
    campaignAlerts: false,
  },
};

function recordOrEmpty(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return {};
  return value as Record<string, unknown>;
}

function mergeFeatures(raw: unknown): AppFeatures {
  const parsed = recordOrEmpty(raw);
  return {
    user: { ...DEFAULT_FEATURES.user, ...recordOrEmpty(parsed.user) } as AppFeatures['user'],
    merchant: { ...DEFAULT_FEATURES.merchant, ...recordOrEmpty(parsed.merchant) } as AppFeatures['merchant'],
    vip: { ...DEFAULT_FEATURES.vip, ...recordOrEmpty(parsed.vip) } as AppFeatures['vip'],
  };
}

export function readAppFeatures(): AppFeatures {
  try {
    return mergeFeatures(JSON.parse(localStorage.getItem(KEY) ?? '{}'));
  } catch {
    return DEFAULT_FEATURES;
  }
}

export function writeAppFeatures(next: AppFeatures) {
  localStorage.setItem(KEY, JSON.stringify(next));
  window.dispatchEvent(new Event(EVENT));
  if (isSupabaseConfigured) {
    void supabase.from('app_live_settings').update({ features: next }).eq('id', 'main');
  }
}

export async function refreshAppFeatures() {
  if (!isSupabaseConfigured) return readAppFeatures();
  const { data } = await supabase.from('app_live_settings').select('features').eq('id', 'main').maybeSingle();
  const next = mergeFeatures(data?.features);
  localStorage.setItem(KEY, JSON.stringify(next));
  window.dispatchEvent(new Event(EVENT));
  return next;
}

export function setAppFeature<A extends FeatureAudience>(
  audience: A,
  id: keyof AppFeatures[A],
  value: boolean,
) {
  const current = readAppFeatures();
  writeAppFeatures({
    ...current,
    [audience]: { ...current[audience], [id]: value },
  });
}

export function setVipFeature(id: VipFeatureId, value: boolean) {
  const current = readAppFeatures();
  writeAppFeatures({
    ...current,
    vip: { ...current.vip, [id]: value },
  });
}

export function accountHasVip(profile?: { vip?: boolean | null } | null) {
  return Boolean(profile && profile.vip);
}

export function campaignAlertsAllowed(profile?: { vip?: boolean | null } | null) {
  return Boolean(readAppFeatures().vip.campaignAlerts && accountHasVip(profile));
}

export function useAppFeatures() {
  const [features, setFeatures] = useState(readAppFeatures);
  useEffect(() => {
    const sync = () => setFeatures(readAppFeatures());
    void refreshAppFeatures();
    window.addEventListener(EVENT, sync);
    window.addEventListener('storage', sync);
    const stop = subscribeTables(['app_live_settings'], () => { void refreshAppFeatures(); });
    return () => {
      window.removeEventListener(EVENT, sync);
      window.removeEventListener('storage', sync);
      stop();
    };
  }, []);
  return features;
}
