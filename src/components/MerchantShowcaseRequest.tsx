import { useState } from 'react';
import { ImagePlus, Loader2 } from 'lucide-react';
import type { Company } from '@/lib/campaigns';
import { saveExploreBanner } from '@/lib/exploreBanners';
import { fileToVerticalStoryImage } from '@/lib/stories';

export function MerchantShowcaseRequest({ company }: { company: Company }) {
  const [title, setTitle] = useState(company.name);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  return (
    <form
      className="space-y-2 rounded-3xl border border-mint-100 bg-white p-3"
      onSubmit={async (event) => {
        event.preventDefault();
        const form = event.currentTarget;
        const file = (form.elements.namedItem('banner') as HTMLInputElement | null)?.files?.[0];
        if (!file) {
          setError('Vitrin görseli seç.');
          return;
        }
        setBusy(true);
        setError(null);
        setNotice(null);
        try {
          const imageUrl = await fileToVerticalStoryImage(file);
          await saveExploreBanner({
            title: title.trim() || company.name,
            subtitle: company.category || 'Firma vitrini',
            image_url: imageUrl,
            is_active: false,
            company_id: company.id,
            source: 'company',
            status: 'pending',
            sort_order: 80,
          });
          setNotice('Talep yöneticiye iletildi. Onaylanınca vitrinde yayınlanır.');
          form.reset();
        } catch (err) {
          setError(err instanceof Error ? err.message : 'Talep gönderilemedi');
        } finally {
          setBusy(false);
        }
      }}
    >
      <p className="text-sm font-extrabold text-mint-900">Vitrin banner’ı</p>
      <p className="text-[11px] leading-snug text-slate-500">Görseli yükle ve onay iste. Yayın, yönetici onayından sonra açılır.</p>
      <input
        value={title}
        onChange={(event) => setTitle(event.target.value)}
        className="w-full rounded-2xl border-2 border-mint-100 px-3 py-2.5 text-sm text-mint-800"
        placeholder="Banner başlığı"
      />
      <label className="flex cursor-pointer items-center gap-2 rounded-2xl border border-dashed border-mint-200 px-3 py-3 text-sm font-bold text-mint-700">
        <ImagePlus className="h-4 w-4" />
        Vitrin görseli seç
        <input name="banner" type="file" accept="image/*" className="hidden" />
      </label>
      {error ? <p className="text-xs text-red-500">{error}</p> : null}
      {notice ? <p className="text-xs text-emerald-700">{notice}</p> : null}
      <button type="submit" disabled={busy} className="flex w-full items-center justify-center rounded-2xl bg-[#10241f] py-2.5 text-sm font-extrabold text-white disabled:opacity-50">
        {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : 'Yöneticiden İzin / Onay Talep Et'}
      </button>
    </form>
  );
}
