import { useEffect, useState } from 'react';
import { Loader2 } from 'lucide-react';
import { PLAN_PRICES } from '@/lib/plans';
import {
  saveSubscriptionSettings,
  subscriptionPlanText,
  useSubscriptionSettings,
  type SubscriptionSettings,
} from '@/lib/subscription';

export function AdminSubscriptionDesk() {
  const current = useSubscriptionSettings();
  const [draft, setDraft] = useState<SubscriptionSettings>(current);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  useEffect(() => {
    setDraft(current);
  }, [current.is_subscription_active, current.intro_price, current.intro_duration_months, current.standard_price]);

  const save = async () => {
    setBusy(true);
    setMessage(null);
    const result = await saveSubscriptionSettings(draft);
    setBusy(false);
    setMessage(result.ok ? 'Abonelik ayarları kaydedildi.' : (result.message ?? 'Kaydedilemedi.'));
  };

  return (
    <div className="space-y-3 rounded-3xl border border-mint-100 bg-white p-3">
      <div>
        <p className="text-sm font-extrabold text-mint-900">Abonelik</p>
        <p className="mt-1 text-[11px] text-gray-400">Yeni firma kayıtları bu anahtara göre plana girer. Fiyatlar sabittir.</p>
      </div>
      <button
        type="button"
        onClick={() => setDraft((item) => ({ ...item, is_subscription_active: !item.is_subscription_active }))}
        className={`flex w-full items-center justify-between rounded-2xl px-3 py-3 text-left ${draft.is_subscription_active ? 'bg-mint-500 text-white' : 'bg-mint-50 text-mint-800'}`}
      >
        <span className="text-sm font-extrabold">{draft.is_subscription_active ? 'Abonelik açık' : 'Abonelik kapalı'}</span>
        <span className="text-[11px] font-bold">{draft.is_subscription_active ? 'Aktif' : 'Pasif'}</span>
      </button>
      <div className="grid grid-cols-2 gap-2">
        <p className="rounded-2xl bg-mint-50 px-3 py-2 text-xs font-extrabold text-mint-800">Standard {PLAN_PRICES.standard} TL/ay</p>
        <p className="rounded-2xl bg-mint-50 px-3 py-2 text-xs font-extrabold text-mint-800">Premium {PLAN_PRICES.premiumLaunch} TL/ay</p>
      </div>
      <p className="text-[11px] text-gray-400">Premium normal fiyat {PLAN_PRICES.premium} TL/ay. Lansman fiyatı {PLAN_PRICES.premiumLaunch} TL/ay.</p>
      <p className="rounded-2xl bg-cream-50 px-3 py-2 text-xs font-semibold text-mint-800">
        {subscriptionPlanText(draft)}
      </p>
      <button type="button" disabled={busy} onClick={() => { void save(); }} className="inline-flex w-full items-center justify-center gap-1.5 rounded-2xl bg-mint-500 py-2.5 text-sm font-extrabold text-white disabled:opacity-50">
        {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
        Kaydet
      </button>
      {message ? <p className={`text-center text-xs font-bold ${message.includes('kaydedildi') ? 'text-mint-600' : 'text-red-600'}`}>{message}</p> : null}
    </div>
  );
}
