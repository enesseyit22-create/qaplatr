import { useMemo, useState } from 'react';
import { ChevronLeft, Loader2, Plus, Search, Users } from 'lucide-react';
import type { AppUser, AppUserRole, Campaign, Company, UserRedemption } from '@/lib/campaigns';
import type { BusinessApplication } from '@/lib/businesses';
import { isValidPhone, splitFullName } from '@/lib/auth';

const fieldClass = 'w-full rounded-2xl border-2 border-mint-100 bg-white px-4 py-3 text-sm text-mint-800 placeholder:text-gray-300 focus:border-mint-400 focus:outline-none';

export function AdminUsersPanel({
  users,
  companies,
  campaigns = [],
  redemptions = [],
  applications = [],
  busy,
  onSave,
  onDelete,
}: {
  users: AppUser[];
  companies: Company[];
  campaigns?: Campaign[];
  redemptions?: UserRedemption[];
  applications?: BusinessApplication[];
  busy: boolean;
  onSave: (input: {
    id?: string;
    email: string;
    phone: string;
    role: AppUserRole;
    company_id: string | null;
    password?: string;
    first_name?: string;
    last_name?: string;
  }) => Promise<void>;
  onDelete: (user: AppUser) => void;
}) {
  const [query, setQuery] = useState('');
  const [selected, setSelected] = useState<AppUser | null>(null);
  const [editing, setEditing] = useState<AppUser | null>(null);
  const [creating, setCreating] = useState(false);
  const [email, setEmail] = useState('');
  const [phone, setPhone] = useState('');
  const [password, setPassword] = useState('');
  const [firstName, setFirstName] = useState('');
  const [lastName, setLastName] = useState('');
  const [formError, setFormError] = useState<string | null>(null);

  const members = useMemo(() => {
    const businessIds = new Set(applications.map((item) => item.user_id).filter(Boolean));
    const businessEmails = new Set(applications.map((item) => item.email.trim().toLowerCase()).filter(Boolean));
    const firmEmails = new Set(
      companies.flatMap((item) => [item.email, item.owner_email].map((value) => String(value ?? '').trim().toLowerCase()).filter(Boolean)),
    );
    return users.filter((user) => {
      if (user.role !== 'user') return false;
      if (user.company_id) return false;
      const email = user.email.trim().toLowerCase();
      if (businessIds.has(user.id) || businessEmails.has(email) || firmEmails.has(email)) return false;
      return true;
    });
  }, [users, applications, companies]);
  const filtered = useMemo(() => {
    const q = query.trim().toLocaleLowerCase('tr');
    const rows = members.filter((user) => {
      if (!q) return true;
      const hay = `${user.full_name ?? ''} ${user.first_name ?? ''} ${user.last_name ?? ''} ${user.email} ${user.phone}`.toLocaleLowerCase('tr');
      return hay.includes(q);
    });
    return rows.sort((a, b) => (a.full_name || a.email).localeCompare(b.full_name || b.email, 'tr'));
  }, [members, query]);

  const openCreate = () => {
    setSelected(null);
    setEditing(null);
    setCreating(true);
    setEmail('');
    setPhone('');
    setPassword('');
    setFirstName('');
    setLastName('');
    setFormError(null);
  };

  const openEdit = (user: AppUser) => {
    setCreating(false);
    setEditing(user);
    setEmail(user.email);
    setPhone(user.phone);
    setPassword(user.login_password ?? '');
    const split = splitFullName(user.full_name);
    setFirstName(user.first_name ?? split.first_name);
    setLastName(user.last_name ?? split.last_name);
    setFormError(null);
  };

  const closeForm = () => {
    setCreating(false);
    setEditing(null);
    setFormError(null);
  };

  const submit = async () => {
    if (!firstName.trim() || !lastName.trim()) {
      setFormError('İsim ve soyisim girin.');
      return;
    }
    if (!email.trim()) {
      setFormError('E-posta gerekli.');
      return;
    }
    if (phone.trim() && !isValidPhone(phone, false)) {
      setFormError('Telefon numarası geçersiz.');
      return;
    }
    if (!editing && password.length < 6) {
      setFormError('Şifre en az 6 karakter olmalı.');
      return;
    }
    if (editing && password && password.length < 6) {
      setFormError('Şifre en az 6 karakter olmalı.');
      return;
    }
    await onSave({
      id: editing?.id,
      email,
      phone,
      role: 'user',
      company_id: null,
      password: password || undefined,
      first_name: firstName.trim(),
      last_name: lastName.trim(),
    });
    closeForm();
  };

  if (creating || editing) {
    return (
      <form
        className="space-y-3"
        onSubmit={(event) => {
          event.preventDefault();
          void submit();
        }}
      >
        <button type="button" onClick={closeForm} className="inline-flex items-center gap-1 text-xs font-bold text-mint-600">
          <ChevronLeft className="h-4 w-4" /> Listeye dön
        </button>
        <p className="text-sm font-extrabold text-mint-900">{editing ? 'Kullanıcıyı düzenle' : 'Yeni kullanıcı'}</p>
        <div className="grid grid-cols-2 gap-2">
          <input className={fieldClass} required placeholder="İsim" value={firstName} onChange={(e) => setFirstName(e.target.value)} />
          <input className={fieldClass} required placeholder="Soyisim" value={lastName} onChange={(e) => setLastName(e.target.value)} />
        </div>
        <input className={fieldClass} required type="email" placeholder="E-posta" value={email} onChange={(e) => setEmail(e.target.value)} />
        <input
          className={fieldClass}
          required={!editing}
          type="text"
          autoComplete="new-password"
          placeholder={editing ? 'Şifre (boş bırakırsan değişmez)' : 'Şifre'}
          value={password}
          onChange={(e) => setPassword(e.target.value)}
        />
        <input className={fieldClass} type="tel" placeholder="Telefon (isteğe bağlı)" value={phone} onChange={(e) => setPhone(e.target.value)} />
        {formError && <p className="text-sm text-red-500">{formError}</p>}
        <div className="grid grid-cols-2 gap-2">
          <button type="button" className="rounded-2xl bg-mint-50 px-4 py-2.5 font-semibold text-mint-800" onClick={closeForm}>Vazgeç</button>
          <button type="submit" disabled={busy} className="inline-flex items-center justify-center gap-2 rounded-2xl bg-mint-500 py-3 font-semibold text-white disabled:opacity-50">
            {busy ? <Loader2 className="w-4 h-4 animate-spin" /> : 'Kaydet'}
          </button>
        </div>
      </form>
    );
  }

  if (selected) {
    const uses = redemptions.filter((row) => row.user_id === selected.id);
    const live = users.find((item) => item.id === selected.id) ?? selected;
    return (
      <div className="space-y-3">
        <button type="button" onClick={() => setSelected(null)} className="inline-flex items-center gap-1 text-xs font-bold text-mint-600">
          <ChevronLeft className="h-4 w-4" /> Üye listesi
        </button>
        <article className="rounded-2xl border border-mint-100 bg-white px-3 py-3">
          <p className="text-sm font-extrabold text-mint-900">{live.full_name || live.email}</p>
          <p className="mt-1 text-[11px] text-gray-400">Kullanıcı</p>
          <dl className="mt-3 space-y-1.5 text-[12px]">
            <Info label="E-posta" value={live.email} />
            <Info label="Telefon" value={live.phone || '—'} />
            <Info label="Kayıt" value={new Date(live.created_at).toLocaleString('tr-TR')} />
            <Info label="Kullanım" value={`${uses.length} kupon`} />
          </dl>
          <div className="mt-3 flex gap-1">
            <button type="button" onClick={() => openEdit(live)} className="rounded-lg bg-mint-50 px-2 py-1 text-[10px] font-bold text-mint-700">Düzelt</button>
            <button type="button" onClick={() => onDelete(live)} className="rounded-lg bg-red-50 px-2 py-1 text-[10px] font-bold text-red-500">Sil</button>
          </div>
        </article>
        <section className="rounded-2xl border border-mint-100 bg-white px-3 py-3">
          <p className="text-[11px] font-extrabold uppercase tracking-wide text-mint-600">Kupon raporu</p>
          {uses.length === 0 ? (
            <p className="mt-2 text-xs text-gray-400">Henüz kullanım yok.</p>
          ) : (
            <ul className="mt-2 max-h-64 space-y-1 overflow-y-auto">
              {uses.map((row) => {
                const campaign = campaigns.find((item) => item.id === row.campaign_id);
                const company = companies.find((item) => item.id === campaign?.company_id);
                return (
                  <li key={row.id} className="flex items-center justify-between gap-2 border-t border-mint-50 py-1.5 text-[11px] first:border-t-0">
                    <span className="min-w-0 truncate text-mint-800">{company?.name ?? 'Firma'} · {campaign?.title ?? 'Kampanya'}</span>
                    <span className="shrink-0 text-gray-400">{new Date(row.redeemed_at).toLocaleDateString('tr-TR')}</span>
                  </li>
                );
              })}
            </ul>
          )}
        </section>
      </div>
    );
  }

  return (
    <div className="space-y-2">
      <div className="flex gap-2">
        <label className="relative min-w-0 flex-1">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-gray-300" />
          <input
            className={`${fieldClass} !py-2 pl-9`}
            placeholder="İsim, e-posta ara"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
          />
        </label>
        <button type="button" onClick={openCreate} className="inline-flex shrink-0 items-center gap-1 rounded-2xl bg-mint-500 px-3 text-xs font-extrabold text-white">
          <Plus className="h-3.5 w-3.5" /> Kullanıcı
        </button>
      </div>
      <p className="px-1 text-[10px] font-bold uppercase tracking-wide text-mint-600">{filtered.length} kullanıcı</p>
      {filtered.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-mint-100 px-3 py-8 text-center">
          <Users className="mx-auto h-6 w-6 text-mint-300" />
          <p className="mt-2 text-xs font-bold text-mint-800">Kullanıcı bulunamadı</p>
        </div>
      ) : (
        <div className="overflow-hidden rounded-2xl border border-mint-100 bg-white">
          {filtered.map((user) => (
            <button
              key={user.id}
              type="button"
              onClick={() => setSelected(user)}
              className="flex w-full items-center justify-between gap-2 border-t border-mint-50 px-3 py-1.5 text-left first:border-t-0"
            >
              <span className="min-w-0">
                <span className="block truncate text-[12px] font-bold text-mint-900">{user.full_name || user.email}</span>
                <span className="block truncate text-[10px] text-gray-400">{user.email}</span>
              </span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

function Info({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex justify-between gap-2">
      <dt className="text-gray-400">{label}</dt>
      <dd className="truncate font-semibold text-mint-800">{value}</dd>
    </div>
  );
}
