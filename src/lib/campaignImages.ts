import { isSupabaseConfigured, supabase } from '@/lib/supabase';

const CAMPAIGN_IMAGE_BUCKET = 'campaign-images';

function errorBits(err: unknown) {
  const record = err && typeof err === 'object' ? err as Record<string, unknown> : {};
  const message = err instanceof Error ? err.message : typeof record.message === 'string' ? record.message : '';
  const details = typeof record.details === 'string' ? record.details : '';
  const hint = typeof record.hint === 'string' ? record.hint : '';
  const code = typeof record.code === 'string' ? record.code : '';
  const status = record.statusCode ?? record.status ?? '';
  return { message, details, code, status, raw: `${message} ${details} ${hint}`.toLowerCase() };
}

function imageFailureMessage(err: unknown) {
  const bits = errorBits(err);
  if (bits.raw.includes('bucket not found') || bits.raw.includes('bucket does not exist')) {
    return 'Kampanya görsel klasörü bulunamadı. 20260927160000_public_campaign_catalog.sql dosyasını çalıştırın.';
  }
  if (bits.raw.includes('row-level security') || bits.raw.includes('not authorized') || bits.code === '42501' || String(bits.status) === '403') {
    return 'Bu firma adına görsel yükleme izniniz yok. Onaylı firma hesabıyla tekrar deneyin.';
  }
  if (bits.raw.includes('too large') || bits.raw.includes('payload') || String(bits.status) === '413') {
    return 'Görsel çok büyük. Daha küçük bir fotoğraf seçin.';
  }
  const text = [bits.message, bits.details].map((part) => part.trim()).filter(Boolean).join(' ');
  return text || 'Kampanya görseli yüklenemedi.';
}

export async function publishCampaignImage(companyId: string, imageUrl: string | null | undefined): Promise<string | null> {
  const value = imageUrl?.trim() || '';
  if (!value) return null;
  if (!value.startsWith('data:')) return value;
  if (!isSupabaseConfigured || companyId.startsWith('demo-')) return value;

  try {
    const response = await fetch(value);
    const blob = await response.blob();
    if (blob.size > 5 * 1024 * 1024) {
      throw new Error('Görsel çok büyük. Daha küçük bir fotoğraf seçin.');
    }
    const path = `${companyId.toLowerCase()}/${crypto.randomUUID()}.jpg`;
    const uploaded = await supabase.storage.from(CAMPAIGN_IMAGE_BUCKET).upload(path, blob, {
      contentType: blob.type || 'image/jpeg',
      upsert: false,
    });
    if (uploaded.error) throw uploaded.error;
    const { data } = supabase.storage.from(CAMPAIGN_IMAGE_BUCKET).getPublicUrl(path);
    if (!data.publicUrl) throw new Error('Görsel adresi alınamadı.');
    return data.publicUrl;
  } catch (err) {
    console.warn('Kampanya görseli yüklenemedi', err);
    throw new Error(imageFailureMessage(err));
  }
}
