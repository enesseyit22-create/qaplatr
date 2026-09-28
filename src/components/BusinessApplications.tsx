import { useState } from 'react';
import { Check, Loader2, X } from 'lucide-react';
import { type BusinessApplication } from '@/lib/businesses';

export function BusinessApplicationsPanel({
  rows,
  busy,
  onApprove,
  onReject,
}: {
  rows: BusinessApplication[];
  busy: boolean;
  onApprove: (row: BusinessApplication, pilot: boolean) => void;
  onReject: (row: BusinessApplication) => void;
}) {
  const [filter, setFilter] = useState<'pending' | 'all'>('pending');
  const [pilotIds, setPilotIds] = useState<Record<string, boolean>>({});
  const list = rows.filter((item) => filter === 'all' || item.status === 'pending');

  return (
    <div className="space-y-3">
      <div className="flex gap-1">
        {(['pending', 'all'] as const).map((id) => (
          <button
            key={id}
            type="button"
            onClick={() => setFilter(id)}
            className={`rounded-full px-3 py-1.5 text-[11px] font-extrabold ${filter === id ? 'bg-mint-600 text-white' : 'bg-white text-mint-700'}`}
          >
            {id === 'pending' ? 'Bekleyen' : 'Tümü'}
          </button>
        ))}
      </div>
      {list.length === 0 ? (
        <p className="rounded-2xl border border-mint-100 bg-white px-4 py-8 text-center text-sm text-gray-400">
          Bekleyen firma başvurusu yok.
        </p>
      ) : (
        list.map((row) => (
          <article key={row.id} className="rounded-3xl border border-mint-100 bg-white p-4">
            <div className="flex items-start justify-between gap-2">
              <div>
                <p className="text-sm font-extrabold text-mint-800">{row.company_name}</p>
                <p className="text-xs text-mint-600">{row.sector} · {row.district}</p>
              </div>
              <span className={`rounded-full px-2 py-0.5 text-[10px] font-extrabold ${
                row.status === 'approved' ? 'bg-mint-100 text-mint-700'
                  : row.status === 'rejected' ? 'bg-red-50 text-red-600'
                    : 'bg-amber-50 text-amber-700'
              }`}>
                {row.status === 'approved' ? 'Onaylı' : row.status === 'rejected' ? 'Red' : 'Bekliyor'}
              </span>
            </div>
            <p className="mt-2 text-xs text-gray-500">{row.owner_name} · {row.phone}</p>
            <p className="text-xs text-gray-500">{row.email}</p>
            <p className="mt-1 text-xs text-gray-500">{row.address}</p>
            <p className="mt-1 text-[11px] text-gray-400">{row.tax_office} · {row.tax_number}</p>
            {row.is_pilot_firm ? (
              <p className="mt-2 text-[11px] font-bold text-mint-700">Pilot firma · 2 ay ücretsiz</p>
            ) : null}
            {row.status === 'pending' ? (
              <div className="mt-3 space-y-2">
                <label className="flex items-start gap-2 rounded-2xl bg-mint-50 px-3 py-2 text-xs font-bold text-mint-800">
                  <input
                    type="checkbox"
                    className="mt-0.5"
                    checked={Boolean(pilotIds[row.id])}
                    onChange={(event) => setPilotIds((current) => ({ ...current, [row.id]: event.target.checked }))}
                  />
                  <span>
                    Pilot Firma (2 Ay Ücretsiz)
                    <span className="mt-0.5 block font-semibold text-mint-600">İşaretlenirse bitiş bugünden 60 gün sonrası olur. Bu sürede ödeme ekranı açılmaz.</span>
                  </span>
                </label>
              <div className="flex gap-2">
                <button
                  type="button"
                  disabled={busy}
                  onClick={() => onApprove(row, Boolean(pilotIds[row.id]))}
                  className="flex flex-1 items-center justify-center gap-1 rounded-2xl bg-mint-600 py-2.5 text-xs font-extrabold text-white disabled:opacity-50"
                >
                  {busy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Check className="h-3.5 w-3.5" />}
                  Onayla
                </button>
                <button
                  type="button"
                  disabled={busy}
                  onClick={() => onReject(row)}
                  className="flex flex-1 items-center justify-center gap-1 rounded-2xl bg-red-50 py-2.5 text-xs font-extrabold text-red-600 disabled:opacity-50"
                >
                  <X className="h-3.5 w-3.5" /> Reddet
                </button>
              </div>
              </div>
            ) : null}
          </article>
        ))
      )}
    </div>
  );
}
