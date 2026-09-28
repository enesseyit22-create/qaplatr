import { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { Menu, Store, X, KeyRound, Megaphone, BarChart3, LogOut, Sparkles, ChevronDown, Headset } from 'lucide-react';
import { EXPLORE_SECTORS, type ExploreCategoryId } from '@/lib/sectors';
import { useAuth } from '@/lib/authContext';
import { ProfileTabScreen } from '@/components/ProfileAccountScreen';
import { ROLE_LABELS } from '@/lib/roleMatrix';
import { useAppFeatures } from '@/lib/appFeatures';
import type { Merchant } from '@/lib/supabase';
import type { Company } from '@/lib/campaigns';
import { SupportContactForm } from '@/components/SupportContactForm';

export function SideMenu({
  merchants = [],
  favoriteMerchants = [],
  onSector,
  onFavorite,
  onVisits,
  onSaved,
  onMerchantLogin,
  onBusinessRegister,
  hideMerchantLogin = false,
  merchantTab,
  onMerchantTab,
  tone = 'light',
  variant = 'user',
  company = null,
  onRequireAuth,
}: {
  merchants?: Merchant[];
  favoriteMerchants?: Merchant[];
  onSector?: (id: ExploreCategoryId) => void;
  onFavorite?: (merchant: Merchant) => void;
  onVisits?: () => void;
  onSaved?: () => void;
  onMerchantLogin?: () => void;
  onBusinessRegister?: () => void;
  hideMerchantLogin?: boolean;
  merchantTab?: string;
  onMerchantTab?: (tab: 'code' | 'campaigns' | 'report' | 'vip') => void;
  variant?: 'user' | 'merchant';
  tone?: 'light' | 'mint';
  company?: Company | null;
  onRequireAuth?: () => void;
}) {
  const { user, profile, signOut } = useAuth();
  const features = useAppFeatures();
  const [open, setOpen] = useState(false);
  const [supportOpen, setSupportOpen] = useState(false);
  const isGuest = !user;
  const role = isGuest ? null : (profile?.role ?? (variant === 'merchant' ? 'merchant' : 'user'));
  const catalog = merchants.length ? merchants : favoriteMerchants;

  useEffect(() => {
    if (!open) setSupportOpen(false);
  }, [open]);

  const drawer = open ? createPortal(
    <div className="qapla-drawer pointer-events-auto fixed inset-0 z-[2000] flex justify-start bg-black/45">
      <button type="button" className="absolute inset-0" aria-label="Kapat" onClick={() => setOpen(false)} />
      <aside className="relative z-[1] flex h-full w-[min(92%,360px)] flex-col overflow-y-auto bg-[#eef3f1] px-4 pb-[max(1.2rem,env(safe-area-inset-bottom))] pt-[max(1.1rem,env(safe-area-inset-top))] shadow-2xl">
        <div className="flex items-center justify-between">
          <p className="text-sm font-extrabold text-mint-800">{variant === 'merchant' ? 'Firma menüsü' : role === 'admin' ? 'Yönetici menüsü' : 'Hesap menüsü'}</p>
          <button type="button" onClick={() => setOpen(false)} className="flex h-8 w-8 items-center justify-center rounded-full bg-white text-mint-700 shadow-sm">
            <X className="h-4 w-4" />
          </button>
        </div>

        {variant === 'user' && !hideMerchantLogin && role !== 'merchant' && role !== 'admin' ? (
          <section className="mt-4 overflow-hidden rounded-3xl bg-gradient-to-br from-mint-700 via-mint-600 to-mint-500 p-4 text-white shadow-mint">
            <p className="inline-flex items-center gap-1 text-[10px] font-extrabold uppercase tracking-[0.18em] text-mint-100">
              <Sparkles className="h-3 w-3" /> Qapla İşletme
            </p>
            <h2 className="mt-1.5 text-lg font-extrabold leading-tight">İşletmeniz var mı?</h2>
            <p className="mt-1 text-xs leading-relaxed text-white/85">
              Kampanyanızı haritada yayınlayın, kuponla müşteri çekin. Başvurular yönetim onayından geçer.
            </p>
            <div className="mt-3 grid grid-cols-2 gap-2">
              <button
                type="button"
                onClick={() => { setOpen(false); onBusinessRegister?.(); }}
                className="rounded-2xl bg-white py-2.5 text-xs font-extrabold text-mint-800"
              >
                Firma kaydı
              </button>
              <button
                type="button"
                onClick={() => { setOpen(false); onMerchantLogin?.(); }}
                className="rounded-2xl bg-white/15 py-2.5 text-xs font-extrabold text-white"
              >
                Giriş yap
              </button>
            </div>
          </section>
        ) : null}

        {variant === 'merchant' && company ? (
          <section className="mt-4 rounded-2xl border border-mint-100 bg-white px-3 py-3">
            <p className="text-[10px] font-bold uppercase tracking-[0.16em] text-gray-400">Firma bilgileri</p>
            <p className="mt-1 text-sm font-extrabold text-mint-900">{company?.name ?? 'İşletme'}</p>
            <p className="mt-0.5 text-xs text-gray-500">{company?.category || 'Kategori yok'}</p>
            {company?.address ? <p className="mt-1 text-xs leading-snug text-gray-500">{company.address}</p> : null}
            {company?.phone ? <p className="mt-1 text-xs text-gray-500">{company.phone}</p> : null}
            {company?.email ? <p className="mt-0.5 text-xs text-gray-500">{company.email}</p> : null}
            <p className="mt-2 inline-flex rounded-full bg-mint-100 px-2 py-0.5 text-[10px] font-extrabold uppercase tracking-wide text-mint-800">
              {ROLE_LABELS[role ?? 'merchant']}
            </p>
          </section>
        ) : null}

        {variant === 'merchant' ? (
          <nav className="mt-4 space-y-1.5">
            {([
              { id: 'code' as const, label: 'Onay', hint: 'Müşteri kuponunu doğrula', Icon: KeyRound, flag: features.merchant.code },
              { id: 'campaigns' as const, label: 'Kampanyalar', hint: 'Oluştur, stok, aktif/pasif', Icon: Megaphone, flag: features.merchant.campaigns },
              { id: 'report' as const, label: 'Raporlar', hint: 'Kullanım özeti', Icon: BarChart3, flag: features.merchant.report },
            ]).filter((item) => item.flag).map((item) => (
              <button
                key={item.id}
                type="button"
                onClick={() => { onMerchantTab?.(item.id); setOpen(false); }}
                className={`flex w-full items-start gap-3 rounded-2xl px-3 py-2.5 text-left ${merchantTab === item.id ? 'bg-mint-100 text-mint-800' : 'bg-white text-mint-800'}`}
              >
                <item.Icon className="mt-0.5 h-4 w-4 shrink-0" />
                <span>
                  <span className="block text-sm font-bold">{item.label}</span>
                  <span className="block text-[11px] text-gray-400">{item.hint}</span>
                </span>
              </button>
            ))}
            <button
              type="button"
              onClick={() => { setOpen(false); void signOut(); }}
              className="mt-2 flex w-full items-center justify-center gap-2 rounded-2xl bg-rose-50 px-3 py-2.5 text-sm font-bold text-rose-600"
            >
              <LogOut className="h-4 w-4" /> Çıkış yap
            </button>
          </nav>
        ) : null}

        {variant === 'merchant' ? (
          <div className="mt-4">
            <SupportContactForm audience="merchant" />
          </div>
        ) : null}

        {variant !== 'merchant' ? (
          <ProfileTabScreen
            mode="drawer"
            merchants={catalog}
            onRequireAuth={() => { setOpen(false); onRequireAuth?.(); }}
            onExplore={() => setOpen(false)}
            onVisits={() => { setOpen(false); onVisits?.(); }}
            onSaved={() => { setOpen(false); onSaved?.(); }}
            onOpenCompany={(merchant) => { onFavorite?.(merchant); setOpen(false); }}
          />
        ) : null}

        {variant === 'user' && onSector ? (
          <section className="mt-4">
            <p className="mb-2 px-1 text-[11px] font-extrabold uppercase tracking-[0.14em] text-mint-700/80">Sektörler</p>
            <div className="flex flex-wrap gap-1.5">
              {EXPLORE_SECTORS.map((item) => (
                <button
                  key={item.id}
                  type="button"
                  onClick={() => { onSector(item.id); setOpen(false); }}
                  className="rounded-full bg-white px-2.5 py-1 text-[11px] font-bold text-mint-700 shadow-sm"
                >
                  {item.label}
                </button>
              ))}
            </div>
          </section>
        ) : null}

        {isGuest && variant === 'user' ? (
          <section className="mt-auto pt-6">
            <button
              type="button"
              onClick={() => setSupportOpen((current) => !current)}
              className="flex h-12 w-full items-center justify-between rounded-2xl border border-mint-100 bg-white px-3.5 text-left shadow-sm"
              aria-expanded={supportOpen}
            >
              <span className="inline-flex items-center gap-2 text-sm font-extrabold text-mint-900">
                <Headset className="h-4 w-4 text-mint-600" />
                Destek
              </span>
              <ChevronDown className={`h-4 w-4 text-mint-600 transition-transform ${supportOpen ? 'rotate-180' : ''}`} />
            </button>
            {supportOpen ? (
              <div className="mt-2">
                <SupportContactForm audience="guest" />
              </div>
            ) : (
              <p className="px-1 pt-2 text-[11px] text-gray-400">Üye olmadan yazabilirsin. Paneli açmak için dokun.</p>
            )}
          </section>
        ) : null}
      </aside>
    </div>,
    document.body,
  ) : null;

  const buttonClass = tone === 'mint'
    ? 'pointer-events-auto flex h-12 w-12 items-center justify-center rounded-2xl bg-white/15 text-white'
    : 'pointer-events-auto flex h-10 w-10 items-center justify-center rounded-full border border-mint-200 bg-white text-mint-600 shadow-soft';

  return (
    <>
      <button type="button" onClick={() => setOpen(true)} className={buttonClass} aria-label="Menü">
        <Menu className="h-5 w-5" strokeWidth={2.6} />
      </button>
      {drawer}
    </>
  );
}
