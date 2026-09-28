import type { CouponClaim, Merchant, OfferWithMerchant } from '@/lib/supabase';

export const DEMO_MERCHANTS: Merchant[] = [
  {
    id: 'demo-mod-kahve',
    name: 'Mod Kahve',
    category: 'Kafe',
    address: 'Moda Caddesi No: 24, Kadıköy',
    phone: '0216 330 24 24',
    latitude: 40.9873,
    longitude: 29.0285,
    distance_m: 110,
    description: 'İkinci espresso veya americano hediye.',
    accent: '#1dc9a0',
    is_open: true,
    is_featured: true,
    created_at: new Date().toISOString(),
  },
  {
    id: 'demo-burger-lab',
    name: 'Burger Lab',
    category: 'Yeme & İçme',
    address: 'Mühürdar Sokak No: 18, Kadıköy',
    phone: '0216 418 18 18',
    latitude: 40.9887,
    longitude: 29.0308,
    distance_m: 186,
    description: 'Klasik smash menüde geç saat indirimi.',
    accent: '#f2b84b',
    is_open: true,
    is_featured: true,
    created_at: new Date().toISOString(),
  },
  {
    id: 'demo-mint-gelato',
    name: 'Mint Gelato',
    category: 'Yeme & İçme',
    address: 'Rıhtım Caddesi No: 12, Kadıköy',
    phone: '0216 450 12 12',
    latitude: 40.9906,
    longitude: 29.0254,
    distance_m: 241,
    description: 'İkinci top nane-çikolata dondurma hediye.',
    accent: '#72c9df',
    is_open: true,
    is_featured: true,
    created_at: new Date().toISOString(),
  },
  {
    id: 'demo-qap-fit',
    name: 'Qap Fit',
    category: 'Spor',
    address: 'Bahariye Caddesi No: 56, Kadıköy',
    phone: '0216 346 56 56',
    latitude: 40.9894,
    longitude: 29.0324,
    distance_m: 283,
    description: 'Günlük girişte stüdyo ve havlu dahil.',
    accent: '#5e9cf0',
    is_open: true,
    is_featured: false,
    created_at: new Date().toISOString(),
  },
  {
    id: 'demo-nane-berber',
    name: 'Nane Berber',
    category: 'Güzellik',
    address: 'Moda Sokak No: 9, Kadıköy',
    phone: '0216 338 09 09',
    latitude: 40.9858,
    longitude: 29.0262,
    distance_m: 298,
    description: 'Fade ve sakal bakımında fırsat.',
    accent: '#ed8fba',
    is_open: false,
    is_featured: false,
    created_at: new Date().toISOString(),
  },
  {
    id: 'demo-moda-dekor',
    name: 'Moda Atölye',
    category: 'Dekorasyon',
    address: 'Caferağa Mahallesi, Kadıköy',
    phone: '0216 336 40 40',
    latitude: 40.9869,
    longitude: 29.0248,
    distance_m: 340,
    description: 'Vazo ve mum setinde ev dekor fırsatı.',
    accent: '#c4a574',
    is_open: true,
    is_featured: false,
    created_at: new Date().toISOString(),
  },
  {
    id: 'demo-rihtim-live',
    name: 'Rıhtım Live',
    category: 'Eğlence',
    address: 'Kadıköy Rıhtım, Kadıköy',
    phone: '0216 414 70 70',
    latitude: 40.9914,
    longitude: 29.0231,
    distance_m: 390,
    description: 'Akşam sahnesinde ikinci içecek hediye.',
    accent: '#9b6bff',
    is_open: true,
    is_featured: false,
    created_at: new Date().toISOString(),
  },
];

const hoursFromNow = (hours: number) => new Date(Date.now() + hours * 3600000).toISOString();

export const DEMO_OFFERS: OfferWithMerchant[] = [
  {
    id: 'demo-offer-espresso',
    merchant_id: 'demo-mod-kahve',
    title: 'İkinci espresso bizden',
    description: 'Aynı siparişte ikinci espresso veya americano hediye.',
    discount: '%50',
    category: 'Kafe',
    badge: 'Yeni',
    expires_at: hoursFromNow(6),
    stock: 28,
    is_featured: true,
    is_active: true,
    created_at: new Date().toISOString(),
    qapla_merchants: DEMO_MERCHANTS[0],
  },
  {
    id: 'demo-offer-burger',
    merchant_id: 'demo-burger-lab',
    title: 'Smash burger %35',
    description: 'Klasik smash menüde geç saat indirimi. Patates dahil.',
    discount: '%35',
    category: 'Yeme & İçme',
    badge: 'Yeni',
    expires_at: hoursFromNow(4),
    stock: 18,
    is_featured: true,
    is_active: true,
    created_at: new Date().toISOString(),
    qapla_merchants: DEMO_MERCHANTS[1],
  },
  {
    id: 'demo-offer-gelato',
    merchant_id: 'demo-mint-gelato',
    title: 'Çift top nane',
    description: 'İkinci top nane-çikolata dondurma hediye.',
    discount: '%45',
    category: 'Yeme & İçme',
    badge: 'Sınırlı',
    expires_at: hoursFromNow(3),
    stock: 33,
    is_featured: true,
    is_active: true,
    created_at: new Date().toISOString(),
    qapla_merchants: DEMO_MERCHANTS[2],
  },
  {
    id: 'demo-offer-fit',
    merchant_id: 'demo-qap-fit',
    title: 'Günlük giriş fırsatı',
    description: 'Tek seferlik stüdyo girişi, havlu dahil.',
    discount: '%60',
    category: 'Spor',
    badge: 'Popüler',
    expires_at: hoursFromNow(8),
    stock: 9,
    is_featured: false,
    is_active: true,
    created_at: new Date().toISOString(),
    qapla_merchants: DEMO_MERCHANTS[3],
  },
  {
    id: 'demo-offer-berber',
    merchant_id: 'demo-nane-berber',
    title: 'Fade + sakal %40',
    description: 'Bugün 22:00’ye kadar fade kesim ve sakal düzenleme.',
    discount: '%40',
    category: 'Güzellik',
    badge: 'Bugün',
    expires_at: hoursFromNow(2),
    stock: 7,
    is_featured: false,
    is_active: true,
    created_at: new Date().toISOString(),
    qapla_merchants: DEMO_MERCHANTS[4],
  },
  {
    id: 'demo-offer-dekor',
    merchant_id: 'demo-moda-dekor',
    title: 'Mum & vazo seti %30',
    description: 'El yapımı mum ve seramik vazoda kombin indirimi.',
    discount: '%30',
    category: 'Dekorasyon',
    badge: 'Yeni',
    expires_at: hoursFromNow(10),
    stock: 12,
    is_featured: false,
    is_active: true,
    created_at: new Date().toISOString(),
    qapla_merchants: DEMO_MERCHANTS[5],
  },
  {
    id: 'demo-offer-live',
    merchant_id: 'demo-rihtim-live',
    title: 'Sahne gecesi ikram',
    description: 'Canlı müzik gecesinde ikinci içecek hediye.',
    discount: '%25',
    category: 'Eğlence',
    badge: 'Bu gece',
    expires_at: hoursFromNow(5),
    stock: 40,
    is_featured: false,
    is_active: true,
    created_at: new Date().toISOString(),
    qapla_merchants: DEMO_MERCHANTS[6],
  },
];

const LOCAL_CLAIMS_KEY = 'qapla_local_claims';

export function readLocalClaims(): CouponClaim[] {
  try {
    const raw = localStorage.getItem(LOCAL_CLAIMS_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as CouponClaim[];
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

export function writeLocalClaim(claim: CouponClaim) {
  const next = [claim, ...readLocalClaims().filter((c) => c.id !== claim.id)];
  localStorage.setItem(LOCAL_CLAIMS_KEY, JSON.stringify(next));
}

export function approveAnyCouponCode(code: string) {
  const normalized = code.replace(/\s+/g, '').toUpperCase();
  const claim = readLocalClaims().find((item) => item.code.replace(/\s+/g, '').toUpperCase() === normalized);
  if (!claim) throw new Error('Bu koda ait kupon bulunamadı.');
  if (claim.status === 'used') throw new Error('Bu kupon zaten onaylanmış.');
  if (claim.status === 'cancelled' || claim.status === 'deleted') throw new Error('Bu kupon geçersiz.');
  const next = { ...claim, status: 'used' as const };
  writeLocalClaim(next);
  return next;
}

export function deleteLocalClaim(id: string) {
  localStorage.setItem(LOCAL_CLAIMS_KEY, JSON.stringify(readLocalClaims().filter((c) => c.id !== id)));
}

export function cancelLocalClaim(id: string) {
  const claim = readLocalClaims().find((item) => item.id === id);
  if (!claim) return;
  writeLocalClaim({ ...claim, status: 'cancelled' });
}

export function restoreLocalClaim(id: string) {
  const claim = readLocalClaims().find((item) => item.id === id);
  if (!claim) return;
  writeLocalClaim({ ...claim, status: 'active' });
}
