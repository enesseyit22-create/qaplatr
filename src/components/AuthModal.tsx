import { useState } from 'react';
import { Loader2, X } from 'lucide-react';
import { showErrorToast } from '@/components/ErrorToast';
import type { AppDestination } from '@/lib/auth';
import { TURKEY_CITIES } from '@/lib/cities';
import { useAuth } from '@/lib/authContext';

export function AuthModal({
  open,
  onClose,
  onSuccess,
  defaultMode = 'signin',
}: {
  open: boolean;
  onClose: () => void;
  onSuccess: (destination?: AppDestination) => void;
  defaultMode?: 'signin' | 'signup';
}) {
  const { signIn, signUp } = useAuth();
  const [mode, setMode] = useState<'signin' | 'signup'>(defaultMode);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [phone, setPhone] = useState('');
  const [firstName, setFirstName] = useState('');
  const [lastName, setLastName] = useState('');
  const [city, setCity] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (!open) return null;

  const submit = async (event: React.FormEvent) => {
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
      if (mode === 'signup' && (!firstName.trim() || !lastName.trim() || phone.trim().length < 10 || !city.trim())) {
        const message = !firstName.trim() || !lastName.trim()
          ? 'İsim ve soyisim girin.'
          : !city.trim()
            ? 'Şehir seçin.'
            : 'Geçerli bir telefon numarası girin.';
        setError(message);
        showErrorToast(message);
        return;
      }
      const result = mode === 'signin'
        ? await signIn(email, password, 'user')
        : await signUp(email, password, phone, firstName, lastName, city);
      if (!result.ok) {
        const message = result.message ?? 'İşlem tamamlanamadı.';
        setError(message);
        showErrorToast(message);
        return;
      }
      onSuccess(result.destination ?? 'home');
    } catch (err) {
      const message = err instanceof Error ? err.message : 'İşlem tamamlanamadı.';
      setError(message);
      showErrorToast(message);
    } finally {
      setSubmitting(false);
    }
  };

  const card = (
    <div className="relative w-full max-w-[400px] rounded-4xl bg-white p-5 shadow-mint-lg">
      <button
        type="button"
        onClick={onClose}
        className="absolute right-4 top-4 flex h-9 w-9 items-center justify-center rounded-2xl bg-mint-50 text-mint-700"
      >
        <X className="h-4 w-4" />
      </button>

      <p className="text-xs font-semibold uppercase tracking-[0.2em] text-mint-500">Hızlı üyelik</p>
      <h2 className="mt-1 text-xl font-extrabold text-mint-800">Fırsatı kullanmak için giriş yap</h2>
      <p className="mt-1 text-sm text-gray-500">Harita ve kampanyalar misafire açık. Profil, kupon işlemi veya işletme paneli için hesap gerekir.</p>

      <div className="mt-4 grid grid-cols-2 gap-2 rounded-2xl bg-mint-50 p-1">
        <button
          type="button"
          onClick={() => setMode('signin')}
          className={`rounded-xl py-2 text-sm font-bold ${mode === 'signin' ? 'bg-white text-mint-700 shadow-soft' : 'text-mint-600'}`}
        >
          Giriş Yap
        </button>
        <button
          type="button"
          onClick={() => setMode('signup')}
          className={`rounded-xl py-2 text-sm font-bold ${mode === 'signup' ? 'bg-white text-mint-700 shadow-soft' : 'text-mint-600'}`}
        >
          Üye Ol
        </button>
      </div>

      <form onSubmit={submit} className="mt-4 space-y-3">
        <input
          type="email"
          required
          value={email}
          onChange={(event) => setEmail(event.target.value)}
          placeholder="E-posta"
          className="w-full rounded-2xl border-2 border-mint-100 bg-cream-50 px-4 py-3 text-mint-800 placeholder:text-gray-300 focus:border-mint-400 focus:outline-none"
        />
        {mode === 'signup' && (
          <>
            <div className="grid grid-cols-2 gap-2">
              <input
                type="text"
                required
                autoComplete="given-name"
                value={firstName}
                onChange={(event) => setFirstName(event.target.value)}
                placeholder="İsim"
                className="w-full rounded-2xl border-2 border-mint-100 bg-cream-50 px-4 py-3 text-mint-800 placeholder:text-gray-300 focus:border-mint-400 focus:outline-none"
              />
              <input
                type="text"
                required
                autoComplete="family-name"
                value={lastName}
                onChange={(event) => setLastName(event.target.value)}
                placeholder="Soyisim"
                className="w-full rounded-2xl border-2 border-mint-100 bg-cream-50 px-4 py-3 text-mint-800 placeholder:text-gray-300 focus:border-mint-400 focus:outline-none"
              />
            </div>
            <input
              type="tel"
              required
              inputMode="tel"
              autoComplete="tel"
              minLength={10}
              value={phone}
              onChange={(event) => setPhone(event.target.value)}
              placeholder="Telefon numarası"
              className="w-full rounded-2xl border-2 border-mint-100 bg-cream-50 px-4 py-3 text-mint-800 placeholder:text-gray-300 focus:border-mint-400 focus:outline-none"
            />
            <select
              required
              value={city}
              onChange={(event) => setCity(event.target.value)}
              className="w-full rounded-2xl border-2 border-mint-100 bg-cream-50 px-4 py-3 text-mint-800 focus:border-mint-400 focus:outline-none"
            >
              <option value="">Şehir seçin</option>
              {TURKEY_CITIES.map((item) => (
                <option key={item} value={item}>{item}</option>
              ))}
            </select>
            <p className="text-[11px] text-gray-400">Kupon almak için ayrıca cihaz konumu gerekir. Yazılan şehir mesafe kuralını değiştirmez.</p>
          </>
        )}
        <input
          type="password"
          required
          minLength={6}
          value={password}
          onChange={(event) => setPassword(event.target.value)}
          placeholder="Şifre (en az 6 karakter)"
          className="w-full rounded-2xl border-2 border-mint-100 bg-cream-50 px-4 py-3 text-mint-800 placeholder:text-gray-300 focus:border-mint-400 focus:outline-none"
        />
        {error && <p className="text-sm text-red-500">{error}</p>}
        <button type="submit" disabled={submitting} className="btn-primary w-full py-3.5 disabled:opacity-50">
          {submitting ? <Loader2 className="h-5 w-5 animate-spin" /> : mode === 'signin' ? 'Giriş Yap' : 'Üye Ol'}
        </button>
      </form>
    </div>
  );

  return (
    <div className="fixed inset-0 z-[2100] flex items-center justify-center bg-black/40 px-4 py-[max(1.25rem,env(safe-area-inset-bottom))]">
      <button type="button" className="absolute inset-0" aria-label="Kapat" onClick={onClose} />
      <div className="relative w-full max-w-[400px]">{card}</div>
    </div>
  );
}
