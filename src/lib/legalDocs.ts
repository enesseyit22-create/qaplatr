import { useEffect, useState } from 'react';
import { isSupabaseConfigured, supabase } from '@/lib/supabase';
import { subscribeTables } from '@/lib/live';

const KEY = 'qapla_legal_docs';
const EVENT = 'qapla-legal';

export type LegalDocs = {
  privacy: string;
  terms: string;
  help: string;
};

export const DEFAULT_LEGAL: LegalDocs = {
  privacy:
    'QapLA, hesap e-postası, ad-soyad ve telefon gibi girdiğin bilgileri oturum ve profil için kullanır. Favoriler, yorumlar ve bildirim tercihleri bu cihazda saklanır. Konum yalnızca harita yakınlığını göstermek için kullanılır.',
  terms:
    'Uygulama yerel keşif ve kampanya kuponları sunar. Kupon stokları ve geçerlilik işletmeye bağlıdır. Hesabını başkasıyla paylaşma. Yanıltıcı yorum veya kötüye kullanım tespitinde oturum kapatılabilir.',
  help:
    'Keşfet haritasından işletme seç, kuponu al, işletmede göster. Favori için kalbe dokun. Destek için destek@qlaptr.com adresine konu, firma, e-posta ve telefonunla yaz.',
};

function emit(next: LegalDocs) {
  localStorage.setItem(KEY, JSON.stringify(next));
  window.dispatchEvent(new Event(EVENT));
}

export function readLegalDocs(): LegalDocs {
  try {
    return { ...DEFAULT_LEGAL, ...JSON.parse(localStorage.getItem(KEY) ?? '{}') };
  } catch {
    return DEFAULT_LEGAL;
  }
}

export async function refreshLegalDocs() {
  if (!isSupabaseConfigured) return readLegalDocs();
  const { data } = await supabase.from('app_live_settings').select('legal').eq('id', 'main').maybeSingle();
  const legal = data?.legal && typeof data.legal === 'object' ? data.legal as Partial<LegalDocs> : {};
  const next = { ...DEFAULT_LEGAL, ...legal };
  emit(next);
  return next;
}

export async function writeLegalDocs(next: LegalDocs) {
  emit(next);
  if (!isSupabaseConfigured) return;
  await supabase.from('app_live_settings').update({ legal: next }).eq('id', 'main');
}

export function useLegalDocs() {
  const [docs, setDocs] = useState(readLegalDocs);
  useEffect(() => {
    const sync = () => setDocs(readLegalDocs());
    void refreshLegalDocs();
    window.addEventListener(EVENT, sync);
    const stop = subscribeTables(['app_live_settings'], () => { void refreshLegalDocs(); });
    return () => {
      window.removeEventListener(EVENT, sync);
      stop();
    };
  }, []);
  return docs;
}
