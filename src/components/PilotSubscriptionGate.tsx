import { useEffect, useRef, useState } from 'react';
import { ArrowLeft, BadgeCheck, Check, Loader2, Sparkles } from 'lucide-react';
import { PLAN_PRICES, planLimits, type PlanTier } from '@/lib/plans';
import { formatTrialDate } from '@/lib/subscription';
import { applyPlanPurchase } from '@/lib/storeBilling';

const PERKS = [
  'Kampanyaların Keşfet vitrininde görünür',
  'Müşteriye anlık bildirim',
  'Kupon ve konum takibi',
  'Firma paneli açık kalır',
];

function wait(ms: number) {
  return new Promise((resolve) => window.setTimeout(resolve, ms));
}

export function PilotSubscriptionGate({
  companyId,
  endsAt,
  reason = 'trial',
  onBack,
  onStarted,
}: {
  companyId: string;
  endsAt?: string | null;
  reason?: 'trial' | 'plan';
  onBack: () => void;
  onStarted: () => void;
}) {
  const [phase, setPhase] = useState<'plan' | 'paying' | 'success'>('plan');
  const [tier, setTier] = useState<PlanTier>('standard');
  const [error, setError] = useState<string | null>(null);
  const alive = useRef(true);
  useEffect(() => {
    alive.current = true;
    return () => { alive.current = false; };
  }, []);

  const subscribe = async () => {
    setPhase('paying');
    setError(null);
    await wait(1500);
    if (!alive.current) return;
    setPhase('success');
    await wait(800);
    if (!alive.current) return;
    const result = await applyPlanPurchase(companyId, tier);
    if (!alive.current) return;
    if (!result.ok) {
      setPhase('plan');
      setError(result.message ?? 'Abonelik başlatılamadı.');
      return;
    }
    onStarted();
  };

  return (
    <div className="relative flex h-full min-h-0 flex-col bg-[#f3f6f8]">
      <div className="shrink-0 bg-[#10241f] px-5 pb-7 pt-[max(1.4rem,env(safe-area-inset-top))] text-white">
        <button
          type="button"
          onClick={onBack}
          className="flex h-10 w-10 items-center justify-center rounded-2xl bg-white/10"
          aria-label="Geri"
        >
          <ArrowLeft className="h-5 w-5" />
        </button>
        <p className="mt-5 inline-flex items-center gap-1 rounded-full bg-white/10 px-2.5 py-1 text-[10px] font-extrabold uppercase tracking-[0.16em] text-mint-200">
          <Sparkles className="h-3 w-3" />
          {reason === 'trial' ? 'Pilot süre bitti' : 'QapLA Firma'}
        </p>
        <h1 className="mt-3 text-[1.65rem] font-extrabold leading-tight">Şehrinde görünür ol</h1>
        <p className="mt-2 max-w-[18rem] text-sm leading-relaxed text-white/70">
          {reason === 'trial'
            ? (formatTrialDate(endsAt) ? `${formatTrialDate(endsAt)} tarihinde 60 günlük ücretsiz kullanım kapandı.` : '60 günlük ücretsiz kullanım kapandı.')
            : 'Standard 599 TL/ay. Premium lansman 1299 TL/ay, normal fiyat 1599 TL/ay.'}
        </p>
      </div>

      <div className="relative min-h-0 flex-1 overflow-y-auto px-5 pb-8">
        <div className="-mt-4 grid grid-cols-2 gap-3">
          {(['standard', 'premium'] as const).map((item) => {
            const limits = planLimits(item);
            const selected = tier === item;
            return (
              <button
                key={item}
                type="button"
                onClick={() => setTier(item)}
                className={`rounded-[1.6rem] border p-4 text-left shadow-sm transition ${selected ? 'border-[#12b886] bg-white ring-2 ring-[#12b886]/30' : 'border-slate-200/80 bg-white/80'}`}
              >
                <p className="text-[11px] font-extrabold uppercase tracking-[0.16em] text-[#0f9f75]">{limits.label}</p>
                <p className="mt-2 text-[1.65rem] font-extrabold leading-none tracking-tight text-slate-900">
                  {item === 'premium' ? PLAN_PRICES.premiumLaunch : PLAN_PRICES.standard}
                  <span className="ml-1 text-sm font-bold text-slate-400">TL/ay</span>
                </p>
                {item === 'premium' ? (
                  <p className="mt-1 text-[11px] text-slate-400">Normal <span className="line-through">{PLAN_PRICES.premium} TL</span></p>
                ) : (
                  <p className="mt-1 text-[11px] text-slate-400">Temel görünürlük</p>
                )}
                <p className="mt-3 text-xs font-semibold text-slate-600">{limits.dailyCampaigns} kampanya / gün</p>
                <p className="text-xs font-semibold text-slate-600">{item === 'premium' ? `${limits.weeklyPush} bölgesel bildirim / hafta` : 'Bölgesel bildirim yok'}</p>
              </button>
            );
          })}
        </div>

        <div className="mt-4 flex flex-wrap gap-1.5">
          {['Keşfet', 'Bildirim', 'Kupon', 'Konum'].map((tag) => (
            <span key={tag} className="rounded-full bg-white px-2.5 py-1 text-[11px] font-bold text-mint-800 ring-1 ring-mint-100">
              {tag}
            </span>
          ))}
        </div>

        <ul className="mt-4 space-y-2 rounded-[1.4rem] bg-white p-4 ring-1 ring-slate-100">
          {PERKS.map((perk) => (
            <li key={perk} className="flex items-start gap-2 text-sm text-slate-700">
              <span className="mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-mint-50 text-mint-600">
                <Check className="h-3.5 w-3.5" />
              </span>
              {perk}
            </li>
          ))}
        </ul>

        {error ? <p className="mt-3 rounded-2xl bg-red-50 px-3 py-2 text-sm text-red-600">{error}</p> : null}

        <button
          type="button"
          disabled={phase !== 'plan'}
          onClick={() => { void subscribe(); }}
          className="mt-4 w-full rounded-2xl bg-[#10241f] py-4 text-sm font-extrabold text-white disabled:opacity-60"
        >
          {tier === 'premium' ? 'Premium’a geç' : 'Standard’a geç'}
        </button>
        <p className="mt-2 text-center text-[11px] leading-relaxed text-slate-400">
          Seçilen paket onaylanınca firma paneline yazılır. Kart bilgisi istenmez.
        </p>
      </div>

      {phase !== 'plan' ? (
        <div className="absolute inset-0 z-20 flex items-center justify-center bg-[#10241f]/55 px-8 backdrop-blur-sm">
          <div className="w-full max-w-[16rem] rounded-[1.6rem] bg-white px-5 py-7 text-center shadow-xl">
            {phase === 'paying' ? (
              <>
                <span className="mx-auto flex h-14 w-14 items-center justify-center rounded-full bg-mint-50 text-mint-600">
                  <Loader2 className="h-7 w-7 animate-spin" />
                </span>
                <p className="mt-4 text-base font-extrabold text-slate-900">Ödeme yapılıyor</p>
                <p className="mt-1 text-xs text-slate-500">İşlem güvenli şekilde tamamlanıyor</p>
              </>
            ) : (
              <>
                <span className="mx-auto flex h-14 w-14 items-center justify-center rounded-full bg-mint-500 text-white">
                  <BadgeCheck className="h-7 w-7" />
                </span>
                <p className="mt-4 text-base font-extrabold text-slate-900">Ödeme başarılı</p>
                <p className="mt-1 text-xs text-slate-500">Firma paneli açılıyor</p>
              </>
            )}
          </div>
        </div>
      ) : null}
    </div>
  );
}
