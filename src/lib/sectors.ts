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
  'Kafe',
  'Restoran',
  'Yeme & İçme',
  'Güzellik',
  'Spor',
  'Dekorasyon',
  'Eğlence',
  'Market',
  'Giyim',
  'E-Ticaret',
  'Kargo',
  'Lojistik',
  'Kurumsal',
] as const;

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
