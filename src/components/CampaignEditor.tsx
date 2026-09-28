import { useState } from 'react';
import { ImagePlus, Loader2, Megaphone } from 'lucide-react';
import type { Campaign } from '@/lib/campaigns';
import { fileToDataUrl } from '@/lib/utils';

export type CampaignDraft = {
  title: string;
  discount_rate: number;
  expiry_date: string;
  details: string;
  is_active: boolean;
  image_url?: string | null;
  duration_type: 'date' | 'countdown';
  duration_hours: number | null;
  stock: number;
};

export function CampaignEditor({
  companies,
  companyId,
  onCompanyId,
  initial,
  busy,
  tone = 'light',
  submitLabel,
  onSubmit,
  locked = false,
  lockMessage,
}: {
  companies?: { id: string; name: string }[];
  companyId?: string;
  onCompanyId?: (id: string) => void;
  initial?: Campaign | null;
  busy: boolean;
  tone?: 'light' | 'dark';
  submitLabel: string;
  onSubmit: (draft: CampaignDraft) => Promise<void>;
  locked?: boolean;
  lockMessage?: string;
}) {
  const dark = tone === 'dark';
  const field = dark
    ? 'w-full rounded-2xl border border-white/10 bg-zinc-900 px-3 py-2.5 text-sm text-zinc-100 placeholder:text-zinc-600 focus:border-emerald-400 focus:outline-none'
    : 'w-full rounded-2xl border-2 border-mint-100 bg-white px-3 py-2.5 text-sm text-mint-800 placeholder:text-gray-300 focus:border-mint-400 focus:outline-none';
  const [title, setTitle] = useState(initial?.title ?? '');
  const [discount, setDiscount] = useState(
    initial?.discount_rate && Number(initial.discount_rate) > 0 ? String(initial.discount_rate) : '',
  );
  const [stock, setStock] = useState(String(initial?.stock ?? 10));
  const [details, setDetails] = useState(initial?.details ?? '');
  const [active, setActive] = useState(initial?.is_active ?? true);
  const [image, setImage] = useState<string | null>(initial?.image_url ?? null);

  if (locked && !initial) {
    return (
      <section className={`space-y-1 rounded-3xl border px-4 py-3 ${dark ? 'border-white/10 bg-white/5' : 'border-amber-100 bg-amber-50/80'}`}>
        <p className={`text-sm font-extrabold ${dark ? 'text-white' : 'text-mint-900'}`}>Yeni kampanya</p>
        <p className={`text-xs leading-relaxed ${dark ? 'text-zinc-400' : 'text-amber-800'}`}>
          {lockMessage ?? 'VIP olmadan günde yalnızca 1 kampanya eklenebilir. Hakkın doldu.'}
        </p>
      </section>
    );
  }

  return (
    <form
      className="space-y-2.5"
      onSubmit={async (event) => {
        event.preventDefault();
        const rate = discount.trim() === '' ? 0 : Number(discount);
        const units = Math.floor(Number(stock));
        if (!title.trim() || !Number.isFinite(rate) || rate < 0 || rate > 100) return;
        if (!Number.isFinite(units) || units < 1) return;
        const expiryDate = new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
        await onSubmit({
          title,
          discount_rate: rate,
          expiry_date: expiryDate,
          details,
          is_active: active,
          image_url: image,
          duration_type: 'countdown',
          duration_hours: 24,
          stock: units,
        });
      }}
    >
      {companies && onCompanyId ? (
        <select className={field} value={companyId} onChange={(e) => onCompanyId(e.target.value)}>
          {companies.map((company) => (
            <option key={company.id} value={company.id}>{company.name}</option>
          ))}
        </select>
      ) : null}
      <input className={field} required placeholder="Başlık" value={title} onChange={(e) => setTitle(e.target.value)} />
      <div className="grid grid-cols-2 gap-2">
        <label className={`block text-[11px] font-bold ${dark ? 'text-zinc-400' : 'text-mint-700'}`}>
          İndirim % (isteğe bağlı)
          <input
            className={`${field} mt-1`}
            type="number"
            min={0}
            max={100}
            step="0.5"
            placeholder="Boş bırakılabilir"
            value={discount}
            onChange={(e) => setDiscount(e.target.value)}
          />
        </label>
        <label className={`block text-[11px] font-bold ${dark ? 'text-zinc-400' : 'text-mint-700'}`}>
          Stok (adet)
          <input
            className={`${field} mt-1`}
            required
            type="number"
            min={1}
            step={1}
            placeholder="Stok"
            value={stock}
            onChange={(e) => setStock(e.target.value)}
          />
        </label>
      </div>
      <p className={`rounded-2xl px-3 py-2 text-[11px] font-semibold ${dark ? 'bg-white/5 text-zinc-300' : 'bg-mint-50 text-mint-800'}`}>
        Keşif vitrininde 24 saat yayında kalır. Süre dolunca arşive düşer. Stok, girdiğin adet kadar düşer.
      </p>
      <textarea className={`${field} min-h-[72px]`} placeholder="Detay" value={details} onChange={(e) => setDetails(e.target.value)} />
      <label className={`flex items-center gap-2 rounded-2xl border px-3 py-2 text-xs font-semibold ${dark ? 'border-white/10 text-zinc-300' : 'border-mint-100 text-mint-700'}`}>
        <ImagePlus className="h-4 w-4" />
        Görsel (isteğe bağlı)
        <input
          type="file"
          accept="image/*"
          className="hidden"
          onChange={async (event) => {
            const file = event.target.files?.[0];
            if (!file) return;
            setImage(await fileToDataUrl(file));
          }}
        />
      </label>
      {image ? <img src={image} alt="" className="h-20 w-full rounded-2xl object-cover" /> : null}
      <label className={`flex items-center gap-2 text-xs font-semibold ${dark ? 'text-zinc-200' : 'text-mint-700'}`}>
        <input type="checkbox" checked={active} onChange={(e) => setActive(e.target.checked)} />
        Aktif
      </label>
      <button type="submit" disabled={busy} className={`inline-flex w-full items-center justify-center gap-2 rounded-2xl py-3 text-sm font-semibold disabled:opacity-50 ${dark ? 'bg-emerald-400 text-zinc-950' : 'btn-primary'}`}>
        {busy ? <Loader2 className="w-4 h-4 animate-spin" /> : <><Megaphone className="w-4 h-4" /> {submitLabel}</>}
      </button>
    </form>
  );
}
