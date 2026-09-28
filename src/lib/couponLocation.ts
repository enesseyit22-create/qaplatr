import { hasValidCoords, isWithinRadius } from '@/lib/geo';
import { couponRadiusM } from '@/lib/reach';
import { requestDeviceLocation } from '@/lib/location';
import type { RedemptionCode } from '@/lib/campaigns';

const GPS_CACHE_MS = 90_000;

let gpsCache: { at: number; latitude: number; longitude: number } | null = null;

export type CouponGpsResult =
  | { ok: true; latitude: number; longitude: number }
  | { ok: false; code: RedemptionCode; message: string };

export async function requireCouponGps(): Promise<CouponGpsResult> {
  if (gpsCache && Date.now() - gpsCache.at < GPS_CACHE_MS) {
    return { ok: true, latitude: gpsCache.latitude, longitude: gpsCache.longitude };
  }

  const gps = await requestDeviceLocation();
  if (!gps.ok) {
    return {
      ok: false,
      code: 'LOCATION_REQUIRED',
      message: 'Kupon almak için cihaz konumuna izin vermeniz gerekir. Profildeki şehir veya elle yazılan adres yeterli değildir.',
    };
  }

  gpsCache = { at: Date.now(), latitude: gps.latitude, longitude: gps.longitude };
  return { ok: true, latitude: gps.latitude, longitude: gps.longitude };
}

export function couponGpsNearMerchant(
  gpsLat: number,
  gpsLng: number,
  merchantLat: number,
  merchantLng: number,
): CouponGpsResult {
  if (!hasValidCoords({ latitude: merchantLat, longitude: merchantLng })) {
    return {
      ok: false,
      code: 'ERROR',
      message: 'İşletme harita konumu henüz tanımlı değil.',
    };
  }
  if (!isWithinRadius(gpsLat, gpsLng, merchantLat, merchantLng, couponRadiusM())) {
    return {
      ok: false,
      code: 'TOO_FAR',
      message: 'Bu kuponu almak için işletmeye 1 km yakın olmalısınız. Farklı şehir yazmak bu kuralı değiştirmez.',
    };
  }
  return { ok: true, latitude: gpsLat, longitude: gpsLng };
}

export async function assertCouponGpsNearMerchant(merchantLat: number, merchantLng: number): Promise<CouponGpsResult> {
  const gps = await requireCouponGps();
  if (!gps.ok) return gps;
  return couponGpsNearMerchant(gps.latitude, gps.longitude, merchantLat, merchantLng);
}
