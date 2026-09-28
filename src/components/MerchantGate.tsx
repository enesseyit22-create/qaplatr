import { useState } from 'react';
import { ArrowLeft, Loader2 } from 'lucide-react';
import { showErrorToast } from '@/components/ErrorToast';
import { QapLaMark } from '@/components/QapLaMark';
import { useAuth } from '@/lib/authContext';
import type { AppDestination } from '@/lib/auth';

export function MerchantLoginScreen({
  onBack,
  onSuccess,
  onRegister,
}: {
  onBack: () => void;
  onSuccess: (destination: AppDestination) => void;
  onRegister?: () => void;
}) {
  const { signIn } = useAuth();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    setSubmitting(true);
    setError(null);
    try {
      const result = await signIn(email, password, 'merchant');
      if (!result.ok) {
        const message = result.message ?? 'Giriş bilgileri doğrulanamadı.';
        setError(message);
        showErrorToast(message);
        return;
      }
      onSuccess(result.destination ?? 'home');
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Giriş sırasında bir hata oluştu.';
      setError(message);
      showErrorToast(message);
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="flex h-full min-h-0 flex-col bg-[#f4f7f6]">
      <div className="relative shrink-0 overflow-hidden bg-[#16352f] px-5 pb-6 pt-[max(2.6rem,calc(env(safe-area-inset-top)+0.7rem))] text-white">
        <div className="pointer-events-none absolute -right-10 -top-8 h-40 w-40 rounded-full bg-mint-400/20 blur-2xl" />
        <button
          type="button"
          onClick={onBack}
          className="relative flex h-10 w-10 items-center justify-center rounded-2xl bg-white/15 transition active:scale-90"
        >
          <ArrowLeft className="h-5 w-5" />
        </button>
        <div className="relative mt-5 flex items-center gap-3">
          <div className="flex h-14 w-14 items-center justify-center rounded-3xl bg-white shadow-md">
            <QapLaMark className="h-9 w-9" />
          </div>
          <div>
            <p className="text-[10px] font-extrabold uppercase tracking-[0.2em] text-mint-200">Qapla İşletme</p>
            <h1 className="text-xl font-extrabold leading-tight">Firma paneli</h1>
            <p className="text-sm text-white/70">Onaylı işletmeler için giriş</p>
          </div>
        </div>
      </div>

      <form onSubmit={handleSubmit} className="min-h-0 flex-1 space-y-4 overflow-y-auto px-5 py-5 pb-[max(1.5rem,env(safe-area-inset-bottom))]">
        <div>
          <label className="mb-1.5 block text-sm font-semibold text-mint-800">E-posta</label>
          <input
            type="email"
            autoComplete="username"
            required
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="isletme@qapla.com"
            className="w-full rounded-2xl border border-mint-100 bg-white px-4 py-3.5 text-mint-800 placeholder:text-gray-300 focus:border-mint-400 focus:outline-none"
          />
        </div>
        <div>
          <label className="mb-1.5 block text-sm font-semibold text-mint-800">Şifre</label>
          <input
            type="password"
            autoComplete="current-password"
            required
            minLength={6}
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            className="w-full rounded-2xl border border-mint-100 bg-white px-4 py-3.5 text-mint-800 focus:border-mint-400 focus:outline-none"
          />
        </div>
        {error && (
          <p className="rounded-2xl border border-red-100 bg-red-50 px-3 py-2 text-sm text-red-600">{error}</p>
        )}
        <button type="submit" disabled={submitting} className="btn-primary w-full py-4 disabled:opacity-50">
          {submitting ? <Loader2 className="h-5 w-5 animate-spin" /> : 'Giriş yap'}
        </button>
        {onRegister ? (
          <button
            type="button"
            onClick={onRegister}
            className="w-full rounded-3xl border border-mint-100 bg-white px-4 py-4 text-left shadow-sm"
          >
            <p className="text-[10px] font-extrabold uppercase tracking-[0.16em] text-mint-500">İşletme ortağı</p>
            <p className="mt-1 text-sm font-extrabold text-mint-900">İşletmeniz var mı?</p>
            <p className="mt-0.5 text-xs text-gray-500">Hesabınız yoksa firma kaydı oluşturun. Yönetim onayından sonra panel açılır.</p>
            <span className="mt-2 inline-block text-xs font-extrabold text-mint-600">Firma kaydı →</span>
          </button>
        ) : null}
      </form>
    </div>
  );
}
