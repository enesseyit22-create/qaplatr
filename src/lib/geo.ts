export const NEARBY_RADIUS_M = 1000;

export function hasValidCoords(item: { latitude?: number | null; longitude?: number | null }) {
  const lat = Number(item.latitude);
  const lng = Number(item.longitude);
  return Number.isFinite(lat)
    && Number.isFinite(lng)
    && Math.abs(lat) > 0.2
    && Math.abs(lng) > 0.2
    && Math.abs(lat) <= 90
    && Math.abs(lng) <= 180;
}

export function merchantsWithCoords<T extends { latitude: number; longitude: number }>(merchants: T[]) {
  return merchants.filter(hasValidCoords);
}

export function merchantsNearOrigin<T extends { latitude: number; longitude: number }>(
  merchants: T[],
  originLat: number,
  originLng: number,
) {
  return merchants.filter(
    (item) => Number.isFinite(item.latitude)
      && Number.isFinite(item.longitude)
      && isWithinRadius(originLat, originLng, item.latitude, item.longitude, NEARBY_RADIUS_M),
  );
}

export function distanceMeters(
  fromLat: number,
  fromLng: number,
  toLat: number,
  toLng: number,
) {
  const toRad = (value: number) => (value * Math.PI) / 180;
  const dLat = toRad(toLat - fromLat);
  const dLng = toRad(toLng - fromLng);
  const a =
    Math.sin(dLat / 2) ** 2
    + Math.cos(toRad(fromLat)) * Math.cos(toRad(toLat)) * Math.sin(dLng / 2) ** 2;
  return 6371000 * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

export function formatDistance(meters: number) {
  if (!Number.isFinite(meters) || meters < 0) return '';
  if (meters < 950) return `${Math.max(1, Math.round(meters))}m`;
  return `${(meters / 1000).toFixed(meters >= 10000 ? 0 : 1).replace('.', ',')}km`;
}

export function isWithinRadius(
  fromLat: number,
  fromLng: number,
  toLat: number,
  toLng: number,
  radiusM = NEARBY_RADIUS_M,
) {
  return distanceMeters(fromLat, fromLng, toLat, toLng) <= radiusM;
}
