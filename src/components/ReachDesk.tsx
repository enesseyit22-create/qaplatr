import { useState } from 'react';
import { REACH_FIELDS, normalizeReach, saveReach, useReach, type ReachKey } from '@/lib/reach';

const kmText = (value: number) => value.toLocaleString('tr-TR');

export function ReachDesk() {
  const reach = useReach();
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState<{ id: ReachKey; km: number } | null>(null);

  const write = async (id: ReachKey, input: HTMLInputElement) => {
    const raw = input.value.trim().replace(',', '.');
    const value = Number(raw);
    if (!raw || !Number.isFinite(value)) {
      input.value = kmText(reach[id]);
      setSaved(null);
      setError('Kilometre için sayı girin.');
      return;
    }
    const next = normalizeReach({ ...reach, [id]: value });
    if (next[id] === reach[id]) {
      input.value = kmText(reach[id]);
      return;
    }
    setError(null);
    setSaved(null);
    try {
      await saveReach(next);
      setSaved({ id, km: next[id] });
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Mesafe kaydedilemedi');
    }
  };

  const savedLabel = saved ? REACH_FIELDS.find((field) => field.id === saved.id)?.label : null;

  return (
    <section className="rounded-3xl border border-mint-100 bg-white p-3">
      <p className="text-sm font-extrabold text-mint-900">Bölge mesafesi</p>
      <p className="mt-1 text-[11px] leading-snug text-slate-500">Kilometre tüm bölgelerde geçerlidir. Kayıt, açık ekranlara anında yansır.</p>
      <div className="mt-3 space-y-2">
        {REACH_FIELDS.map((field) => (
          <label key={field.id} className="flex items-center justify-between gap-3">
            <span>
              <span className="block text-xs font-extrabold text-slate-800">{field.label}</span>
              <span className="block text-[10px] text-slate-400">{field.hint}</span>
            </span>
            <span className="flex items-center gap-1 text-[11px] font-bold text-slate-500">
              <input
                key={`${field.id}-${reach[field.id]}`}
                defaultValue={kmText(reach[field.id])}
                inputMode="decimal"
                enterKeyHint="done"
                className="w-16 rounded-xl border border-mint-100 px-2 py-1 text-right text-sm font-extrabold text-mint-800"
                onKeyDown={(event) => { if (event.key === 'Enter') event.currentTarget.blur(); }}
                onBlur={(event) => { void write(field.id, event.currentTarget); }}
              />
              km
            </span>
          </label>
        ))}
      </div>
      {error ? <p className="mt-2 rounded-2xl bg-red-50 px-3 py-2 text-xs text-red-600">{error}</p> : null}
      {saved && savedLabel ? (
        <p role="status" className="mt-2 rounded-2xl bg-mint-50 px-3 py-2 text-xs font-bold text-mint-700">
          {savedLabel} mesafesi {kmText(saved.km)} km olarak kaydedildi.
        </p>
      ) : null}
    </section>
  );
}
