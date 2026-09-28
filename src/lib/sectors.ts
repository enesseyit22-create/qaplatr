export type ExploreCategoryId =
  | 'esnaf'
  | 'restoran'
  | 'firsat'
  | 'guzellik'
  | 'spor'
  | 'dekorasyon'
  | 'eglence'
  | 'gelinlik'
  | 'mobilya';

export const EXPLORE_SECTORS: { id: ExploreCategoryId; label: string }[] = [
  { id: 'esnaf', label: 'Yerel Esnaf' },
  { id: 'gelinlik', label: 'Gelinlik' },
  { id: 'mobilya', label: 'Mobilya' },
  { id: 'restoran', label: 'Restoran' },
  { id: 'firsat', label: 'Hızlı Fırsatlar' },
  { id: 'guzellik', label: 'Güzellik' },
  { id: 'spor', label: 'Spor' },
  { id: 'dekorasyon', label: 'Dekorasyon' },
  { id: 'eglence', label: 'Eğlence' },
];

export const COMPANY_CATEGORIES = [
  'Restoran',
  'Kafe',
  'Yeme & İçme',
  'Market',
  'Giyim',
  'Gelinlik',
  'Güzellik',
  'Güzellik & Bakım',
  'Spor',
  'Sağlık',
  'Mobilya',
  'Dekorasyon',
  'Eğlence',
  'Teknoloji',
  'E-Ticaret',
  'Hizmet',
  'Eğitim',
  'Otomotiv',
  'Emlak',
  'Kargo',
  'Lojistik',
  'Pet',
  'Çocuk',
  'Kurumsal',
  'Yerel Esnaf',
] as const;

export type ExploreFeedId =
  | 'all'
  | 'food'
  | 'cafe'
  | 'market'
  | 'wear'
  | 'bridal'
  | 'beauty'
  | 'sport'
  | 'health'
  | 'furniture'
  | 'decor'
  | 'fun'
  | 'tech'
  | 'service'
  | 'education'
  | 'auto'
  | 'estate'
  | 'cargo'
  | 'pet'
  | 'kids'
  | 'corporate'
  | 'deal';

export const EXPLORE_FEED: { id: ExploreFeedId; label: string }[] = [
  { id: 'all', label: 'Tümü' },
  { id: 'food', label: 'Yeme-İçme' },
  { id: 'cafe', label: 'Kafe' },
  { id: 'market', label: 'Market' },
  { id: 'wear', label: 'Giyim' },
  { id: 'bridal', label: 'Gelinlik' },
  { id: 'beauty', label: 'Güzellik' },
  { id: 'sport', label: 'Spor' },
  { id: 'health', label: 'Sağlık' },
  { id: 'furniture', label: 'Mobilya' },
  { id: 'decor', label: 'Dekorasyon' },
  { id: 'fun', label: 'Eğlence' },
  { id: 'tech', label: 'Teknoloji' },
  { id: 'service', label: 'Hizmet' },
  { id: 'education', label: 'Eğitim' },
  { id: 'auto', label: 'Otomotiv' },
  { id: 'estate', label: 'Emlak' },
  { id: 'cargo', label: 'Kargo' },
  { id: 'pet', label: 'Pet' },
  { id: 'kids', label: 'Çocuk' },
  { id: 'corporate', label: 'Kurumsal' },
  { id: 'deal', label: 'Fırsatlar' },
];

const FEED_WORDS: Record<Exclude<ExploreFeedId, 'all' | 'deal'>, string[]> = {
  food: ['restoran', 'yeme', 'içecek', 'icecek', 'lokanta', 'döner', 'doner', 'kebap', 'pideci', 'pastane', 'fırın', 'firin', 'tatlı', 'tatli', 'kasap'],
  cafe: ['kafe', 'kahve', 'cafe', 'çay ocağı', 'cay ocagi'],
  market: ['market', 'bakkal', 'manav', 'şarküteri', 'sarkuteri', 'gıda', 'gida'],
  wear: ['giyim', 'kıyafet', 'kiyafet', 'tekstil', 'ayakkabı', 'ayakkabi', 'butik'],
  bridal: ['gelinlik', 'düğün', 'dugun', 'nişan', 'nisan', 'abiye'],
  beauty: ['güzellik', 'guzellik', 'kuaf', 'berber', 'bakım', 'bakim', 'spa', 'estetik'],
  sport: ['spor', 'fitness', 'gym', 'pilates', 'yoga'],
  health: ['sağlık', 'saglik', 'eczane', 'klinik', 'diş', 'hastane', 'veteriner'],
  furniture: ['mobilya'],
  decor: ['dekor', 'aydınlatma', 'aydinlatma'],
  fun: ['eğlence', 'eglence', 'konser', 'sinema', 'oyun salonu', 'gece kulübü', 'gece kulubu', 'pub'],
  tech: ['tekno', 'elektronik', 'telefon', 'bilgisayar', 'yazılım', 'yazilim', 'e-ticaret'],
  service: ['hizmet', 'temizlik', 'tamir', 'tesisat', 'nakliye', 'boyacı', 'boyaci'],
  education: ['eğitim', 'egitim', 'kurs', 'dershane', 'anaokul', 'okul'],
  auto: ['otomotiv', 'oto servis', 'lastik', 'araç', 'arac yikama', 'araç yıkama'],
  estate: ['emlak', 'gayrimenkul'],
  cargo: ['kargo', 'lojistik', 'kurye'],
  pet: ['petshop', 'pet shop', 'hayvan', 'mama'],
  kids: ['çocuk', 'cocuk', 'bebek', 'oyuncak'],
  corporate: ['kurumsal', 'ofis', 'muhasebe', 'danışman', 'danisman'],
};

export function matchesExploreFeed(
  feed: ExploreFeedId,
  parts: { category?: string | null; title?: string | null; featured?: boolean; expiresSoon?: boolean },
) {
  if (feed === 'all') return true;
  if (feed === 'deal') return Boolean(parts.featured || parts.expiresSoon);
  const hay = `${parts.category ?? ''} ${parts.title ?? ''}`.toLocaleLowerCase('tr');
  return FEED_WORDS[feed].some((word) => hay.includes(word));
}

export function sectorIdForCategory(category?: string | null): ExploreCategoryId {
  const value = (category ?? '').toLocaleLowerCase('tr');
  if (value.includes('restoran') || value.includes('yeme') || value.includes('kafe') || value.includes('kahve')) return 'restoran';
  if (value.includes('güzellik') || value.includes('guzellik') || value.includes('kuaf') || value.includes('salon')) return 'guzellik';
  if (value.includes('spor') || value.includes('fitness') || value.includes('gym')) return 'spor';
  if (value.includes('gelinlik') || value.includes('düğün') || value.includes('dugun') || value.includes('nişan')) return 'gelinlik';
  if (value.includes('mobilya')) return 'mobilya';
  if (value.includes('dekor') || value.includes('ev')) return 'dekorasyon';
  if (value.includes('eğlence') || value.includes('eglence') || value.includes('bar') || value.includes('konser') || value.includes('oyun')) return 'eglence';
  if (value.includes('fırsat') || value.includes('firsat') || value.includes('indirim')) return 'firsat';
  return 'esnaf';
}

export const SECTOR_LABELS: Record<ExploreCategoryId, string> = {
  esnaf: 'Yerel Esnaf',
  restoran: 'Restoran',
  firsat: 'Hızlı Fırsat',
  guzellik: 'Güzellik',
  spor: 'Spor',
  dekorasyon: 'Dekorasyon',
  eglence: 'Eğlence',
  gelinlik: 'Gelinlik',
  mobilya: 'Mobilya',
};

export function matchesSector(category: string, sector: string) {
  if (sector === 'Tümü') return true;
  const value = category.toLocaleLowerCase('tr');
  const target = sector.toLocaleLowerCase('tr');
  if (target === 'restoran') {
    return value.includes('restoran') || value.includes('yeme') || value.includes('kafe');
  }
  if (target === 'market') {
    return value.includes('market') || value.includes('ticaret');
  }
  if (target === 'gelinlik') {
    return value.includes('gelinlik') || value.includes('düğün') || value.includes('dugun') || value.includes('giyim');
  }
  if (target === 'mobilya') {
    return value.includes('mobilya') || value.includes('dekor');
  }
  if (target === 'dekorasyon') {
    return value.includes('dekor') || value.includes('mobilya') || value.includes('ev');
  }
  if (target === 'eğlence' || target === 'eglence') {
    return value.includes('eğlence') || value.includes('eglence') || value.includes('bar') || value.includes('konser') || value.includes('oyun');
  }
  return value.includes(target);
}
