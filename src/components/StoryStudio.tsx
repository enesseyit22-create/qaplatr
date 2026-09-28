import { useState } from 'react';
import { ImagePlus, Loader2, Trash2 } from 'lucide-react';
import type { Company } from '@/lib/campaigns';
import {
  addStory,
  canCompanyPostStories,
  fileToVerticalStoryImage,
  removeStory,
  useLiveStories,
  type Story,
} from '@/lib/stories';

export function StoryStudio({
  actor,
  company,
  companies = [],
  allowPlatform = false,
  tone = 'light',
  onChanged,
}: {
  actor: 'admin' | 'merchant';
  company?: Company | null;
  companies?: Company[];
  allowPlatform?: boolean;
  tone?: 'light' | 'dark';
  onChanged?: () => void;
}) {
  const live = useLiveStories();
  const [companyId, setCompanyId] = useState(company?.id ?? '');
  const [caption, setCaption] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const merchantAllowed = actor !== 'merchant' || canCompanyPostStories(company?.id);

  const selected = companies.find((item) => item.id === companyId) ?? company ?? null;
  const rows: Story[] = actor === 'merchant' && company
    ? live.filter((item) => item.company_id === company.id)
    : companyId
      ? live.filter((item) => item.company_id === companyId)
      : live;

  const field = tone === 'dark'
    ? 'w-full rounded-2xl border border-white/10 bg-white/5 px-3 py-2.5 text-sm text-white'
    : 'w-full rounded-2xl border-2 border-mint-100 px-3 py-2.5 text-sm text-mint-800';
  const card = tone === 'dark' ? 'rounded-2xl border border-white/10 bg-white/[0.03] p-3' : 'rounded-2xl border border-mint-100 bg-white p-3';
  const muted = tone === 'dark' ? 'text-zinc-400' : 'text-gray-500';

  if (actor === 'merchant' && !merchantAllowed) {
    return (
      <div className={card}>
        <p className={`text-sm font-extrabold ${tone === 'dark' ? 'text-white' : 'text-mint-900'}`}>Hikaye</p>
        <p className={`mt-1 text-xs ${muted}`}>
          Bu firma için hikaye paylaşımı kapalı. Yönetici yetki verdiğinde dikey fotoğraf yükleyebilirsin.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      <form
        className={`${card} space-y-2`}
        onSubmit={async (event) => {
          event.preventDefault();
          const form = event.currentTarget;
          const file = (form.elements.namedItem('story') as HTMLInputElement | null)?.files?.[0];
          if (!file) {
            setError('Dikey bir fotoğraf seç.');
            return;
          }
          setBusy(true);
          setError(null);
          try {
            const image_data = await fileToVerticalStoryImage(file);
            const platform = actor === 'admin' && allowPlatform && !companyId;
            const target = actor === 'merchant' ? company : selected;
            await addStory({
              company_id: platform ? null : target?.id ?? null,
              company_name: actor === 'admin' ? (platform || !target ? 'QapLA' : target.name) : (target?.name ?? 'QapLA'),
              image_data,
              caption: caption.trim(),
              created_by: actor,
              latitude: target?.latitude ?? null,
              longitude: target?.longitude ?? null,
            });
            setCaption('');
            form.reset();
            onChanged?.();
          } catch (err) {
            setError(err instanceof Error ? err.message : 'Yüklenemedi');
          } finally {
            setBusy(false);
          }
        }}
      >
        <p className={`text-sm font-extrabold ${tone === 'dark' ? 'text-white' : 'text-mint-900'}`}>Hikaye paylaş</p>
        <p className={`text-[11px] ${muted}`}>
          {actor === 'admin'
            ? 'Görsel ve açıklama burada yazılır. Kullanıcı hikayede yalnızca isim ve VIP logosunu görür. Yönetici hikayesi 1 yıl kalır.'
            : 'Dikey fotoğraf (9:16). Paylaşımın 1 gün sonra kaybolur; kullanıcıya 1 km içindeki hikayeler önce çıkar.'}
        </p>
        {actor === 'admin' && !company && companies.length > 0 ? (
          <select className={field} value={companyId} onChange={(event) => setCompanyId(event.target.value)}>
            {allowPlatform ? <option value="">QapLA (platform)</option> : null}
            {companies.map((item) => (
              <option key={item.id} value={item.id}>{item.name}</option>
            ))}
          </select>
        ) : null}
        <label className={`flex cursor-pointer items-center gap-2 rounded-2xl border border-dashed px-3 py-3 text-sm font-bold ${tone === 'dark' ? 'border-white/15 text-emerald-200' : 'border-mint-200 text-mint-700'}`}>
          <ImagePlus className="h-4 w-4" />
          Dikey fotoğraf seç
          <input name="story" type="file" accept="image/*" className="hidden" />
        </label>
        <input className={field} placeholder="Kısa yazı (isteğe bağlı)" value={caption} onChange={(event) => setCaption(event.target.value)} />
        {error ? <p className="text-xs text-red-400">{error}</p> : null}
        <button type="submit" disabled={busy} className={`flex w-full items-center justify-center rounded-2xl py-2.5 text-sm font-extrabold text-white disabled:opacity-50 ${tone === 'dark' ? 'bg-emerald-500' : 'bg-mint-500'}`}>
          {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : 'Hikayeyi yayınla'}
        </button>
      </form>

      <div className="space-y-2">
        {rows.length === 0 ? (
          <p className={`px-1 text-xs ${muted}`}>Aktif hikaye yok.</p>
        ) : rows.map((item) => (
          <article key={item.id} className={`flex items-center gap-2 ${card} !py-2`}>
            <img src={item.image_data} alt="" className="h-14 w-9 shrink-0 rounded-lg object-cover" />
            <div className="min-w-0 flex-1">
              <p className={`truncate text-xs font-bold ${tone === 'dark' ? 'text-white' : 'text-mint-900'}`}>{item.company_name}</p>
              <p className={`truncate text-[11px] ${muted}`}>{item.caption || 'Yazısız'}</p>
            </div>
            <button type="button" onClick={() => { void removeStory(item.id).then(() => onChanged?.()); }} className="rounded-lg p-2 text-red-400">
              <Trash2 className="h-4 w-4" />
            </button>
          </article>
        ))}
      </div>
    </div>
  );
}
