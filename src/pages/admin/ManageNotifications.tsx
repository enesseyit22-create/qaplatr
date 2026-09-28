import { useEffect, useState } from 'react';
import { Loader2, Pencil, Plus, Send, Trash2 } from 'lucide-react';
import {
  addAppNotice,
  deleteAllCompanyNotices,
  deleteAppNotice,
  deleteAppNoticesForCompany,
  refreshAppNotices,
  updateAppNotice,
  type AppNotice,
  type NoticeAudience,
} from '@/lib/notices';
import type { Company } from '@/lib/campaigns';

export function ManageNotifications({ companies = [] }: { companies?: Company[] }) {
  const [rows, setRows] = useState<AppNotice[]>([]);
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState<AppNotice | null>(null);
  const [creating, setCreating] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [firmFilter, setFirmFilter] = useState('');

  const reload = async () => {
    setLoading(true);
    try {
      setRows(await refreshAppNotices());
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void reload();
  }, []);

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between gap-2">
        <div>
          <p className="text-[10px] font-extrabold uppercase tracking-[0.16em] text-mint-600">Bildirimler</p>
          <h2 className="text-lg font-extrabold text-mint-900">Sistem bildirimleri</h2>
        </div>
        <button
          type="button"
          onClick={() => { setCreating(true); setEditing(null); }}
          className="inline-flex items-center gap-1 rounded-2xl bg-[#00A884] px-3 py-2 text-xs font-extrabold text-white"
        >
          <Plus className="h-3.5 w-3.5" /> Yeni
        </button>
      </div>
      {error ? (
        <p className={`rounded-2xl px-3 py-2 text-xs ${error.includes('kayda alındı') || error.includes('kaydedildi') ? 'bg-amber-50 text-amber-800' : 'bg-red-50 text-red-600'}`}>{error}</p>
      ) : null}
      <div className="flex flex-col gap-2 sm:flex-row">
        <select
          className="min-w-0 flex-1 rounded-2xl border border-mint-100 bg-white px-3 py-2 text-sm"
          value={firmFilter}
          onChange={(event) => setFirmFilter(event.target.value)}
        >
          <option value="">Tüm bildirimler</option>
          <option value="qapla">Yalnızca QapLA</option>
          <option value="companies">Tüm firmalar (eski + yeni)</option>
          {companies.map((item) => (
            <option key={item.id} value={item.id}>{item.name}</option>
          ))}
        </select>
        {firmFilter && firmFilter !== 'qapla' ? (
          <button
            type="button"
            disabled={busy}
            onClick={async () => {
              setBusy(true);
              setError(null);
              try {
                if (firmFilter === 'companies') await deleteAllCompanyNotices();
                else {
                  const firm = companies.find((item) => item.id === firmFilter);
                  await deleteAppNoticesForCompany(firmFilter, firm?.name);
                }
                await reload();
              } catch (err) {
                setError(err instanceof Error ? err.message : 'Silinemedi');
              } finally {
                setBusy(false);
              }
            }}
            className="inline-flex items-center justify-center gap-1 rounded-2xl bg-red-50 px-3 py-2 text-xs font-extrabold text-red-600 disabled:opacity-50"
          >
            <Trash2 className="h-3.5 w-3.5" /> Seçilenleri sil
          </button>
        ) : null}
      </div>
      {creating || editing ? (
        <NoticeEditor
          companies={companies}
          initial={editing}
          busy={busy}
          onCancel={() => { setCreating(false); setEditing(null); }}
          onSave={async (input) => {
            setBusy(true);
            setError(null);
            try {
              if (editing) await updateAppNotice(editing.id, input);
              else {
                const published = await addAppNotice(input);
                if (published.warning) setError(published.warning);
              }
              setCreating(false);
              setEditing(null);
              await reload();
            } catch (err) {
              const message = err instanceof Error ? err.message : 'Kaydedilemedi';
              console.error('Bildirim kaydedilemedi', message, err);
              setError(message);
            } finally {
              setBusy(false);
            }
          }}
        />
      ) : null}
      {loading ? (
        <div className="flex justify-center py-8"><Loader2 className="h-5 w-5 animate-spin text-mint-500" /></div>
      ) : rows.length === 0 ? (
        <p className="rounded-2xl bg-white px-4 py-8 text-center text-sm text-gray-400">Henüz bildirim yok.</p>
      ) : (
        <ul className="space-y-2">
          {rows.filter((item) => {
            if (!firmFilter) return true;
            if (firmFilter === 'qapla') return item.from_kind !== 'company' && !item.company_id;
            if (firmFilter === 'companies') return item.from_kind === 'company' || Boolean(item.company_id);
            const firm = companies.find((row) => row.id === firmFilter);
            const name = (firm?.name ?? '').toLocaleLowerCase('tr');
            return item.company_id === firmFilter
              || (name && item.from_name.trim().toLocaleLowerCase('tr') === name);
          }).map((item) => (
            <li key={item.id} className="rounded-2xl border border-mint-100 bg-white p-3 shadow-sm">
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0">
                  <p className="text-sm font-extrabold text-mint-900">{item.title}</p>
                  <p className="mt-0.5 line-clamp-2 text-xs text-gray-500">{item.body}</p>
                  <p className="mt-1 text-[10px] font-bold uppercase tracking-wide text-[#00A884]">
                    {item.audience === 'all' ? 'Tümü' : item.audience === 'guests' ? 'Misafirler' : item.audience === 'users' ? 'Kullanıcılar' : item.audience === 'admin' ? 'Yöneticiler' : 'Firmalar'}
                    {' · '}
                    {item.from_kind === 'company' || item.company_id
                      ? (companies.find((row) => row.id === item.company_id)?.name || item.from_name)
                      : 'QapLA'}
                    {' · '}
                    {new Date(item.created_at).toLocaleDateString('tr-TR')}
                  </p>
                </div>
                <div className="flex shrink-0 gap-1">
                  <button type="button" onClick={() => { setEditing(item); setCreating(false); }} className="rounded-xl bg-mint-50 p-2 text-mint-700">
                    <Pencil className="h-3.5 w-3.5" />
                  </button>
                  <button
                    type="button"
                    onClick={async () => {
                      setBusy(true);
                      try {
                        await deleteAppNotice(item.id);
                        await reload();
                      } catch (err) {
                        setError(err instanceof Error ? err.message : 'Silinemedi');
                      } finally {
                        setBusy(false);
                      }
                    }}
                    className="rounded-xl bg-red-50 p-2 text-red-500"
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </button>
                </div>
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function NoticeEditor({
  companies,
  initial,
  busy,
  onCancel,
  onSave,
}: {
  companies: Company[];
  initial: AppNotice | null;
  busy: boolean;
  onCancel: () => void;
  onSave: (input: { title: string; body: string; audience: NoticeAudience; from_kind: 'admin' | 'company'; from_name: string; company_id: string | null }) => void;
}) {
  const [title, setTitle] = useState(initial?.title ?? '');
  const [body, setBody] = useState(initial?.body ?? '');
  const [audience, setAudience] = useState<NoticeAudience>(initial?.audience ?? 'all');
  const [asCompany, setAsCompany] = useState(initial?.company_id ?? '');
  const firm = companies.find((item) => item.id === asCompany);

  return (
    <form
      className="space-y-2 rounded-2xl border border-mint-100 bg-white p-3 shadow-sm"
      onSubmit={(event) => {
        event.preventDefault();
        if (!title.trim() || !body.trim()) return;
        const companyId = asCompany || null;
        onSave({
          title: title.trim(),
          body: body.trim(),
          audience,
          from_kind: companyId ? 'company' : 'admin',
          from_name: companyId ? (firm?.name ?? 'QapLA') : 'QapLA',
          company_id: companyId,
        });
      }}
    >
      <div className="grid grid-cols-4 gap-1.5">
        {([['all', 'Tümü'], ['guests', 'Misafir'], ['users', 'Kullanıcı'], ['merchants', 'Firma']] as const).map(([id, label]) => (
          <button
            key={id}
            type="button"
            onClick={() => { setAudience(id); if (id !== 'merchants') setAsCompany(''); }}
            className={`rounded-2xl px-2 py-2 text-[11px] font-extrabold ${audience === id ? 'bg-[#00A884] text-white' : 'bg-mint-50 text-mint-700'}`}
          >
            {label}
          </button>
        ))}
      </div>
      <select className="w-full rounded-2xl border border-mint-100 px-3 py-2 text-sm" value={asCompany} onChange={(e) => setAsCompany(e.target.value)}>
        <option value="">Gönderen: QapLA</option>
        {companies.map((item) => <option key={item.id} value={item.id}>Gönderen: {item.name}</option>)}
      </select>
      {audience === 'all' ? (
        <p className="text-[10px] text-gray-400">Tümü; misafir, kullanıcı ve firmaya ayrı bildirim olarak gider.</p>
      ) : null}
      {audience === 'merchants' && !asCompany ? (
        <p className="text-[10px] text-gray-400">Firma seçmezsen bildirim tüm işletmelere gider.</p>
      ) : null}
      <input className="w-full rounded-2xl border border-mint-100 px-3 py-2 text-sm" placeholder="Başlık" value={title} onChange={(e) => setTitle(e.target.value)} />
      <textarea className="min-h-[5rem] w-full resize-none rounded-2xl border border-mint-100 px-3 py-2 text-sm" placeholder="İçerik" value={body} onChange={(e) => setBody(e.target.value)} />
      <div className="flex gap-2">
        <button type="button" onClick={onCancel} className="flex-1 rounded-2xl bg-cream-100 py-2.5 text-xs font-extrabold text-mint-800">Vazgeç</button>
        <button type="submit" disabled={busy} className="flex flex-1 items-center justify-center gap-1 rounded-2xl bg-[#00A884] py-2.5 text-xs font-extrabold text-white disabled:opacity-50">
          {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-3.5 w-3.5" />}
          {initial ? 'Güncelle' : 'Yayınla'}
        </button>
      </div>
    </form>
  );
}
