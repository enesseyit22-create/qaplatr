import { ArrowLeft, CheckCircle2, Clock3, Loader2, LogOut } from 'lucide-react';
import { QapLaMark } from '@/components/QapLaMark';

export function BusinessPendingScreen({
  onBack,
  onSignOut,
  companyName,
  loading = false,
}: {
  onBack: () => void;
  onSignOut?: () => void;
  companyName?: string | null;
  loading?: boolean;
}) {
  if (loading) {
    return (
      <div className="flex h-full min-h-0 flex-col items-center justify-center bg-[#f4f7f6]">
        <Loader2 className="h-8 w-8 animate-spin text-mint-500" />
        <p className="mt-3 text-sm font-semibold text-mint-700">Firma bilgileri yükleniyor…</p>
      </div>
    );
  }

  return (
    <div className="flex h-full min-h-0 flex-col bg-[#f4f7f6]">
      <div className="relative shrink-0 overflow-hidden bg-[#16352f] px-5 pb-6 pt-[max(2.6rem,calc(env(safe-area-inset-top)+0.7rem))] text-white">
        <div className="pointer-events-none absolute -right-10 -top-8 h-40 w-40 rounded-full bg-mint-400/20 blur-2xl" />
        <div className="relative flex items-center justify-between">
          <button
            type="button"
            onClick={onBack}
            className="flex h-10 w-10 items-center justify-center rounded-2xl bg-white/15 transition active:scale-90"
          >
            <ArrowLeft className="h-5 w-5" />
          </button>
          {onSignOut ? (
            <button
              type="button"
              onClick={onSignOut}
              className="flex h-10 items-center gap-1.5 rounded-2xl bg-white/15 px-3 text-xs font-bold"
            >
              <LogOut className="h-3.5 w-3.5" /> Çıkış
            </button>
          ) : null}
        </div>
        <div className="relative mt-5 flex items-center gap-3">
          <div className="flex h-14 w-14 items-center justify-center rounded-3xl bg-white shadow-md">
            <QapLaMark className="h-9 w-9" />
          </div>
          <div>
            <p className="text-[10px] font-extrabold uppercase tracking-[0.2em] text-mint-200">Qapla İşletme</p>
            <h1 className="text-xl font-extrabold leading-tight">Başvurunuz Alındı / Onay Bekliyor</h1>
          </div>
        </div>
      </div>

      <div className="flex flex-1 flex-col items-center overflow-y-auto px-6 py-8 text-center">
        <div className="flex h-16 w-16 items-center justify-center rounded-full bg-mint-100 text-mint-600">
          <Clock3 className="h-9 w-9" />
        </div>
        <h2 className="mt-4 text-xl font-extrabold text-mint-900">Başvurunuz Alındı</h2>
        {companyName ? (
          <p className="mt-1 text-sm font-bold text-mint-700">{companyName}</p>
        ) : null}
        <p className="mt-3 max-w-sm text-sm leading-relaxed text-mint-700/80">
          Bu hesap işletme başvurusudur; üye olarak kullanılamaz. Yönetim onayladığında firma paneli açılır.
        </p>
        <div className="mt-6 flex items-center gap-2 rounded-2xl bg-white px-3 py-2 text-xs font-semibold text-mint-700 shadow-sm">
          <CheckCircle2 className="h-4 w-4 text-mint-500" /> Kayıt sıraya alındı
        </div>
        <button type="button" onClick={onSignOut ?? onBack} className="btn-primary mt-8 w-full max-w-sm py-3.5">
          {onSignOut ? 'Çıkış yap' : 'Tamam'}
        </button>
      </div>
    </div>
  );
}
