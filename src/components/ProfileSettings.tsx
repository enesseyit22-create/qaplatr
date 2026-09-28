import { useState } from 'react';
import { Loader2, X } from 'lucide-react';
import { useAuth } from '@/lib/authContext';
import { isValidPhone } from '@/lib/auth';
import { SafeCenterModal } from '@/components/SafeCenterModal';

export function ProfileSettings({ onClose }: { onClose: () => void }) {
  const { user, profile, updateAccount } = useAuth();
  const [first, setFirst] = useState(profile?.first_name ?? '');
  const [last, setLast] = useState(profile?.last_name ?? '');
  const [phone, setPhone] = useState(profile?.phone || user?.phone || '');
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  return (
    <SafeCenterModal onClose={onClose} zIndex={2200}>
      <form
        className="relative w-full space-y-3 rounded-4xl bg-white p-5 shadow-mint-lg"
        onSubmit={async (event) => {
          event.preventDefault();
          if (!first.trim() || !last.trim()) {
            setError('İsim ve soyisim girin.');
            return;
          }
          if (phone && !isValidPhone(phone, false)) {
            setError('Telefon geçersiz.');
            return;
          }
          setBusy(true);
          setError(null);
          const result = await updateAccount({ firstName: first, lastName: last, phone, password: password || undefined });
          setBusy(false);
          if (!result.ok) {
            setError(result.message ?? 'Güncellenemedi');
            return;
          }
          setNotice('Kaydedildi.');
          setPassword('');
        }}
      >
        <div className="flex items-center justify-between">
          <h3 className="text-lg font-extrabold text-mint-800">Profil</h3>
          <button type="button" onClick={onClose} className="flex h-8 w-8 items-center justify-center rounded-full bg-mint-50 text-mint-700">
            <X className="h-4 w-4" />
          </button>
        </div>
        <input className={field} required placeholder="İsim" value={first} onChange={(e) => setFirst(e.target.value)} />
        <input className={field} required placeholder="Soyisim" value={last} onChange={(e) => setLast(e.target.value)} />
        <input className={field} type="tel" placeholder="Telefon" value={phone} onChange={(e) => setPhone(e.target.value)} />
        <input className={field} type="password" placeholder="Yeni şifre (boş = değişmez)" value={password} onChange={(e) => setPassword(e.target.value)} />
        {error ? <p className="text-xs text-red-500">{error}</p> : null}
        {notice ? <p className="text-xs text-mint-600">{notice}</p> : null}
        <button type="submit" disabled={busy} className="btn-primary w-full py-3 disabled:opacity-50">
          {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : 'Kaydet'}
        </button>
      </form>
    </SafeCenterModal>
  );
}

const field = 'w-full rounded-2xl border-2 border-mint-100 px-3 py-2.5 text-sm text-mint-800 placeholder:text-gray-300 focus:border-mint-400 focus:outline-none';
