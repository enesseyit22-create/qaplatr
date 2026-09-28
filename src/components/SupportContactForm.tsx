import { useEffect, useState } from 'react';
import { Loader2, Mail } from 'lucide-react';
import { useAuth } from '@/lib/authContext';
import { fetchMerchantCompany, bindMerchantSession } from '@/lib/actions/merchant';
import { displayNameFrom } from '@/lib/auth';
import { openSupportMail, SUPPORT_EMAIL } from '@/lib/support';
import { tabField, tabPrimary } from '@/components/TabPageShell';

export function SupportContactForm({
  audience = 'user',
}: {
  audience?: 'guest' | 'user' | 'merchant';
}) {
  const { user, profile } = useAuth();
  const [subject, setSubject] = useState('');
  const [company, setCompany] = useState('');
  const [email, setEmail] = useState(profile?.email || user?.email || '');
  const [phone, setPhone] = useState(profile?.phone || user?.phone || '');
  const [message, setMessage] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  useEffect(() => {
    setEmail(profile?.email || user?.email || '');
    setPhone(profile?.phone || user?.phone || '');
  }, [profile?.email, profile?.phone, user?.email, user?.phone]);

  useEffect(() => {
    if (audience !== 'merchant' && profile?.role !== 'merchant') return;
    bindMerchantSession(profile ?? null);
    void fetchMerchantCompany(profile ?? null).then((owned) => {
      if (owned?.name) setCompany(owned.name);
      if (owned?.email) setEmail(owned.email);
      if (owned?.phone) setPhone(owned.phone);
    });
  }, [audience, profile]);

  return (
    <form
      className="space-y-2 rounded-2xl border border-mint-100 bg-white p-3"
      onSubmit={(event) => {
        event.preventDefault();
        if (!subject.trim()) {
          setError('Konu yazın.');
          return;
        }
        if (audience === 'merchant' && !company.trim()) {
          setError('Firma adını yazın.');
          return;
        }
        if (!email.trim() || !email.includes('@')) {
          setError('Geçerli bir e-posta yazın.');
          return;
        }
        if (!phone.trim()) {
          setError('Telefon numaranızı yazın.');
          return;
        }
        if (!message.trim()) {
          setError('Mesajınızı yazın.');
          return;
        }
        setBusy(true);
        setError(null);
        openSupportMail({
          subject: subject.trim(),
          company: company.trim() || (displayNameFrom(profile, email) || 'Misafir'),
          email: email.trim(),
          phone: phone.trim(),
          message: message.trim(),
        });
        setNotice(`Talebiniz ${SUPPORT_EMAIL} adresine iletilmek üzere e-posta uygulamanızda açıldı.`);
        setMessage('');
        setBusy(false);
      }}
    >
      <p className="text-sm font-extrabold text-mint-900">Destek talebi</p>
      <p className="text-[11px] leading-relaxed text-gray-400">
        Konu, firma, e-posta ve telefonunu yaz. Mesaj {SUPPORT_EMAIL} adresine gider.
      </p>
      <a
        href={`mailto:${SUPPORT_EMAIL}`}
        className="inline-flex items-center gap-1.5 text-xs font-extrabold text-mint-700"
      >
        <Mail className="h-3.5 w-3.5" />
        {SUPPORT_EMAIL}
      </a>
      <input className={tabField} placeholder="Konu" value={subject} onChange={(e) => setSubject(e.target.value)} />
      <input
        className={tabField}
        placeholder="Firma adı"
        value={company}
        onChange={(e) => setCompany(e.target.value)}
      />
      <input className={tabField} type="email" placeholder="E-posta adresi" value={email} onChange={(e) => setEmail(e.target.value)} />
      <input className={tabField} type="tel" placeholder="Telefon numarası" value={phone} onChange={(e) => setPhone(e.target.value)} />
      <textarea
        className={`${tabField} min-h-[7rem] resize-none`}
        placeholder="Mesajınız"
        value={message}
        onChange={(e) => setMessage(e.target.value)}
      />
      {error ? <p className="text-xs text-red-500">{error}</p> : null}
      {notice ? <p className="text-xs text-mint-600">{notice}</p> : null}
      <button type="submit" disabled={busy} className={`${tabPrimary} disabled:opacity-50`}>
        {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : 'Destek maili aç'}
      </button>
    </form>
  );
}
