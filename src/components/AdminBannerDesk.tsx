import { useEffect, useState } from 'react';
import { ImagePlus, Loader2, Pencil, Trash2 } from 'lucide-react';
import { listAdminCompanies } from '@/lib/actions/admin';
import type { Company } from '@/lib/campaigns';
import { deleteExploreBanner, saveExploreBanner, useExploreBanners, type ExploreBanner } from '@/lib/exploreBanners';
import { planTierOf } from '@/lib/plans';
import { VerifiedBadge } from '@/components/VerifiedBadge';

export function AdminBannerDesk() {
  const banners = useExploreBanners();
  const [editing, setEditing] = useState<ExploreBanner | null>(null);
  const [title, setTitle] = useState('');
  const [subtitle, setSubtitle] = useState('');
  const [active, setActive] = useState(true);
  const [file, setFile] = useState<File | null>(null);
  const [preview, setPreview] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const reset = () => {
    setEditing(null);
    setTitle('');
    setSubtitle('');
    setActive(true);
    setFile(null);
    setPreview(null);
  };

  const beginEdit = (row: ExploreBanner) => {
    setEditing(row);
    setTitle(row.title);
    setSubtitle(row.subtitle);
    setActive(row.is_active);
    setFile(null);
    setPreview(row.image_url);
    setError(null);
    setNotice(null);
  };

  return (
    <div className="space-y-3">
      <section className="rounded-3xl border border-mint-100 bg-white p-4">
        <p className="text-[11px] font-extrabold uppercase tracking-[0.14em] text-mint-600">Banner / Vitrin</p>
        <h2 className="mt-1 text-lg font-extrabold text-mint-900">{editing ? 'Bannerı güncelle' : 'Yeni banner'}</h2>
        <p className="mt-1 text-xs leading-relaxed text-slate-500">
          Kaydedilen görsel ve metin, Keşfet panelinin üstünde anında görünür.
        </p>
        <form
          className="mt-3 space-y-2"
          onSubmit={(event) => {
            event.preventDefault();
            setBusy(true);
            setError(null);
            setNotice(null);
            void saveExploreBanner({
              id: editing?.id,
              title,
              subtitle,
              image_url: editing?.image_url ?? null,
              file,
              is_active: active,
              sort_order: editing?.sort_order ?? 0,
            }).then(() => {
              setNotice(editing ? 'Banner güncellendi.' : 'Banner eklendi.');
              reset();
            }).catch((err: unknown) => {
              setError(err instanceof Error ? err.message : 'Banner kaydedilemedi.');
            }).finally(() => setBusy(false));
          }}
        >
          <input
            required
            value={title}
            onChange={(event) => setTitle(event.target.value)}
            placeholder="Başlık"
            className="w-full rounded-2xl border-2 border-mint-100 px-3 py-2.5 text-sm text-mint-900 outline-none focus:border-mint-400"
          />
          <textarea
            value={subtitle}
            onChange={(event) => setSubtitle(event.target.value)}
            placeholder="Kısa metin"
            className="min-h-[72px] w-full rounded-2xl border-2 border-mint-100 px-3 py-2.5 text-sm text-mint-900 outline-none focus:border-mint-400"
          />
          <label className="flex items-center gap-2 rounded-2xl border border-mint-100 px-3 py-2 text-xs font-semibold text-mint-700">
            <ImagePlus className="h-4 w-4" />
            Görsel {file ? 'seçildi' : '(isteğe bağlı)'}
            <input
              type="file"
              accept="image/*"
              className="hidden"
              onChange={(event) => {
                const next = event.target.files?.[0] ?? null;
                setFile(next);
                if (!next) return;
                const url = URL.createObjectURL(next);
                setPreview(url);
              }}
            />
          </label>
          {preview ? <img src={preview} alt="" className="h-28 w-full rounded-2xl object-cover" /> : null}
          <label className="flex items-center gap-2 text-xs font-semibold text-mint-700">
            <input type="checkbox" checked={active} onChange={(event) => setActive(event.target.checked)} />
            Keşfet’te göster
          </label>
          {error ? <p className="rounded-2xl bg-red-50 px-3 py-2 text-xs text-red-600">{error}</p> : null}
          {notice ? <p className="rounded-2xl bg-mint-50 px-3 py-2 text-xs text-mint-800">{notice}</p> : null}
          <div className="flex gap-2">
            <button type="submit" disabled={busy} className="btn-primary inline-flex flex-1 items-center justify-center gap-2 py-3 text-sm disabled:opacity-50">
              {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : (editing ? 'Güncelle' : 'Ekle')}
            </button>
            {editing ? (
              <button type="button" onClick={reset} className="rounded-2xl border border-mint-100 px-4 text-xs font-bold text-mint-700">
                Vazgeç
              </button>
            ) : null}
          </div>
        </form>
      </section>
      <ul className="space-y-2">
        {banners.length === 0 ? (
          <li className="rounded-3xl border border-dashed border-mint-100 bg-white px-4 py-5 text-center text-xs text-slate-400">
            Henüz banner yok. Eklenen ilk banner Keşfet’in üstündeki hazır alanı değiştirir.
          </li>
        ) : banners.map((row) => (
          <li key={row.id} className="flex items-center gap-3 rounded-3xl border border-mint-100 bg-white p-3">
            {row.image_url ? (
              <img src={row.image_url} alt="" className="h-14 w-14 shrink-0 rounded-2xl object-cover" />
            ) : (
              <span className="flex h-14 w-14 shrink-0 items-center justify-center rounded-2xl bg-mint-50 text-[10px] font-extrabold text-mint-700">Yazı</span>
            )}
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm font-extrabold text-mint-900">{row.title}</p>
              <p className="truncate text-[11px] text-slate-500">{row.subtitle || 'Metin yok'}</p>
              <p className="text-[10px] font-bold text-mint-600">{row.is_active ? 'Yayında' : 'Gizli'}</p>
            </div>
            <button type="button" onClick={() => beginEdit(row)} className="rounded-xl bg-mint-50 p-2 text-mint-700" aria-label="Düzenle">
              <Pencil className="h-4 w-4" />
            </button>
            <button
              type="button"
              onClick={() => {
                setBusy(true);
                setError(null);
                void deleteExploreBanner(row.id).then(() => {
                  if (editing?.id === row.id) reset();
                  setNotice('Banner silindi.');
                }).catch((err: unknown) => {
                  setError(err instanceof Error ? err.message : 'Banner silinemedi.');
                }).finally(() => setBusy(false));
              }}
              className="rounded-xl bg-red-50 p-2 text-red-600"
              aria-label="Sil"
            >
              <Trash2 className="h-4 w-4" />
            </button>
          </li>
        ))}
      </ul>
      <VipBannerPicker banners={banners} busy={busy} onError={setError} onNotice={setNotice} onBusy={setBusy} />
    </div>
  );
}

function VipBannerPicker({
  banners,
  busy,
  onError,
  onNotice,
  onBusy,
}: {
  banners: ExploreBanner[];
  busy: boolean;
  onError: (value: string | null) => void;
  onNotice: (value: string | null) => void;
  onBusy: (value: boolean) => void;
}) {
  const [companies, setCompanies] = useState<Company[]>([]);
  const [ready, setReady] = useState(false);
  useEffect(() => {
    let live = true;
    void listAdminCompanies().then((rows) => {
      if (!live) return;
      setCompanies(rows.filter((row) => planTierOf(row) === 'premium' || row.is_featured));
      setReady(true);
    }).catch(() => {
      if (!live) return;
      setCompanies([]);
      setReady(true);
    });
    return () => { live = false; };
  }, [banners.length]);

  return (
    <section className="rounded-3xl border border-mint-100 bg-white p-4">
      <p className="text-[11px] font-extrabold uppercase tracking-[0.14em] text-mint-600">VIP vitrin</p>
      <p className="mt-1 text-xs text-gray-400">Premium veya öne çıkan firmayı Keşfet banner’ına ekle ya da çıkar.</p>
      <ul className="mt-3 space-y-2">
        {ready && companies.length === 0 ? <li className="text-xs text-gray-400">Premium veya öne çıkan firma yok.</li> : null}
        {companies.map((company) => {
          const current = banners.find((row) => row.company_id === company.id);
          return (
            <li key={company.id} className="flex items-center justify-between gap-2">
              <span className="inline-flex min-w-0 items-center gap-1 truncate text-sm font-bold text-mint-900">{company.name}<VerifiedBadge verified={company.is_verified} /></span>
              <button
                type="button"
                disabled={busy}
                onClick={() => {
                  onError(null);
                  onNotice(null);
                  onBusy(true);
                  const job = current
                    ? deleteExploreBanner(current.id)
                    : saveExploreBanner({
                      title: company.name,
                      subtitle: company.category || 'Premium',
                      image_url: company.cover_url || company.logo_url || null,
                      is_active: true,
                      sort_order: banners.length,
                      company_id: company.id,
                    });
                  void job.then(() => {
                    onNotice(current ? 'Vitrinden çıkarıldı.' : 'Vitrine eklendi.');
                  }).catch((err: unknown) => {
                    onError(err instanceof Error ? err.message : 'Vitrin güncellenemedi.');
                  }).finally(() => onBusy(false));
                }}
                className="shrink-0 rounded-2xl bg-mint-500 px-3 py-1.5 text-[11px] font-extrabold text-white disabled:opacity-50"
              >
                {current ? 'Çıkar' : 'Vitrine ekle'}
              </button>
            </li>
          );
        })}
      </ul>
    </section>
  );
}
