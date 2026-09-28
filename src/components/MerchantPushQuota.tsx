import { useEffect, useState } from 'react';
import { Bell, Loader2 } from 'lucide-react';
import { requestPushDispatch } from '@/lib/companyPush';
import { planTierOf, weeklyPushLimit } from '@/lib/plans';
import { isSupabaseConfigured, supabase } from '@/lib/supabase';
import type { Company } from '@/lib/campaigns';

function weekStartIso() {
  const date = new Date();
  const offset = (date.getDay() + 6) % 7;
  date.setHours(0, 0, 0, 0);
  date.setDate(date.getDate() - offset);
  return date.toISOString();
}

export function MerchantPushQuota({ company }: { company: Company }) {
  const tier = planTierOf(company);
  const weeklyPush = weeklyPushLimit(company);
  const [used, setUsed] = useState(0);
  const [title, setTitle] = useState(company.name);
  const [body, setBody] = useState('Yakınındaki fırsatı gör.');
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const left = Math.max(weeklyPush - used, 0);

  useEffect(() => {
    let live = true;
    if (!isSupabaseConfigured) return () => { live = false; };
    void supabase
      .from('company_push_sends')
      .select('id', { count: 'exact', head: true })
      .eq('company_id', company.id)
      .gte('created_at', weekStartIso())
      .then(({ count, error: readError }) => {
        if (!live || readError || typeof count !== 'number') return;
        setUsed(count);
      });
    return () => { live = false; };
  }, [company.id]);

  const send = async () => {
    setBusy(true);
    setError(null);
    setNotice(null);
    try {
      const queued = await supabase.rpc('merchant_queue_nearby_push', {
        p_title: title.trim(),
        p_body: body.trim(),
      });
      if (queued.error) {
        const raw = queued.error.message.toLowerCase();
        if (raw.includes('merchant_queue_nearby_push') || raw.includes('schema cache')) {
          throw new Error('Bölgesel bildirim kuyruğu yok. 20260928180000_plans_verified_nearby_push.sql dosyasını çalıştırın.');
        }
        throw new Error(queued.error.message);
      }
      setUsed((value) => value + 1);
      void requestPushDispatch();
      setNotice('Bildirim yakın kullanıcılara kuyruğa alındı.');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Bildirim gönderilemedi.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <section className="space-y-2 rounded-3xl border border-mint-100 bg-white p-4">
      <p className="text-sm font-extrabold text-mint-800">Kalan Bildirim Hakkı</p>
      <p className="text-2xl font-extrabold text-slate-900">{left}</p>
      <p className="text-xs text-gray-400">
        {weeklyPush === 0
          ? 'Standard pakette bölgesel bildirim hakkı yok. Premium lansman 1299 TL/ay ile haftada 2 hak açılır.'
          : `${tier === 'premium' ? 'Premium' : 'Standard'} paket: bu hafta ${used}/${weeklyPush} kullanıldı. Gönderim 2 km içindeki kullanıcılara kuyruklanır.`}
      </p>
      {weeklyPush > 0 ? (
        <>
          <input
            value={title}
            onChange={(event) => setTitle(event.target.value)}
            maxLength={80}
            className="w-full rounded-2xl border border-mint-100 px-3 py-2 text-sm"
            placeholder="Başlık"
          />
          <textarea
            value={body}
            onChange={(event) => setBody(event.target.value)}
            maxLength={180}
            rows={2}
            className="w-full rounded-2xl border border-mint-100 px-3 py-2 text-sm"
            placeholder="Metin"
          />
          <button
            type="button"
            disabled={busy || left <= 0 || !title.trim() || !body.trim()}
            onClick={() => { void send(); }}
            className="inline-flex items-center gap-2 rounded-2xl bg-[#10241f] px-3 py-2 text-xs font-extrabold text-white disabled:opacity-50"
          >
            {busy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Bell className="h-3.5 w-3.5" />}
            Yakına gönder
          </button>
        </>
      ) : null}
      {notice ? <p className="text-xs font-semibold text-mint-700">{notice}</p> : null}
      {error ? <p className="text-xs text-red-600">{error}</p> : null}
    </section>
  );
}
