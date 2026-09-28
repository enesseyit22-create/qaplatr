import { isSupabaseConfigured, supabase } from '@/lib/supabase';
import { fileToJpegBlob } from '@/lib/utils';

const BUCKET = 'company-images';

export async function uploadCompanyImage(companyId: string, file: File, kind: 'logo' | 'cover'): Promise<string> {
  try {
    if (!file.type.startsWith('image/')) throw new Error('Yalnızca görsel dosyası yükleyebilirsiniz.');
    const blob = await fileToJpegBlob(file, kind === 'logo' ? 512 : 1280);
    if (!isSupabaseConfigured) {
      return await new Promise<string>((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(String(reader.result ?? ''));
        reader.onerror = () => reject(new Error('Görsel okunamadı'));
        reader.readAsDataURL(blob);
      });
    }
    const path = `${companyId}/${kind}.jpg`;
    const uploaded = await supabase.storage.from(BUCKET).upload(path, blob, {
      contentType: 'image/jpeg',
      upsert: true,
    });
    if (uploaded.error) throw uploaded.error;
    const { data } = supabase.storage.from(BUCKET).getPublicUrl(path);
    if (!data.publicUrl) throw new Error('Görsel adresi alınamadı.');
    return `${data.publicUrl}?v=${Date.now()}`;
  } catch (err) {
    console.warn('Firma görseli yüklenemedi', { kind, companyId, err });
    const message = err instanceof Error ? err.message : 'Görsel yüklenemedi.';
    throw new Error(message);
  }
}
