import { useState } from 'react';
import { Check, Loader2 } from 'lucide-react';
import { approveExploreBanner, useExploreBanners } from '@/lib/exploreBanners';
import { approveStory, useLiveStories } from '@/lib/stories';

export function AdminShowcaseQueue() {
  const stories = useLiveStories().filter((item) => item.status === 'pending');
  const banners = useExploreBanners().filter((item) => item.status === 'pending' || (item.source === 'company' && !item.is_active));
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  if (stories.length === 0 && banners.length === 0) return null;

  const approve = async (kind: 'story' | 'banner', id: string) => {
    setBusy(id);
    setError(null);
    try {
      if (kind === 'story') await approveStory(id);
      else await approveExploreBanner(id);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Onaylanamadı');
    } finally {
      setBusy(null);
    }
  };

  return (
    <section className="mb-3 space-y-2 rounded-3xl border border-emerald-100 bg-white p-3">
      <p className="text-sm font-extrabold text-mint-900">Onay bekleyen paylaşımlar</p>
      <p className="text-[11px] leading-snug text-slate-500">Onaylanınca hikaye 24 saat, vitrin banner’ı keşifte yayına girer. Yönetici duyuruları her bölgede en üstte kalır.</p>
      {error ? <p className="rounded-2xl bg-red-50 px-3 py-2 text-xs text-red-600">{error}</p> : null}
      {stories.map((item) => (
        <article key={item.id} className="flex items-center gap-2 rounded-2xl bg-slate-50 p-2">
          <img src={item.image_data} alt="" className="h-14 w-9 shrink-0 rounded-lg object-cover" />
          <div className="min-w-0 flex-1">
            <p className="truncate text-xs font-extrabold text-slate-800">{item.company_name}</p>
            <p className="truncate text-[11px] text-slate-500">{item.caption || 'Hikaye'} · onay bekliyor</p>
          </div>
          <button
            type="button"
            disabled={busy === item.id}
            onClick={() => { void approve('story', item.id); }}
            className="inline-flex items-center gap-1 rounded-xl bg-emerald-500 px-2.5 py-2 text-[11px] font-extrabold text-white disabled:opacity-50"
          >
            {busy === item.id ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Check className="h-3.5 w-3.5" />}
            Onayla
          </button>
        </article>
      ))}
      {banners.map((item) => (
        <article key={item.id} className="flex items-center gap-2 rounded-2xl bg-slate-50 p-2">
          {item.image_url ? <img src={item.image_url} alt="" className="h-12 w-16 shrink-0 rounded-lg object-cover" /> : null}
          <div className="min-w-0 flex-1">
            <p className="truncate text-xs font-extrabold text-slate-800">{item.title}</p>
            <p className="truncate text-[11px] text-slate-500">Vitrin talebi · onay bekliyor</p>
          </div>
          <button
            type="button"
            disabled={busy === item.id}
            onClick={() => { void approve('banner', item.id); }}
            className="inline-flex items-center gap-1 rounded-xl bg-emerald-500 px-2.5 py-2 text-[11px] font-extrabold text-white disabled:opacity-50"
          >
            {busy === item.id ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Check className="h-3.5 w-3.5" />}
            Onayla
          </button>
        </article>
      ))}
    </section>
  );
}
