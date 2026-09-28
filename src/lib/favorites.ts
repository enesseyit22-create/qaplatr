const KEY = 'qapla_favorites';

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

export function listFavoriteIds(userId: string): string[] {
  return readMap()[userId] ?? [];
}

export function isFavorite(userId: string, companyId: string) {
  return listFavoriteIds(userId).includes(companyId);
}

export function countFavoritesForCompany(companyId: string) {
  return Object.values(readMap()).filter((ids) => ids.includes(companyId)).length;
}

export function toggleFavorite(userId: string, companyId: string) {
  const map = readMap();
  const current = new Set(map[userId] ?? []);
  if (current.has(companyId)) current.delete(companyId);
  else current.add(companyId);
  map[userId] = [...current];
  writeMap(map);
  return current.has(companyId);
}
