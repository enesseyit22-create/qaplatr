import { useEffect, useMemo, useState, type ReactNode } from 'react';
import {
  Bell,
  ChevronLeft,
  ChevronRight,
  Crown,
  FileText,
  Heart,
  HelpCircle,
  KeyRound,
  Loader2,
  LogOut,
  Mail,
  Map as MapIcon,
  MessageSquare,
  Phone,
  Send,
  Settings,
  Star,
  Ticket,
  User,
  Volume2,
} from 'lucide-react';
import type { Merchant } from '@/lib/supabase';
import { useAuth } from '@/lib/authContext';
import { displayNameFrom, isValidPhone } from '@/lib/auth';
import { listFavoriteIds } from '@/lib/favorites';
import { reviewsForUser } from '@/lib/reviews';
import { ROLE_LABELS } from '@/lib/roleMatrix';
import { TabPageShell, tabCard, tabField, tabIconWrap, tabPrimary } from '@/components/TabPageShell';
import { campaignAlertsAllowed, useAppFeatures } from '@/lib/appFeatures';
import { useLegalDocs } from '@/lib/legalDocs';
import { SupportContactForm } from '@/components/SupportContactForm';
import { SUPPORT_EMAIL } from '@/lib/support';
import { loadBusinessForUser, type BusinessApplication } from '@/lib/businesses';

const APP_VERSION = 'QapLA v1.0.4';
const NOTIFY_KEY = 'qapla_notify_prefs';

type MenuView =
  | 'menu'
  | 'details'
  | 'security'
  | 'favorites'
  | 'notify'
  | 'settings'
  | 'reviews'
  | 'help'
  | 'legal'
  | 'contact';

type NotifyPrefs = {
  push: boolean;
  campaigns: boolean;
  sounds: boolean;
};

const DEFAULT_NOTIFY: NotifyPrefs = { push: true, campaigns: false, sounds: true };

export function ProfileTabScreen({
  onRequireAuth,
  merchants = [],
  onExplore,
  onVisits,
  onSaved,
  onVip,
  onOpenCompany,
  mode = 'page',
}: {
  onRequireAuth: () => void;
  merchants?: Merchant[];
  onExplore?: () => void;
  onVisits?: () => void;
  onSaved?: () => void;
  onVip?: () => void;
  onOpenCompany?: (merchant: Merchant) => void;
  mode?: 'page' | 'drawer' | 'embed';
}) {
  const { user, profile, updateAccount, signOut } = useAuth();
  const features = useAppFeatures();
  const legal = useLegalDocs();
  const [view, setView] = useState<MenuView>('menu');
  const [first, setFirst] = useState(profile?.first_name ?? '');
  const [last, setLast] = useState(profile?.last_name ?? '');
  const [phone, setPhone] = useState(profile?.phone || user?.phone || '');
  const [password, setPassword] = useState('');
  const [password2, setPassword2] = useState('');
  const [emailDraft, setEmailDraft] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [notify, setNotify] = useState<NotifyPrefs>(() => readNotifyPrefs());
  const [membership, setMembership] = useState<BusinessApplication | null>(null);

  useEffect(() => {
    setFirst(profile?.first_name ?? '');
    setLast(profile?.last_name ?? '');
    setPhone(profile?.phone || user?.phone || '');
    setEmailDraft(profile?.email || user?.email || '');
  }, [profile, user?.phone, user?.email]);

  useEffect(() => {
    if (!user || profile?.role !== 'merchant' || !profile.id) {
      setMembership(null);
      return;
    }
    void loadBusinessForUser(profile.id, profile.email).then(setMembership);
  }, [user, profile?.id, profile?.role, profile?.email]);

  const favoriteIds = user ? listFavoriteIds(user.id) : [];
  const favoriteMerchants = merchants.filter((item) => favoriteIds.includes(item.id));
  const myReviews = useMemo(() => (user ? reviewsForUser(user.id) : []), [user]);
  const merchantById = useMemo(() => new Map(merchants.map((item) => [item.id, item])), [merchants]);

  if (!user) {
    return <GuestSupportScreen mode={mode} onRequireAuth={onRequireAuth} />;
  }

  const email = profile?.email || user.email;
  const phoneDisplay = profile?.phone || user.phone || '—';
  const name = displayNameFrom(profile, email) || email.split('@')[0];
  const role = profile?.role ?? 'user';
  const flags = role === 'merchant' ? features.merchant : features.user;
  const roleBadgeClass =
    role === 'admin'
      ? 'bg-emerald-100 text-emerald-800'
      : role === 'merchant'
        ? 'bg-teal-100 text-teal-800'
        : 'bg-slate-100 text-slate-600';

  const titles: Record<MenuView, { title: string; subtitle?: string }> = {
    menu: { title: role === 'merchant' ? 'Ayarlar' : role === 'admin' ? 'Yönetici' : 'Hesap', subtitle: role === 'merchant' ? 'Üyelik, vergi ve hesap bilgileri.' : role === 'admin' ? 'Hesap ve bildirim.' : 'Profil, yetkiler ve destek.' },
    details: { title: role === 'merchant' ? 'Yetkili bilgileri' : 'Bilgilerim', subtitle: role === 'merchant' ? 'Yetkili kişi özeti.' : 'Kişisel hesap özeti.' },
    security: { title: role === 'merchant' ? 'E-posta ve şifre' : 'Şifre ve e-posta', subtitle: 'Giriş bilgilerini güncelle.' },
    favorites: { title: 'Kaydedilen fırsatlar', subtitle: 'Favori işletmelerin.' },
    notify: { title: 'Bildirimler', subtitle: 'Anlık uyarılar ve sesler.' },
    settings: { title: 'Genel ayarlar', subtitle: 'Tercihler ve bildirimler.' },
    reviews: { title: 'Yorumlarım', subtitle: 'Değerlendirmelerin.' },
    help: { title: 'Yardım ve destek', subtitle: 'Sık sorulanlar.' },
    legal: { title: 'Sözleşmeler', subtitle: 'Gizlilik ve kullanım.' },
    contact: { title: 'Destek', subtitle: `${SUPPORT_EMAIL} üzerinden yazın.` },
  };

  const resetAlerts = () => {
    setError(null);
    setNotice(null);
  };

  const saveProfile = async () => {
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
    const result = await updateAccount({ firstName: first, lastName: last, phone });
    setBusy(false);
    if (!result.ok) {
      setError(result.message ?? 'Güncellenemedi');
      return;
    }
    setNotice('Bilgilerin kaydedildi.');
  };

  const savePassword = async () => {
    if (password.length < 6) {
      setError('Şifre en az 6 karakter olmalı.');
      return;
    }
    if (password !== password2) {
      setError('Şifreler eşleşmiyor.');
      return;
    }
    setBusy(true);
    setError(null);
    const result = await updateAccount({
      firstName: profile?.first_name || first,
      lastName: profile?.last_name || last,
      phone: profile?.phone || phone,
      password,
    });
    setBusy(false);
    if (!result.ok) {
      setError(result.message ?? 'Şifre güncellenemedi');
      return;
    }
    setPassword('');
    setPassword2('');
    setNotice('Şifren güncellendi.');
  };

  const saveEmail = async () => {
    const next = emailDraft.trim().toLowerCase();
    if (!next || !next.includes('@')) {
      setError('Geçerli bir e-posta girin.');
      return;
    }
    setBusy(true);
    setError(null);
    const result = await updateAccount({
      firstName: profile?.first_name || first,
      lastName: profile?.last_name || last,
      phone: profile?.phone || phone,
      email: next,
    });
    setBusy(false);
    if (!result.ok) {
      setError(result.message ?? 'E-posta güncellenemedi');
      return;
    }
    setNotice('E-posta güncellendi.');
  };

  const patchNotify = (patch: Partial<NotifyPrefs>) => {
    const next = { ...notify, ...patch };
    setNotify(next);
    localStorage.setItem(NOTIFY_KEY, JSON.stringify(next));
  };

  const inner = (
    <>
      {view === 'menu' && (
        <div className="space-y-5">
          {role === 'merchant' && mode === 'embed' ? null : (
          <section className="overflow-hidden rounded-3xl border border-mint-100 bg-white p-4 shadow-sm">
            <div className="flex items-start gap-3">
              <span className="flex h-14 w-14 shrink-0 items-center justify-center rounded-2xl bg-gradient-to-br from-mint-100 to-emerald-50 text-mint-700">
                <User className="h-7 w-7" />
              </span>
              <div className="min-w-0 flex-1">
                <div className="flex flex-col items-start gap-1">
                  <h2 className="truncate text-lg font-extrabold text-mint-900">{name}</h2>
                  <span className={`rounded-full px-2 py-0.5 text-[10px] font-extrabold uppercase tracking-wide ${roleBadgeClass}`}>
                    {ROLE_LABELS[role]}
                  </span>
                </div>
                <p className="mt-1 flex items-center gap-1.5 truncate text-sm text-gray-500">
                  <Mail className="h-3.5 w-3.5 shrink-0" />
                  {email}
                </p>
                <p className="mt-0.5 flex items-center gap-1.5 truncate text-sm text-gray-500">
                  <Phone className="h-3.5 w-3.5 shrink-0" />
                  {phoneDisplay}
                </p>
              </div>
            </div>
          </section>
          )}

          {role === 'merchant' ? (
            <>
              <MembershipInfo
                application={membership}
                email={email}
                phone={phoneDisplay}
                ownerName={name}
              />
              <MenuGroup title="Bildirimler">
                {flags.notify ? <MenuRow icon={<Bell className="h-5 w-5" />} label="Bildirim tercihleri ve sesleri" onClick={() => { resetAlerts(); setView('notify'); }} /> : null}
              </MenuGroup>
              <MenuGroup title="Hesap ayarları">
                {onVip && mode !== 'drawer' ? <MenuRow icon={<Crown className="h-5 w-5" />} label="QAP VIP" onClick={() => onVip()} /> : null}
                {flags.explore ? <MenuRow icon={<MapIcon className="h-5 w-5" />} label="Harita ve Keşfet" onClick={() => onExplore?.()} /> : null}
                {flags.help ? <MenuRow icon={<HelpCircle className="h-5 w-5" />} label="Yardım ve destek" onClick={() => setView('help')} /> : null}
                {flags.legal ? <MenuRow icon={<FileText className="h-5 w-5" />} label="Sözleşmeler" onClick={() => setView('legal')} /> : null}
                {flags.contact ? <MenuRow icon={<Send className="h-5 w-5" />} label="Destek" onClick={() => { resetAlerts(); setView('contact'); }} /> : null}
              </MenuGroup>
              <MenuGroup title="Giriş bilgileri">
                {flags.details ? <MenuRow icon={<User className="h-5 w-5" />} label="Yetkili bilgileri" onClick={() => { resetAlerts(); setView('details'); }} /> : null}
                {flags.security ? (
                  <MenuRow
                    icon={<KeyRound className="h-5 w-5" />}
                    label="E-posta ve şifre"
                    onClick={() => { resetAlerts(); setView('security'); }}
                  />
                ) : null}
              </MenuGroup>
            </>
          ) : role === 'admin' ? (
              <MenuGroup title="Yönetim">
                {onVip && mode !== 'drawer' ? <MenuRow icon={<Crown className="h-5 w-5" />} label="QAP VIP" onClick={() => onVip()} /> : null}
                {flags.notify ? <MenuRow icon={<Bell className="h-5 w-5" />} label="Bildirim tercihleri" onClick={() => setView('notify')} /> : null}
              </MenuGroup>
          ) : (
            <>
          <MenuGroup title="Hesap">
            {flags.details ? <MenuRow icon={<User className="h-5 w-5" />} label="Bilgilerim" onClick={() => { resetAlerts(); setView('details'); }} /> : null}
            {flags.security ? (
              <MenuRow
                icon={<KeyRound className="h-5 w-5" />}
                label="Şifre ve e-posta"
                onClick={() => { resetAlerts(); setView('security'); }}
              />
            ) : null}
            {flags.settings ? <MenuRow icon={<Settings className="h-5 w-5" />} label="Ayarlar" onClick={() => { resetAlerts(); setView('settings'); }} /> : null}
          </MenuGroup>
          <MenuGroup title="Yetkiler">
            {onVip && mode !== 'drawer' ? <MenuRow icon={<Crown className="h-5 w-5" />} label="QAP VIP" onClick={() => onVip()} /> : null}
            {flags.explore ? <MenuRow icon={<MapIcon className="h-5 w-5" />} label="Harita ve Keşfet" onClick={() => onExplore?.()} /> : null}
            {features.user.coupons ? <MenuRow icon={<Ticket className="h-5 w-5" />} label="Kuponlarım ve geçmişim" onClick={() => onVisits?.()} /> : null}
            {features.user.saved ? (
              <MenuRow
                icon={<Heart className="h-5 w-5" />}
                label="Kaydedilen fırsatlar"
                badge={favoriteIds.length}
                onClick={() => setView('favorites')}
              />
            ) : null}
            {flags.notify ? <MenuRow icon={<Bell className="h-5 w-5" />} label="Bildirim tercihleri ve sesleri" onClick={() => setView('notify')} /> : null}
            {features.user.reviews ? (
              <MenuRow icon={<MessageSquare className="h-5 w-5" />} label="Yorumlarım" onClick={() => setView('reviews')} />
            ) : null}
          </MenuGroup>
          <MenuGroup title="Destek">
            {flags.help ? <MenuRow icon={<HelpCircle className="h-5 w-5" />} label="Yardım ve destek" onClick={() => setView('help')} /> : null}
            {flags.legal ? <MenuRow icon={<FileText className="h-5 w-5" />} label="Sözleşmeler" onClick={() => setView('legal')} /> : null}
            {flags.contact ? <MenuRow icon={<Send className="h-5 w-5" />} label="Destek" onClick={() => { resetAlerts(); setView('contact'); }} /> : null}
          </MenuGroup>
            </>
          )}

          <button
            type="button"
            onClick={() => { void signOut(); }}
            className={`${tabCard} text-rose-600`}
          >
            <span className={`${tabIconWrap} bg-rose-50 text-rose-500`}>
              <LogOut className="h-5 w-5" />
            </span>
            <span className="flex-1 font-bold">Çıkış yap</span>
          </button>

          <p className="pb-2 text-center text-[11px] font-medium tracking-wide text-gray-400">{APP_VERSION}</p>
        </div>
      )}

      {view === 'details' && (
        <div className="space-y-3">
          <InfoRow label="Ad" value={profile?.first_name || '—'} />
          <InfoRow label="Soyad" value={profile?.last_name || '—'} />
          <InfoRow label="E-posta" value={email} />
          <InfoRow label="Telefon" value={phoneDisplay} />
          <InfoRow label="Kullanıcı adı" value={name} />
          <InfoRow label="Rol" value={ROLE_LABELS[role]} />
          <InfoRow label="Kayıt tarihi" value={formatDate(profile?.created_at)} />
          <div className="rounded-2xl border border-mint-100 bg-white p-3">
            <p className="mb-2 text-xs font-bold uppercase tracking-wide text-mint-600">Düzenle</p>
            <div className="space-y-2">
              <input className={tabField} placeholder="Ad" value={first} onChange={(event) => setFirst(event.target.value)} />
              <input className={tabField} placeholder="Soyad" value={last} onChange={(event) => setLast(event.target.value)} />
              <input className={tabField} type="tel" placeholder="Telefon" value={phone} onChange={(event) => setPhone(event.target.value)} />
              {error ? <p className="text-xs text-red-500">{error}</p> : null}
              {notice ? <p className="text-xs text-mint-600">{notice}</p> : null}
              <button type="button" disabled={busy} onClick={() => { void saveProfile(); }} className={tabPrimary}>
                {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : 'Kaydet'}
              </button>
            </div>
          </div>
        </div>
      )}

      {view === 'security' && (
        <div className="space-y-4">
          <section className="space-y-2 rounded-2xl border border-mint-100 bg-white p-3">
            <p className="text-sm font-extrabold text-mint-900">E-posta değiştir</p>
            <input className={tabField} type="email" placeholder="Yeni e-posta" value={emailDraft} onChange={(event) => setEmailDraft(event.target.value)} />
            {error ? <p className="text-xs text-red-500">{error}</p> : null}
            {notice ? <p className="text-xs text-mint-600">{notice}</p> : null}
            <button type="button" disabled={busy} onClick={() => { void saveEmail(); }} className={tabPrimary}>
              {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : 'E-postayı güncelle'}
            </button>
          </section>
          <section className="space-y-2 rounded-2xl border border-mint-100 bg-white p-3">
            <p className="text-sm font-extrabold text-mint-900">Şifre değiştir</p>
            <input className={tabField} type="password" placeholder="Yeni şifre" value={password} onChange={(event) => setPassword(event.target.value)} />
            <input className={tabField} type="password" placeholder="Yeni şifre (tekrar)" value={password2} onChange={(event) => setPassword2(event.target.value)} />
            {error ? <p className="text-xs text-red-500">{error}</p> : null}
            {notice ? <p className="text-xs text-mint-600">{notice}</p> : null}
            <button type="button" disabled={busy} onClick={() => { void savePassword(); }} className={tabPrimary}>
              {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : 'Şifreyi güncelle'}
            </button>
          </section>
        </div>
      )}

      {view === 'favorites' && (
        <div className="space-y-2">
          {favoriteMerchants.length === 0 ? (
            <p className="rounded-2xl border border-mint-100 bg-white px-4 py-10 text-center text-sm text-gray-400">Henüz favori yok.</p>
          ) : (
            favoriteMerchants.map((item) => (
              <button
                key={item.id}
                type="button"
                onClick={() => onOpenCompany?.(item)}
                className={tabCard}
              >
                <span className={tabIconWrap}>
                  <Heart className="h-5 w-5 fill-mint-500 text-mint-500" />
                </span>
                <span className="min-w-0 flex-1 text-left">
                  <span className="block truncate font-extrabold text-mint-800">{item.name}</span>
                  <span className="block truncate text-xs text-gray-400">{item.category}</span>
                </span>
                <ChevronRight className="h-4 w-4 text-gray-300" />
              </button>
            ))
          )}
          {onSaved ? (
            <button type="button" onClick={onSaved} className={`${tabPrimary} mt-2`}>
              Kaydedilenler sekmesine git
            </button>
          ) : null}
        </div>
      )}

      {view === 'notify' && (
        <SettingsToggles notify={notify} onPatch={patchNotify} />
      )}

      {view === 'settings' && (
        <div className="space-y-3">
          <SettingsToggles notify={notify} onPatch={patchNotify} />
          <p className="px-1 text-xs leading-relaxed text-gray-400">
            Harita üstündeki arama çubuğundan adres yazarak konumu değiştirebilirsin. Bildirim tercihleri bu cihazda saklanır.
          </p>
        </div>
      )}

      {view === 'reviews' && (
        <div className="space-y-2">
          {myReviews.length === 0 ? (
            <p className="rounded-2xl border border-mint-100 bg-white px-4 py-10 text-center text-sm text-gray-400">Henüz yorumun yok.</p>
          ) : (
            myReviews.map((item) => {
              const company = merchantById.get(item.company_id);
              return (
                <article key={item.id} className="rounded-2xl border border-mint-100 bg-white p-3 shadow-sm">
                  <div className="flex items-center justify-between gap-2">
                    <p className="truncate text-sm font-extrabold text-mint-800">{company?.name ?? 'İşletme'}</p>
                    <span className="inline-flex items-center gap-0.5 text-xs font-bold text-amber-500">
                      <Star className="h-3.5 w-3.5 fill-amber-400" />
                      {item.rating}
                    </span>
                  </div>
                  <p className="mt-1 text-sm text-gray-600">{item.text || '—'}</p>
                  <p className="mt-1 text-[11px] text-gray-400">{formatDate(item.created_at)}</p>
                </article>
              );
            })
          )}
        </div>
      )}

      {view === 'help' && (
        <article className="rounded-2xl border border-mint-100 bg-white p-4">
          <h3 className="font-extrabold text-mint-900">Yardım ve destek</h3>
          <p className="mt-2 whitespace-pre-wrap text-sm leading-relaxed text-gray-600">{legal.help}</p>
          <a href={`mailto:${SUPPORT_EMAIL}`} className="mt-3 inline-flex items-center gap-1.5 text-sm font-extrabold text-mint-700">
            <Mail className="h-4 w-4" /> {SUPPORT_EMAIL}
          </a>
        </article>
      )}

      {view === 'legal' && (
        <div className="space-y-3">
          <article className="rounded-2xl border border-mint-100 bg-white p-4">
            <h3 className="font-extrabold text-mint-900">Gizlilik politikası</h3>
            <p className="mt-2 whitespace-pre-wrap text-sm leading-relaxed text-gray-600">{legal.privacy}</p>
          </article>
          <article className="rounded-2xl border border-mint-100 bg-white p-4">
            <h3 className="font-extrabold text-mint-900">Kullanım koşulları</h3>
            <p className="mt-2 whitespace-pre-wrap text-sm leading-relaxed text-gray-600">{legal.terms}</p>
          </article>
        </div>
      )}

      {view === 'contact' && (
        <SupportContactForm audience={role === 'merchant' ? 'merchant' : 'user'} />
      )}
    </>
  );

  if (mode === 'drawer' || mode === 'embed') {
    return (
      <div className="mt-3">
        {view !== 'menu' ? (
          <button
            type="button"
            onClick={() => { resetAlerts(); setView('menu'); }}
            className="mb-3 flex items-center gap-1 text-sm font-extrabold text-mint-800"
          >
            <ChevronLeft className="h-4 w-4" />
            {titles[view].title}
          </button>
        ) : null}
        {inner}
      </div>
    );
  }

  return (
    <TabPageShell
      title={titles[view].title}
      subtitle={titles[view].subtitle}
      onBack={view === 'menu' ? undefined : () => { resetAlerts(); setView('menu'); }}
    >
      {inner}
    </TabPageShell>
  );
}

export function SettingsTabScreen() {
  const [notify, setNotify] = useState<NotifyPrefs>(() => readNotifyPrefs());
  const patchNotify = (patch: Partial<NotifyPrefs>) => {
    const next = { ...notify, ...patch };
    setNotify(next);
    localStorage.setItem(NOTIFY_KEY, JSON.stringify(next));
  };
  return (
    <TabPageShell title="Ayarlar" subtitle="Bildirimler ve tercihler.">
      <SettingsToggles notify={notify} onPatch={patchNotify} />
      <p className="mt-4 px-1 text-xs leading-relaxed text-gray-400">
        Harita üstünden adres arayarak konumu değiştirebilirsin. Bu tercihler yalnızca bu cihazda saklanır.
      </p>
      <p className="mt-6 text-center text-[11px] font-medium tracking-wide text-gray-400">{APP_VERSION}</p>
    </TabPageShell>
  );
}

function SettingsToggles({
  notify,
  onPatch,
}: {
  notify: NotifyPrefs;
  onPatch: (patch: Partial<NotifyPrefs>) => void;
}) {
  const { profile } = useAuth();
  const campaignOk = campaignAlertsAllowed(profile);
  return (
    <div className="space-y-2 rounded-2xl border border-mint-100 bg-white p-2">
      <ToggleRow
        icon={<Bell className="h-5 w-5" />}
        label="Anlık bildirimler"
        hint="Sistem ve kupon uyarıları"
        on={notify.push}
        onToggle={() => onPatch({ push: !notify.push })}
      />
      <ToggleRow
        icon={<Ticket className="h-5 w-5" />}
        label="Kampanya bildirimleri"
        hint={campaignOk ? 'Yeni fırsat duyuruları (VIP)' : 'Yalnızca QAP VIP ve yönetim açarsa'}
        on={campaignOk && notify.campaigns}
        locked={!campaignOk}
        onToggle={() => {
          if (!campaignOk) return;
          onPatch({ campaigns: !notify.campaigns });
        }}
      />
      <ToggleRow
        icon={<Volume2 className="h-5 w-5" />}
        label="Bildirim sesleri"
        hint="Uyarı sesini aç / kapa"
        on={notify.sounds}
        onToggle={() => onPatch({ sounds: !notify.sounds })}
      />
    </div>
  );
}

function GuestSupportScreen({
  mode,
  onRequireAuth,
}: {
  mode: 'page' | 'drawer' | 'embed' | 'tab';
  onRequireAuth: () => void;
}) {
  const inner = (
    <div className="space-y-4">
      <div className="rounded-3xl border border-mint-100 bg-white px-4 py-5 text-center shadow-sm">
        <p className="text-sm font-extrabold text-mint-900">Hesap işlemleri için giriş yap</p>
        <p className="mt-1 text-xs text-gray-400">Kampanya ve kupon için üye olman yeterli.</p>
        <button type="button" onClick={onRequireAuth} className={`${tabPrimary} mt-4`}>
          Giriş yap / üye ol
        </button>
      </div>
      {mode === 'drawer' ? null : <SupportContactForm audience="guest" />}
    </div>
  );
  if (mode === 'drawer' || mode === 'embed') return <div className="mt-4">{inner}</div>;
  return (
    <TabPageShell title="Destek" subtitle={`${SUPPORT_EMAIL} üzerinden yazın.`}>
      {inner}
    </TabPageShell>
  );
}

function MenuGroup({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section>
      <h3 className="mb-2 px-1 text-[11px] font-extrabold uppercase tracking-[0.14em] text-mint-700/80">{title}</h3>
      <div className="overflow-hidden rounded-2xl border border-mint-100 bg-white shadow-sm">
        <div className="divide-y divide-mint-50">{children}</div>
      </div>
    </section>
  );
}

function MembershipInfo({
  application,
  email,
  phone,
  ownerName,
}: {
  application: BusinessApplication | null;
  email: string;
  phone: string;
  ownerName: string;
}) {
  const statusLabel =
    application?.status === 'approved' ? 'Onaylı'
      : application?.status === 'rejected' ? 'Reddedildi'
        : application?.status === 'pending' ? 'Onay bekliyor'
          : '—';
  const rows: { label: string; value: string }[] = [
    { label: 'Firma / işletme adı', value: application?.company_name || '—' },
    { label: 'Yetkili ad soyad', value: application?.owner_name || ownerName || '—' },
    { label: 'E-posta', value: application?.email || email || '—' },
    { label: 'Telefon', value: application?.phone || phone || '—' },
    { label: 'Sektör', value: application?.sector || '—' },
    { label: 'İlçe', value: application?.district || '—' },
    { label: 'Açık adres', value: application?.address || '—' },
    { label: 'Vergi dairesi', value: application?.tax_office || '—' },
    { label: 'Vergi numarası', value: application?.tax_number || '—' },
    { label: 'Üyelik durumu', value: statusLabel },
  ];
  return (
    <section className="overflow-hidden rounded-3xl border border-mint-100 bg-white p-4 shadow-sm">
      <p className="mb-1 text-[11px] font-extrabold uppercase tracking-[0.16em] text-mint-600">Üyelik bilgileri</p>
      <p className="mb-3 text-xs text-gray-400">Kayıtta verdiğin firma ve vergi bilgileri.</p>
      <div>
        {rows.map((row) => (
          <div key={row.label} className="border-t border-mint-50 py-2 first:border-t-0">
            <p className="text-[10px] font-bold uppercase tracking-wide text-gray-400">{row.label}</p>
            <p className="mt-0.5 break-words text-sm font-semibold text-mint-900">{row.value}</p>
          </div>
        ))}
      </div>
    </section>
  );
}

function MenuRow({
  icon,
  label,
  badge,
  onClick,
}: {
  icon: ReactNode;
  label: string;
  badge?: number;
  onClick: () => void;
}) {
  return (
    <button type="button" onClick={onClick} className="flex w-full items-center gap-3 px-3 py-3 text-left active:bg-mint-50/80">
      <span className={tabIconWrap}>{icon}</span>
      <span className="min-w-0 flex-1 text-sm font-bold text-mint-900">{label}</span>
      {typeof badge === 'number' ? (
        <span className="rounded-full bg-mint-100 px-2 py-0.5 text-[11px] font-extrabold text-mint-700">{badge}</span>
      ) : null}
      <ChevronRight className="h-4 w-4 text-gray-300" />
    </button>
  );
}

function InfoRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between gap-3 rounded-2xl border border-mint-100 bg-white px-3 py-2.5">
      <span className="text-xs font-bold text-gray-400">{label}</span>
      <span className="truncate text-sm font-semibold text-mint-900">{value}</span>
    </div>
  );
}

function ToggleRow({
  icon,
  label,
  hint,
  on,
  onToggle,
  locked = false,
}: {
  icon: ReactNode;
  label: string;
  hint: string;
  on: boolean;
  onToggle: () => void;
  locked?: boolean;
}) {
  return (
    <div className={`flex items-center gap-3 px-2 py-2.5 ${locked ? 'opacity-55' : ''}`}>
      <span className={tabIconWrap}>{icon}</span>
      <div className="min-w-0 flex-1">
        <p className="text-sm font-bold text-mint-900">{label}</p>
        <p className="text-xs text-gray-400">{hint}</p>
      </div>
      <button
        type="button"
        role="switch"
        aria-checked={on}
        disabled={locked}
        onClick={onToggle}
        className={`relative h-7 w-12 shrink-0 rounded-full transition ${on ? 'bg-mint-500' : 'bg-gray-200'} disabled:cursor-not-allowed`}
      >
        <span className={`absolute top-0.5 h-6 w-6 rounded-full bg-white shadow transition ${on ? 'left-5' : 'left-0.5'}`} />
      </button>
    </div>
  );
}

function formatDate(value?: string) {
  if (!value) return '—';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '—';
  return date.toLocaleDateString('tr-TR', { day: 'numeric', month: 'long', year: 'numeric' });
}

function readNotifyPrefs(): NotifyPrefs {
  try {
    const parsed = JSON.parse(localStorage.getItem(NOTIFY_KEY) ?? '') as Partial<NotifyPrefs>;
    return { ...DEFAULT_NOTIFY, ...parsed };
  } catch {
    return DEFAULT_NOTIFY;
  }
}
