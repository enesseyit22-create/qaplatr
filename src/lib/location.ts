import { Capacitor } from '@capacitor/core';
import { distanceMeters } from '@/lib/geo';

/** Harita ve adres sorgusu ancak bu kadar yer değişince yenilenir. */
export const LOCATION_MOVE_METERS = 15;

export type LocationFailure = 'denied' | 'unavailable' | 'timeout' | 'unsupported';

export type DeviceLocation =
  | { ok: true; latitude: number; longitude: number }
  | { ok: false; reason: LocationFailure };

function asFailure(error: unknown): LocationFailure {
  const message = error instanceof Error ? error.message : String(error ?? '');
  if (/denied|permission|kCLAuthorization|user denied/i.test(message)) return 'denied';
  if (/timeout/i.test(message)) return 'timeout';
  return 'unavailable';
}

async function nativeLocation(): Promise<DeviceLocation> {
  try {
    const { Geolocation } = await import('@capacitor/geolocation');
    const status = await Geolocation.requestPermissions();
    const granted = status.location === 'granted' || status.coarseLocation === 'granted';
    if (!granted) return { ok: false, reason: 'denied' };

    const position = await Geolocation.getCurrentPosition({
      enableHighAccuracy: true,
      timeout: 10000,
      maximumAge: 30000,
    });
    const latitude = position.coords.latitude;
    const longitude = position.coords.longitude;
    if (!Number.isFinite(latitude) || !Number.isFinite(longitude)) {
      return { ok: false, reason: 'unavailable' };
    }
    return { ok: true, latitude, longitude };
  } catch (error) {
    return { ok: false, reason: asFailure(error) };
  }
}

function webLocation(): Promise<DeviceLocation> {
  if (typeof navigator === 'undefined' || !navigator.geolocation) {
    return Promise.resolve({ ok: false, reason: 'unsupported' });
  }

  return new Promise((resolve) => {
    let settled = false;
    const finish = (result: DeviceLocation) => {
      if (settled) return;
      settled = true;
      resolve(result);
    };

    const watchdog = window.setTimeout(() => finish({ ok: false, reason: 'timeout' }), 12000);

    try {
      navigator.geolocation.getCurrentPosition(
        (position) => {
          window.clearTimeout(watchdog);
          const latitude = position.coords.latitude;
          const longitude = position.coords.longitude;
          if (!Number.isFinite(latitude) || !Number.isFinite(longitude)) {
            finish({ ok: false, reason: 'unavailable' });
            return;
          }
          finish({ ok: true, latitude, longitude });
        },
        (error) => {
          window.clearTimeout(watchdog);
          if (error.code === error.PERMISSION_DENIED) finish({ ok: false, reason: 'denied' });
          else if (error.code === error.TIMEOUT) finish({ ok: false, reason: 'timeout' });
          else finish({ ok: false, reason: 'unavailable' });
        },
        { enableHighAccuracy: false, timeout: 10000, maximumAge: 60000 },
      );
    } catch {
      window.clearTimeout(watchdog);
      finish({ ok: false, reason: 'unavailable' });
    }
  });
}

/** Never throws. Permission deny / GPS fail returns a safe fallback result. */
export async function requestDeviceLocation(): Promise<DeviceLocation> {
  try {
    if (Capacitor.isNativePlatform()) return await nativeLocation();
    return await webLocation();
  } catch {
    return { ok: false, reason: 'unavailable' };
  }
}

type Coords = { latitude: number; longitude: number };

let moveAnchor: Coords | null = null;

export function movedEnough(next: Coords, minimumMeters = LOCATION_MOVE_METERS) {
  if (!moveAnchor) return true;
  return distanceMeters(moveAnchor.latitude, moveAnchor.longitude, next.latitude, next.longitude) >= minimumMeters;
}

export function noteLocationAnchor(next: Coords) {
  moveAnchor = { latitude: next.latitude, longitude: next.longitude };
}

function publishMove(
  next: Coords,
  onMove: (coords: Coords) => void,
  force = false,
) {
  if (!force && !movedEnough(next)) return;
  noteLocationAnchor(next);
  onMove(next);
}

export function watchSignificantMoves(
  onMove: (coords: Coords) => void,
  onError?: (reason: LocationFailure) => void,
): () => void {
  let stopped = false;
  let reported = false;
  let webWatch = 0;
  let nativeWatch: string | null = null;
  const fail = (reason: LocationFailure) => {
    if (stopped || reported || moveAnchor) return;
    reported = true;
    onError?.(reason);
  };

  const take = (latitude: number, longitude: number) => {
    if (stopped || !Number.isFinite(latitude) || !Number.isFinite(longitude)) return;
    publishMove({ latitude, longitude }, onMove);
  };

  if (Capacitor.isNativePlatform()) {
    void import('@capacitor/geolocation').then(async ({ Geolocation }) => {
      if (stopped) return;
      try {
        const status = await Geolocation.requestPermissions();
        const granted = status.location === 'granted' || status.coarseLocation === 'granted';
        if (!granted) {
          fail('denied');
          return;
        }
        nativeWatch = await Geolocation.watchPosition(
          { enableHighAccuracy: true, timeout: 15000, maximumAge: 10000 },
          (position, error) => {
            if (stopped) return;
            if (error || !position) {
              fail(asFailure(error));
              return;
            }
            take(position.coords.latitude, position.coords.longitude);
          },
        );
      } catch (error) {
        fail(asFailure(error));
      }
    }).catch(() => fail('unavailable'));

    return () => {
      stopped = true;
      if (!nativeWatch) return;
      const id = nativeWatch;
      nativeWatch = null;
      void import('@capacitor/geolocation').then(({ Geolocation }) => {
        void Geolocation.clearWatch({ id });
      }).catch(() => undefined);
    };
  }

  if (typeof navigator === 'undefined' || !navigator.geolocation) {
    fail('unsupported');
    return () => { stopped = true; };
  }

  webWatch = navigator.geolocation.watchPosition(
    (position) => take(position.coords.latitude, position.coords.longitude),
    (error) => {
      if (error.code === error.PERMISSION_DENIED) fail('denied');
      else if (error.code === error.TIMEOUT) fail('timeout');
      else fail('unavailable');
    },
    { enableHighAccuracy: false, timeout: 15000, maximumAge: 20000 },
  );

  return () => {
    stopped = true;
    if (webWatch) navigator.geolocation.clearWatch(webWatch);
  };
}

export function locationHint(reason: LocationFailure | null) {
  if (reason === 'denied') return 'Konum izni kapalı. İlçe veya mahalle arayarak devam et.';
  if (reason === 'timeout' || reason === 'unavailable') return 'Konum alınamadı. İlçe veya mahalle seçebilirsin.';
  if (reason === 'unsupported') return 'Bu cihazda konum yok. İlçe veya mahalle seç.';
  return null;
}
