import { Bell, ImagePlus, Lock } from 'lucide-react';
import { VipGoldMark } from '@/components/VipGoldMark';

export function VipLockedFeature({
  title,
  body,
}: {
  title: string;
  body: string;
}) {
  return (
    <section className="relative overflow-hidden rounded-3xl border border-amber-200/80 bg-white p-5 shadow-[0_10px_28px_-18px_rgba(166,124,20,0.45)]">
      <div className="pointer-events-none absolute -right-8 -top-10 h-28 w-28 rounded-full bg-amber-100/70 blur-2xl" />
      <div className="relative flex items-start gap-3">
        <VipGoldMark className="h-14 w-14" />
        <div className="min-w-0 flex-1">
          <span className="inline-flex items-center gap-1 rounded-full bg-amber-50 px-2 py-0.5 text-[10px] font-black uppercase tracking-[0.18em] text-amber-800">
            <Lock className="h-3 w-3" /> VIP
          </span>
          <h3 className="mt-2 text-base font-extrabold text-mint-900">{title}</h3>
          <p className="mt-1.5 text-sm leading-relaxed text-mint-800/75">{body}</p>
        </div>
      </div>
      <p className="relative mt-4 rounded-2xl bg-amber-50/90 px-3 py-2.5 text-center text-[11px] font-extrabold uppercase tracking-[0.14em] text-amber-800">
        Premium ile açılır · lansman 1299 TL/ay
      </p>
    </section>
  );
}

export function VipLockedNotifyPreview() {
  return (
    <div className="space-y-3">
      <VipLockedFeature
        title="Bildirim gönder"
        body="VIP ile kampanya duyurusu takipçilere değil, firmanın 1 km çevresindeki kullanıcılara gider. Plan yayına alındığında bu panel etkinleşir."
      />
      <fieldset disabled className="space-y-2 rounded-3xl border border-mint-100 bg-white/70 p-4 opacity-55">
        <p className="flex items-center gap-2 text-sm font-extrabold text-mint-800">
          <Bell className="h-4 w-4" /> Bildirim taslağı
        </p>
        <input className={previewField} placeholder="Başlık" readOnly />
        <textarea className={`${previewField} resize-none`} rows={3} placeholder="Kısa duyuru metni" readOnly />
        <button type="button" className="btn-primary w-full py-3 opacity-70">Gönder</button>
      </fieldset>
    </div>
  );
}

export function VipLockedStoryPreview() {
  return (
    <div className="space-y-3">
      <VipLockedFeature
        title="Hikaye yayını"
        body="Dikey hikaye paylaşımı, QapLA VIP üyelikte Keşfet vitrininde öncelikli olarak açılır. Üyelik aktif olduğunda firmanız 24 saatlik hikaye yayınlayabilir."
      />
      <fieldset disabled className="space-y-2 rounded-3xl border border-mint-100 bg-white/70 p-4 opacity-55">
        <p className="flex items-center gap-2 text-sm font-extrabold text-mint-800">
          <ImagePlus className="h-4 w-4" /> Hikaye taslağı
        </p>
        <div className="flex items-center gap-2 rounded-2xl border border-dashed border-mint-200 px-3 py-3 text-sm font-bold text-mint-600">
          <ImagePlus className="h-4 w-4" /> Dikey fotoğraf seç
        </div>
        <input className={previewField} placeholder="Kısa yazı" readOnly />
        <button type="button" className="btn-primary w-full py-3 opacity-70">Hikayeyi yayınla</button>
      </fieldset>
    </div>
  );
}

const previewField = 'w-full rounded-2xl border-2 border-mint-100 bg-white px-3 py-2.5 text-sm text-mint-800 placeholder:text-gray-300';
