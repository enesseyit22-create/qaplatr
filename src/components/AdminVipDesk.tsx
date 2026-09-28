import { Crown, Lock } from 'lucide-react';
import { VipGoldMark } from '@/components/VipGoldMark';
import { setVipFeature, useAppFeatures } from '@/lib/appFeatures';

export function AdminVipDesk() {
  const features = useAppFeatures();
  const campaignOn = Boolean(features?.vip?.campaignAlerts);

  return (
    <div className="space-y-3">
      <div className="rounded-[28px] border border-amber-200/80 bg-white p-5 text-center shadow-sm">
        <VipGoldMark className="mx-auto h-16 w-16" />
        <p className="mt-3 text-[10px] font-extrabold uppercase tracking-[0.22em] text-amber-700/80">Pasif</p>
        <h2 className="mt-1 font-display text-2xl font-black text-mint-900">QAP VIP</h2>
        <p className="mt-2 text-sm leading-relaxed text-mint-800/75">
          Ücretli VIP buradan yönetilecek. Şimdilik üyelik kapalı; kampanya bildirimi yalnızca VIP ve sen açarsan gider.
        </p>
      </div>
      <label className="flex items-center justify-between gap-3 rounded-2xl border border-mint-100 bg-white px-3 py-3">
        <span>
          <span className="flex items-center gap-1.5 text-sm font-extrabold text-mint-900">
            <Crown className="h-4 w-4 text-amber-700" /> Kampanya bildirimleri
          </span>
          <span className="mt-0.5 block text-[11px] text-gray-400">
            Açınca yalnızca VIP üyelerin ziline yeni kampanya düşer. Kapalıyken hiç kimseye gitmez.
          </span>
        </span>
        <button
          type="button"
          onClick={() => setVipFeature('campaignAlerts', !campaignOn)}
          className={`relative h-7 w-12 shrink-0 rounded-full transition ${campaignOn ? 'bg-mint-500' : 'bg-mint-100'}`}
          aria-pressed={campaignOn}
        >
          <span className={`absolute top-0.5 h-6 w-6 rounded-full bg-white shadow ${campaignOn ? 'right-0.5' : 'left-0.5'}`} />
        </button>
      </label>
      <div className="space-y-2 opacity-55">
        {[
          { title: 'Üye VIP', hint: 'Öncelikli sıra, kupon kuyruğu' },
          { title: 'Firma VIP', hint: 'Altın rozet, Keşfet öne çıkma' },
          { title: 'Ücret / süre', hint: 'Aylık paket ve bitiş tarihi' },
        ].map((row) => (
          <label key={row.title} className="flex cursor-not-allowed items-center justify-between rounded-2xl border border-mint-100 bg-white px-3 py-3">
            <span>
              <span className="flex items-center gap-1.5 text-sm font-extrabold text-mint-900">
                <Crown className="h-4 w-4 text-amber-700" /> {row.title}
              </span>
              <span className="mt-0.5 block text-[11px] text-gray-400">{row.hint}</span>
            </span>
            <span className="flex items-center gap-1 rounded-full bg-amber-50 px-2 py-1 text-[10px] font-extrabold text-amber-800">
              <Lock className="h-3 w-3" /> Kapalı
            </span>
            <input type="checkbox" disabled className="sr-only" />
          </label>
        ))}
      </div>
    </div>
  );
}
