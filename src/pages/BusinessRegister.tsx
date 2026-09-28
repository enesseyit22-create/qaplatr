import { useEffect, useState, type FormEvent, type ReactNode } from 'react';
import { ArrowLeft, BadgeCheck, Loader2, MapPin, ShieldCheck, Sparkles } from 'lucide-react';
import { showErrorToast } from '@/components/ErrorToast';
import { BusinessPendingScreen } from '@/components/BusinessPendingScreen';
import { QapLaMark } from '@/components/QapLaMark';
import { useAuth } from '@/lib/authContext';
import {
  BUSINESS_SECTORS,
  submitBusinessRegister,
} from '@/lib/businesses';
import { LocationMapPicker } from '@/components/maps/LocationMapPicker';
import { formatDetailedAddress, geocodeDetailedAddress } from '@/lib/address';
import { hasValidCoords } from '@/lib/geo';
import { checkTaxOrNationalId } from '@/lib/identityNumber';
import { subscriptionPlanText, useSubscriptionSettings } from '@/lib/subscription';

export function BusinessRegisterPage({
  onBack,
  onPending,
  pending = false,
}: {
  onBack: () => void;
  onPending?: () => void;
  pending?: boolean;
}) {
  const { refreshProfile, signOut } = useAuth();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [ownerName, setOwnerName] = useState('');
  const [phone, setPhone] = useState('');
  const [companyName, setCompanyName] = useState('');
  const [sector, setSector] = useState('');
  const [city, setCity] = useState('Bursa');
  const [district, setDistrict] = useState('');
  const [neighborhood, setNeighborhood] = useState('');
  const [street, setStreet] = useState('');
  const [door, setDoor] = useState('');
  const [taxOffice, setTaxOffice] = useState('');
  const [taxNumber, setTaxNumber] = useState('');
  const [latitude, setLatitude] = useState(0);
  const [longitude, setLongitude] = useState(0);
  const [pinPicked, setPinPicked] = useState(false);
  const [geoBusy, setGeoBusy] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);
  const [planNote, setPlanNote] = useState<string | null>(null);
  const subscription = useSubscriptionSettings();

  const addressParts = { city, district, neighborhood, street, door };
  const address = formatDetailedAddress(addressParts);

  useEffect(() => {
    if (pinPicked) return;
    if (!city.trim() || !district.trim() || !neighborhood.trim() || !street.trim() || !door.trim()) return;
    let cancelled = false;
    const timer = window.setTimeout(() => {
      setGeoBusy(true);
      void geocodeDetailedAddress(addressParts).then((point) => {
        if (cancelled) return;
        setGeoBusy(false);
        if (!point) return;
        setLatitude(point.latitude);
        setLongitude(point.longitude);
      });
    }, 500);
    return () => {
      cancelled = true;
      window.clearTimeout(timer);
    };
  }, [city, district, neighborhood, street, door, pinPicked]);

  const onSubmit = async (event: FormEvent) => {
    event.preventDefault();
    setSubmitting(true);
    setError(null);
    try {
      if (!email.trim() || !email.includes('@')) {
        const message = 'Geçerli bir e-posta adresi girin.';
        setError(message);
        showErrorToast(message);
        return;
      }
      if (password.length < 6) {
        const message = 'Şifre çok zayıf. En az 6 karakter girin.';
        setError(message);
        showErrorToast(message);
        return;
      }
      if (taxNumber.trim()) {
        const identity = checkTaxOrNationalId(taxNumber);
        if (!identity.ok) {
          setError(identity.message);
          showErrorToast(identity.message);
          return;
        }
      }
      if (!ownerName.trim() || !phone.trim() || !companyName.trim() || !sector || !city.trim() || !district.trim() || !neighborhood.trim() || !street.trim() || !door.trim()) {
        const message = 'Tüm zorunlu alanları doldurun.';
        setError(message);
        showErrorToast(message);
        return;
      }
      let nextLat = latitude;
      let nextLng = longitude;
      if (!pinPicked) {
        const point = await geocodeDetailedAddress(addressParts);
        if (!point) {
          const message = 'Adres konuma çevrilemedi. İl, ilçe, mahalle ve sokağı kontrol edin.';
          setError(message);
          showErrorToast(message);
          return;
        }
        nextLat = point.latitude;
        nextLng = point.longitude;
        setLatitude(nextLat);
        setLongitude(nextLng);
      }
      if (!hasValidCoords({ latitude: nextLat, longitude: nextLng })) {
        const message = 'Adres için geçerli bir konum bulunamadı.';
        setError(message);
        showErrorToast(message);
        return;
      }
      const result = await submitBusinessRegister({
        email,
        password,
        ownerName,
        phone,
        companyName,
        sector,
        district,
        address,
        taxOffice,
        taxNumber,
        latitude: nextLat,
        longitude: nextLng,
      });
      if (!result.ok) {
        const message = result.message ?? 'Başvuru gönderilemedi.';
        setError(message);
        showErrorToast(message);
        return;
      }
      onPending?.();
      if (subscription.is_subscription_active) setPlanNote(subscriptionPlanText(subscription));
      setDone(true);
      void refreshProfile();
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Başvuru gönderilemedi.';
      setError(message);
      showErrorToast(message);
    } finally {
      setSubmitting(false);
    }
  };

  if (done || pending) {
    return <BusinessPendingScreen onBack={onBack} onSignOut={() => { void signOut(); onBack(); }} companyName={companyName} planNote={planNote} />;
  }

  return (
    <form onSubmit={onSubmit} className="flex h-full min-h-0 flex-col bg-[#f4f7f6]">
      <RegisterHero onBack={onBack} />
      <div className="min-h-0 flex-1 space-y-4 overflow-y-auto px-4 py-4 pb-4">
        <Section title="Hesap">
          <Field label="E-posta">
            <input type="email" required autoComplete="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="isletme@qapla.com" className={inputClass} />
          </Field>
          <Field label="Şifre">
            <input type="password" required minLength={6} autoComplete="new-password" value={password} onChange={(e) => setPassword(e.target.value)} placeholder="En az 6 karakter" className={inputClass} />
          </Field>
        </Section>
        <Section title="Yetkili">
          <Field label="Ad soyad">
            <input type="text" required autoComplete="name" value={ownerName} onChange={(e) => setOwnerName(e.target.value)} placeholder="Ad Soyad" className={inputClass} />
          </Field>
          <Field label="Telefon">
            <input type="tel" required inputMode="tel" autoComplete="tel" value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="05xx xxx xx xx" className={inputClass} />
          </Field>
        </Section>
        <Section title="İşletme">
          <Field label="Firma / işletme adı">
            <input type="text" required value={companyName} onChange={(e) => setCompanyName(e.target.value)} placeholder="İşletme unvanı" className={inputClass} />
          </Field>
          <Field label="Sektör">
            <select required value={sector} onChange={(e) => setSector(e.target.value)} className={inputClass}>
              <option value="">Seçin</option>
              {BUSINESS_SECTORS.map((item) => <option key={item} value={item}>{item}</option>)}
            </select>
          </Field>
          <div className="grid grid-cols-2 gap-2">
            <Field label="İl">
              <input required value={city} onChange={(e) => { setPinPicked(false); setCity(e.target.value); }} placeholder="Bursa" className={inputClass} />
            </Field>
            <Field label="İlçe">
              <input required value={district} onChange={(e) => { setPinPicked(false); setDistrict(e.target.value); }} placeholder="Nilüfer" className={inputClass} />
            </Field>
          </div>
          <Field label="Mahalle">
            <input required value={neighborhood} onChange={(e) => { setPinPicked(false); setNeighborhood(e.target.value); }} placeholder="Mahalle" className={inputClass} />
          </Field>
          <div className="grid grid-cols-2 gap-2">
            <Field label="Cadde / Sokak">
              <input required value={street} onChange={(e) => { setPinPicked(false); setStreet(e.target.value); }} placeholder="Cadde veya sokak" className={inputClass} />
            </Field>
            <Field label="Bina / Kapı no">
              <input required value={door} onChange={(e) => { setPinPicked(false); setDoor(e.target.value); }} placeholder="12" className={inputClass} />
            </Field>
          </div>
          <div>
            <p className="mb-1.5 text-sm font-semibold text-mint-800">Konum</p>
            <p className="mb-2 text-[11px] font-normal text-gray-400">
              {geoBusy ? 'Adres konuma çevriliyor…' : 'Adres yazılınca enlem ve boylam hesaplanır. Pin ile düzeltebilirsin.'}
            </p>
            <LocationMapPicker
              latitude={latitude}
              longitude={longitude}
              onPick={(lat, lng) => {
                setLatitude(lat);
                setLongitude(lng);
                setPinPicked(true);
              }}
            />
            {hasValidCoords({ latitude, longitude }) ? (
              <p className="mt-1 text-[10px] text-mint-600">{latitude.toFixed(6)}, {longitude.toFixed(6)}</p>
            ) : (
              <p className="mt-1 text-[10px] text-gray-400">Adres tamamlanınca konum burada görünür.</p>
            )}
          </div>
        </Section>
        <Section title="Vergi">
          <Field label="Vergi dairesi (isteğe bağlı)">
            <input type="text" value={taxOffice} onChange={(e) => setTaxOffice(e.target.value)} placeholder="Nilüfer" className={inputClass} />
          </Field>
          <Field label="Vergi numarası veya T.C. kimlik numarası (isteğe bağlı)">
            <input
              type="text"
              inputMode="numeric"
              autoComplete="off"
              maxLength={11}
              value={taxNumber}
              onChange={(e) => setTaxNumber(e.target.value.replace(/\D/g, '').slice(0, 11))}
              placeholder="10 veya 11 hane"
              className={inputClass}
            />
            <span className="mt-1 block text-[11px] font-normal text-gray-400">Boş bırakılırsa Standart Firma olarak kalır. Girilirse hane ve kontrol basamağı doğrulanır; yönetim onayından sonra yeşil tik açılır.</span>
          </Field>
        </Section>
        {subscription.is_subscription_active ? (
          <p className="rounded-2xl border border-mint-100 bg-mint-50 px-3 py-2 text-xs font-semibold text-mint-800">
            Abonelik: {subscriptionPlanText(subscription)}
          </p>
        ) : null}
        {error ? (
          <p className="rounded-2xl border border-red-100 bg-red-50 px-3 py-2 text-sm text-red-600">{error}</p>
        ) : null}
        <div className="h-2" />
      </div>
      <div className="shrink-0 border-t border-mint-100 bg-white px-4 pb-[max(1rem,env(safe-area-inset-bottom))] pt-3">
        <button type="submit" disabled={submitting} className="btn-primary w-full py-4 disabled:opacity-50">
          {submitting ? <Loader2 className="h-5 w-5 animate-spin" /> : 'Başvuruyu gönder'}
        </button>
        <p className="mt-2 text-center text-[11px] text-gray-400">Onay sonrası kampanya ve kupon paneli açılır.</p>
      </div>
    </form>
  );
}

function RegisterHero({ onBack, compact = false }: { onBack: () => void; compact?: boolean }) {
  return (
    <div className="relative shrink-0 overflow-hidden bg-[#16352f] px-5 pb-5 pt-[max(2.6rem,calc(env(safe-area-inset-top)+0.7rem))] text-white">
      <div className="pointer-events-none absolute -right-8 -top-10 h-36 w-36 rounded-full bg-mint-400/20 blur-2xl" />
      <div className="pointer-events-none absolute bottom-0 left-1/3 h-24 w-24 rounded-full bg-white/10 blur-xl" />
      <button
        type="button"
        onClick={onBack}
        className="relative flex h-10 w-10 items-center justify-center rounded-2xl bg-white/15 transition active:scale-90"
      >
        <ArrowLeft className="h-5 w-5" />
      </button>
      <div className="relative mt-4 flex items-start gap-3">
        <div className="flex h-14 w-14 items-center justify-center rounded-3xl bg-white shadow-md">
          <QapLaMark className="h-9 w-9" />
        </div>
        <div className="min-w-0">
          <p className="text-[10px] font-extrabold uppercase tracking-[0.2em] text-mint-200">Qapla İşletme</p>
          <h1 className="mt-0.5 text-[1.45rem] font-extrabold leading-tight tracking-tight">İşletmeniz var mı?</h1>
          <p className="mt-1 text-sm leading-snug text-white/75">Bursa vitrininde seçili esnafla aynı kalitede görünün.</p>
        </div>
      </div>
      {compact ? null : (
        <div className="relative mt-4 grid grid-cols-3 gap-1.5">
          <HeroChip icon={ShieldCheck} label="Onaylı kayıt" />
          <HeroChip icon={MapPin} label="Harita vitrini" />
          <HeroChip icon={BadgeCheck} label="Kupon & kampanya" />
        </div>
      )}
    </div>
  );
}

function HeroChip({ icon: Icon, label }: { icon: typeof Sparkles; label: string }) {
  return (
    <div className="flex flex-col items-center gap-1 rounded-2xl bg-white/10 px-1.5 py-2 text-center backdrop-blur-sm">
      <Icon className="h-3.5 w-3.5 text-mint-200" />
      <span className="text-[9px] font-bold leading-tight text-white/90">{label}</span>
    </div>
  );
}

function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="space-y-3 rounded-3xl border border-mint-100 bg-white p-4 shadow-sm">
      <p className="text-[10px] font-extrabold uppercase tracking-[0.16em] text-mint-600">{title}</p>
      {children}
    </section>
  );
}

function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <label className="block">
      <span className="mb-1.5 block text-sm font-semibold text-mint-800">{label}</span>
      {children}
    </label>
  );
}

const inputClass =
  'w-full rounded-2xl border border-mint-100 bg-[#f7faf9] px-4 py-3 text-mint-800 placeholder:text-gray-300 focus:border-mint-400 focus:bg-white focus:outline-none';
