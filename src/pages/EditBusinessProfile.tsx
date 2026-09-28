import { useEffect, useState } from 'react';
import { Loader2 } from 'lucide-react';
import { COMPANY_CATEGORIES } from '@/lib/sectors';
import type { Company } from '@/lib/campaigns';
import { LocationMapPicker } from '@/components/maps/LocationMapPicker';
import { formatDetailedAddress, geocodeDetailedAddress, reverseNominatim } from '@/lib/address';
import { ISTANBUL_CENTER } from '@/lib/mapTiles';
import { fileToDataUrl } from '@/lib/utils';
import { uploadCompanyImage } from '@/lib/companyImages';

export type BusinessProfileDraft = {
  name?: string;
  category: string;
  address: string;
  phone: string;
  description: string;
  latitude?: number;
  longitude?: number;
  email?: string;
  logo_url?: string | null;
  cover_url?: string | null;
  whatsapp?: string;
};

const fieldClass =
  'w-full rounded-2xl border-2 border-mint-100 bg-white px-4 py-3 text-sm text-mint-800 placeholder:text-gray-300 focus:border-mint-400 focus:outline-none';

export function EditBusinessProfile({
  company,
  busy = false,
  submitLabel = 'Kaydet',
  onSubmit,
}: {
  company: Company;
  busy?: boolean;
  submitLabel?: string;
  onSubmit: (draft: BusinessProfileDraft) => Promise<void>;
}) {
  const [name, setName] = useState(company.name);
  const [category, setCategory] = useState(company.category);
  const [address, setAddress] = useState(company.address);
  const [city, setCity] = useState('');
  const [district, setDistrict] = useState('');
  const [neighborhood, setNeighborhood] = useState('');
  const [street, setStreet] = useState(company.address);
  const [door, setDoor] = useState('');
  const [phone, setPhone] = useState(company.phone ?? '');
  const [whatsapp, setWhatsapp] = useState(company.whatsapp ?? '');
  const [email, setEmail] = useState(company.email ?? company.owner_email ?? '');
  const [description, setDescription] = useState(company.description ?? '');
  const [logo, setLogo] = useState<string | null>(company.logo_url ?? null);
  const [cover, setCover] = useState<string | null>(company.cover_url ?? null);
  const [logoFile, setLogoFile] = useState<File | null>(null);
  const [coverFile, setCoverFile] = useState<File | null>(null);
  const [latitude, setLatitude] = useState(
    Number.isFinite(company.latitude) ? company.latitude : ISTANBUL_CENTER.lat,
  );
  const [longitude, setLongitude] = useState(
    Number.isFinite(company.longitude) ? company.longitude : ISTANBUL_CENTER.lng,
  );

  useEffect(() => {
    setName(company.name);
    setCategory(company.category);
    setAddress(company.address);
    setStreet(company.address);
    setCity('');
    setDistrict('');
    setNeighborhood('');
    setDoor('');
    setPhone(company.phone ?? '');
    setWhatsapp(company.whatsapp ?? '');
    setEmail(company.email ?? company.owner_email ?? '');
    setDescription(company.description ?? '');
    setLogo(company.logo_url ?? null);
    setCover(company.cover_url ?? null);
    setLogoFile(null);
    setCoverFile(null);
    setLatitude(Number.isFinite(company.latitude) ? company.latitude : ISTANBUL_CENTER.lat);
    setLongitude(Number.isFinite(company.longitude) ? company.longitude : ISTANBUL_CENTER.lng);
  }, [
    company.id,
    company.name,
    company.category,
    company.address,
    company.phone,
    company.whatsapp,
    company.email,
    company.owner_email,
    company.description,
    company.logo_url,
    company.cover_url,
    company.latitude,
    company.longitude,
  ]);

  return (
    <form
      className="space-y-3 rounded-3xl border border-mint-100 bg-white p-4"
      onSubmit={async (event) => {
        event.preventDefault();
        const parts = { city, district, neighborhood, street, door };
        const composed = [city, district, neighborhood, street, door].some((part) => part.trim())
          ? formatDetailedAddress(parts)
          : address;
        let nextLat = latitude;
        let nextLng = longitude;
        if (city.trim() && district.trim() && street.trim()) {
          const point = await geocodeDetailedAddress(parts);
          if (point) {
            nextLat = point.latitude;
            nextLng = point.longitude;
          }
        }
        let logoUrl = logo;
        let coverUrl = cover;
        try {
          if (logoFile) logoUrl = await uploadCompanyImage(company.id, logoFile, 'logo');
          if (coverFile) coverUrl = await uploadCompanyImage(company.id, coverFile, 'cover');
        } catch (err) {
          console.warn('Profil görseli kaydedilemedi', err);
          throw err;
        }
        await onSubmit({
          name,
          category,
          address: composed,
          phone,
          whatsapp,
          email,
          description,
          latitude: nextLat,
          longitude: nextLng,
          logo_url: logoUrl,
          cover_url: coverUrl,
        });
        setLogo(logoUrl);
        setCover(coverUrl);
        setLogoFile(null);
        setCoverFile(null);
      }}
    >
      <p className="text-sm font-extrabold text-mint-800">Profili düzenle</p>
      <label className="block overflow-hidden rounded-2xl bg-mint-50">
        {cover ? (
          <img src={cover} alt="" className="h-28 w-full object-cover" />
        ) : (
          <div className="flex h-28 items-center justify-center text-xs font-bold text-mint-600">Kapak görseli ekle</div>
        )}
        <input
          type="file"
          accept="image/*"
          className="hidden"
          onChange={(event) => {
            const file = event.target.files?.[0];
            if (!file) return;
            void fileToDataUrl(file, 1280).then(setCover).catch((err) => console.warn('Kapak önizlemesi okunamadı', err));
            setCoverFile(file);
          }}
        />
      </label>
      <div className="flex items-center gap-3">
        <label className="flex h-16 w-16 shrink-0 overflow-hidden rounded-full bg-mint-100 ring-2 ring-white">
          {logo ? (
            <img src={logo} alt="" className="h-full w-full object-cover" />
          ) : (
            <span className="flex h-full w-full items-center justify-center text-[10px] font-bold text-mint-700">Logo</span>
          )}
          <input
            type="file"
            accept="image/*"
            className="hidden"
            onChange={(event) => {
              const file = event.target.files?.[0];
              if (!file) return;
              void fileToDataUrl(file, 512).then(setLogo).catch((err) => console.warn('Logo önizlemesi okunamadı', err));
              setLogoFile(file);
            }}
          />
        </label>
        <p className="text-[11px] text-gray-400">Kapak ve logoya dokunarak görsel yükle. Keşfet ve firma sayfasında görünür.</p>
      </div>
      <label className="block text-[11px] font-bold text-mint-700">
        Firma adı
        <input className={`${fieldClass} mt-1`} value={name} onChange={(e) => setName(e.target.value)} />
      </label>
      <label className="block text-[11px] font-bold text-mint-700">
        Sektör
        <select className={`${fieldClass} mt-1`} value={category} onChange={(e) => setCategory(e.target.value)}>
          {COMPANY_CATEGORIES.map((item) => (
            <option key={item} value={item}>{item}</option>
          ))}
          {category && !COMPANY_CATEGORIES.includes(category as (typeof COMPANY_CATEGORIES)[number]) ? (
            <option value={category}>{category}</option>
          ) : null}
        </select>
      </label>
      <label className="block text-[11px] font-bold text-mint-700">
        İl
        <input className={`${fieldClass} mt-1`} value={city} onChange={(e) => setCity(e.target.value)} placeholder="Bursa" />
      </label>
      <label className="block text-[11px] font-bold text-mint-700">
        İlçe
        <input className={`${fieldClass} mt-1`} value={district} onChange={(e) => setDistrict(e.target.value)} placeholder="Nilüfer" />
      </label>
      <label className="block text-[11px] font-bold text-mint-700">
        Mahalle
        <input className={`${fieldClass} mt-1`} value={neighborhood} onChange={(e) => setNeighborhood(e.target.value)} />
      </label>
      <label className="block text-[11px] font-bold text-mint-700">
        Cadde / Sokak
        <input className={`${fieldClass} mt-1`} value={street} onChange={(e) => setStreet(e.target.value)} />
      </label>
      <label className="block text-[11px] font-bold text-mint-700">
        Bina / Kapı no
        <input className={`${fieldClass} mt-1`} value={door} onChange={(e) => setDoor(e.target.value)} />
      </label>
      <div>
        <p className="text-[11px] font-bold text-mint-700">Haritadan konum</p>
        <p className="mb-2 text-[10px] text-gray-400">Pin bırak veya konumumu kullan.</p>
        <LocationMapPicker
          latitude={latitude}
          longitude={longitude}
          onPick={(lat, lng) => {
            setLatitude(lat);
            setLongitude(lng);
            void reverseNominatim(lat, lng).then((geo) => {
              if (geo?.label) setAddress(geo.label);
            });
          }}
        />
      </div>
      <label className="block text-[11px] font-bold text-mint-700">
        Telefon (isteğe bağlı)
        <input className={`${fieldClass} mt-1`} value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="Boş bırakırsan profilde görünmez" />
      </label>
      <label className="block text-[11px] font-bold text-mint-700">
        WhatsApp (isteğe bağlı)
        <input className={`${fieldClass} mt-1`} value={whatsapp} onChange={(e) => setWhatsapp(e.target.value)} placeholder="05xx — boşsa WhatsApp butonu çıkmaz" />
      </label>
      <label className="block text-[11px] font-bold text-mint-700">
        E-posta
        <input className={`${fieldClass} mt-1`} value={email} onChange={(e) => setEmail(e.target.value)} />
      </label>
      <label className="block text-[11px] font-bold text-mint-700">
        Açıklama / Hakkında
        <textarea
          className={`${fieldClass} mt-1`}
          rows={4}
          maxLength={600}
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          placeholder="Ziyaretçilerin profilinde göreceği kısa biyografi"
        />
      </label>
      <p className="text-[10px] text-gray-400">{description.length}/600</p>
      <button type="submit" disabled={busy} className="btn-primary w-full py-3 disabled:opacity-50">
        {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : submitLabel}
      </button>
    </form>
  );
}
