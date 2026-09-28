import { hasValidCoords, isWithinRadius } from '@/lib/geo';
import type { AppUserRole } from '@/lib/campaigns';

export const VIEW_RADIUS_M = 2000;

export function canSeeEntireMap(role?: AppUserRole | string | null) {
  return role === 'admin';
}

export function isVisibleOnMap<T extends { id: string; latitude: number; longitude: number }>(
  item: T,
  origin: { latitude: number; longitude: number } | null,
  role?: AppUserRole | string | null,
  ownCompanyId?: string | null,
) {
  if (!hasValidCoords(item)) return false;
  if (ownCompanyId && item.id === ownCompanyId) return true;
  if (canSeeEntireMap(role)) return true;
  if (!origin || !hasValidCoords(origin)) return false;
  return isWithinRadius(origin.latitude, origin.longitude, item.latitude, item.longitude, VIEW_RADIUS_M);
}

export function visibleMapItems<T extends { id: string; latitude: number; longitude: number }>(
  items: T[],
  origin: { latitude: number; longitude: number } | null,
  role?: AppUserRole | string | null,
  ownCompanyId?: string | null,
) {
  return items.filter((item) => isVisibleOnMap(item, origin, role, ownCompanyId));
}
