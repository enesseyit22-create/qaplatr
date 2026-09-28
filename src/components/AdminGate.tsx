import { useState } from 'react';
import { ArrowLeft, Loader2, Shield, Sparkles } from 'lucide-react';
import { useAuth } from '@/lib/authContext';
import type { AppDestination } from '@/lib/auth';

export function AdminLoginScreen({
  onBack,
  onSuccess,
}: {
  onBack: () => void;
  onSuccess: (destination: AppDestination) => void;
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
      const result = await signIn(email, password, 'admin');
      if (!result.ok) {
        setError(result.message ?? 'Giriş bilgileri doğrulanamadı.');
        return;
      }
      onSuccess(result.destination ?? 'home');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Giriş sırasında bir hata oluştu.');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="flex flex-1 flex-col bg-[#eef3f1] pb-8 text-mint-900">
      <div className="bg-gradient-to-b from-mint-500 to-mint-600 px-5 pb-4 pt-12 text-white">
        <button
          onClick={onBack}
          className="flex h-10 w-10 items-center justify-center rounded-2xl bg-white/20 transition active:scale-90"
        >
          <ArrowLeft className="h-5 w-5" />
        </button>
        <div className="mt-4 flex items-center gap-3">
          <div className="flex h-14 w-14 items-center justify-center rounded-5xl bg-white/20">
            <Shield className="h-7 w-7" />
          </div>
          <div>
            <h1 className="text-xl font-extrabold">Yönetim</h1>
            <p className="text-sm text-white/80">Tam yetkili panel</p>
          </div>
        </div>
      </div>

      <form onSubmit={handleSubmit} className="flex-1 space-y-4 px-5 pt-6">
        <div>
          <label className="mb-1.5 block text-sm font-semibold text-mint-800">E-posta</label>
          <input
            type="email"
            autoComplete="username"
            required
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="Yönetici e-postası"
            className="w-full rounded-2xl border-2 border-mint-100 bg-white px-4 py-3.5 text-mint-800 placeholder:text-gray-300 focus:border-mint-400 focus:outline-none"
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
            className="w-full rounded-2xl border-2 border-mint-100 bg-white px-4 py-3.5 text-mint-800 focus:border-mint-400 focus:outline-none"
          />
        </div>
        {error && (
          <p className="rounded-2xl border border-red-100 bg-red-50 px-3 py-2 text-sm text-red-600">{error}</p>
        )}
        <button type="submit" disabled={submitting} className="inline-flex w-full items-center justify-center gap-2 rounded-2xl bg-mint-500 py-4 font-semibold text-white disabled:opacity-50">
          {submitting ? <Loader2 className="h-5 w-5 animate-spin" /> : 'Yönetici girişi'}
        </button>
        <p className="flex items-center justify-center gap-1 text-center text-xs text-gray-400">
          <Sparkles className="h-3 w-3" /> Bu ekran yalnızca gizli tetikleyiciyle açılır
        </p>
      </form>
    </div>
  );
}
