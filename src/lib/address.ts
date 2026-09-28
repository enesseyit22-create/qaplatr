export type SavedAddress = {
  label: string;
  city: string;
  district: string;
  neighborhood: string;
  latitude: number;
  longitude: number;
};

const STORAGE_KEY = 'qapla_manual_address';

export const ADDRESS_PRESETS: SavedAddress[] = [
  { label: 'İstanbul / Kadıköy / Moda', city: 'İstanbul', district: 'Kadıköy', neighborhood: 'Moda', latitude: 40.9873, longitude: 29.0268 },
  { label: 'İstanbul / Kadıköy / Caferağa', city: 'İstanbul', district: 'Kadıköy', neighborhood: 'Caferağa', latitude: 40.9888, longitude: 29.0288 },
  { label: 'İstanbul / Kadıköy / Bahariye', city: 'İstanbul', district: 'Kadıköy', neighborhood: 'Bahariye', latitude: 40.9902, longitude: 29.0306 },
  { label: 'İstanbul / Beşiktaş / Bebek', city: 'İstanbul', district: 'Beşiktaş', neighborhood: 'Bebek', latitude: 41.077, longitude: 29.044 },
  { label: 'İstanbul / Şişli / Nişantaşı', city: 'İstanbul', district: 'Şişli', neighborhood: 'Nişantaşı', latitude: 41.049, longitude: 28.993 },
  { label: 'İstanbul / Beyoğlu / Cihangir', city: 'İstanbul', district: 'Beyoğlu', neighborhood: 'Cihangir', latitude: 41.032, longitude: 28.985 },
  { label: 'İstanbul / Üsküdar / Kuzguncuk', city: 'İstanbul', district: 'Üsküdar', neighborhood: 'Kuzguncuk', latitude: 41.037, longitude: 29.029 },
  { label: 'Ankara / Çankaya / Kızılay', city: 'Ankara', district: 'Çankaya', neighborhood: 'Kızılay', latitude: 39.9208, longitude: 32.8541 },
  { label: 'İzmir / Konak / Alsancak', city: 'İzmir', district: 'Konak', neighborhood: 'Alsancak', latitude: 38.436, longitude: 27.142 },
];

export function readSavedAddress(): SavedAddress | null {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as SavedAddress;
    if (!parsed?.label || !Number.isFinite(parsed.latitude) || !Number.isFinite(parsed.longitude)) return null;
    return parsed;
  } catch {
    return null;
  }
}

export function writeSavedAddress(address: SavedAddress) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(address));
}

export function clearSavedAddress() {
  localStorage.removeItem(STORAGE_KEY);
}

export function formatAddressParts(city: string, district: string, neighborhood: string) {
  return [city, district, neighborhood].map((part) => part.trim()).filter(Boolean).join(' / ');
}

export function foldTr(value: string) {
  return value
    .toLocaleLowerCase('tr')
    .replace(/ı/g, 'i')
    .replace(/ğ/g, 'g')
    .replace(/ü/g, 'u')
    .replace(/ş/g, 's')
    .replace(/ö/g, 'o')
    .replace(/ç/g, 'c');
}

export function filterAddressPresets(query: string) {
  const q = foldTr(query.trim());
  if (!q) return ADDRESS_PRESETS.slice(0, 6);
  return ADDRESS_PRESETS.filter((item) => foldTr(item.label).includes(q)).slice(0, 8);
}

export async function reverseNominatim(latitude: number, longitude: number): Promise<SavedAddress | null> {
  try {
    const url = `https://nominatim.openstreetmap.org/reverse?format=json&lat=${latitude}&lon=${longitude}&zoom=16&addressdetails=1`;
    const res = await fetch(url, { headers: { Accept: 'application/json' } });
    if (!res.ok) return null;
    const data = (await res.json()) as {
      address?: { city?: string; town?: string; province?: string; suburb?: string; neighbourhood?: string; district?: string };
      display_name?: string;
    };
    const city = data.address?.city || data.address?.province || data.address?.town || '';
    const district = data.address?.district || data.address?.town || '';
    const neighborhood = data.address?.neighbourhood || data.address?.suburb || '';
    const label = formatAddressParts(city, district, neighborhood) || data.display_name || `${latitude.toFixed(4)}, ${longitude.toFixed(4)}`;
    return { label, city, district, neighborhood, latitude, longitude };
  } catch {
    return null;
  }
}

export async function searchNominatimMany(query: string, limit = 6): Promise<SavedAddress[]> {
  const trimmed = query.trim();
  if (!trimmed) return [];
  try {
    const url = `https://nominatim.openstreetmap.org/search?format=json&addressdetails=1&limit=${limit}&countrycodes=tr&q=${encodeURIComponent(trimmed)}`;
    const res = await fetch(url, { headers: { Accept: 'application/json' } });
    if (!res.ok) return [];
    const rows = (await res.json()) as Array<{
      lat: string;
      lon: string;
      display_name: string;
      address?: { city?: string; town?: string; province?: string; suburb?: string; neighbourhood?: string; district?: string; village?: string };
    }>;
    return rows.map((hit) => {
      const city = hit.address?.city || hit.address?.province || hit.address?.town || '';
      const district = hit.address?.district || hit.address?.town || hit.address?.village || '';
      const neighborhood = hit.address?.neighbourhood || hit.address?.suburb || '';
      const label = formatAddressParts(city, district, neighborhood) || hit.display_name;
      return {
        label,
        city,
        district,
        neighborhood,
        latitude: Number(hit.lat),
        longitude: Number(hit.lon),
      };
    }).filter((item) => Number.isFinite(item.latitude) && Number.isFinite(item.longitude));
  } catch {
    return [];
  }
}

export function formatDetailedAddress(parts: {
  city: string;
  district: string;
  neighborhood: string;
  street: string;
  door: string;
}) {
  const door = parts.door.trim();
  const street = [parts.street.trim(), door ? `No: ${door}` : ''].filter(Boolean).join(' ');
  return [street, parts.neighborhood, parts.district, parts.city, 'Türkiye']
    .map((part) => part.trim())
    .filter(Boolean)
    .join(', ');
}

export async function geocodeDetailedAddress(parts: {
  city: string;
  district: string;
  neighborhood: string;
  street: string;
  door: string;
}): Promise<{ latitude: number; longitude: number } | null> {
  const query = formatDetailedAddress(parts);
  if (!parts.city.trim() || !parts.district.trim() || !parts.street.trim()) return null;
  const found = await searchNominatim(query);
  if (!found || !Number.isFinite(found.latitude) || !Number.isFinite(found.longitude)) return null;
  return { latitude: found.latitude, longitude: found.longitude };
}

export async function searchNominatim(query: string): Promise<SavedAddress | null> {
  const rows = await searchNominatimMany(query, 1);
  if (!rows[0]) return null;
  return { ...rows[0], label: query };
}
