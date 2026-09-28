const STORAGE_KEY = 'qapla_consumer_id';

export function getConsumerId(): string {
  try {
    let id = localStorage.getItem(STORAGE_KEY);
    if (!id) {
      id = 'c_' + crypto.randomUUID().replace(/-/g, '').slice(0, 16);
      localStorage.setItem(STORAGE_KEY, id);
    }
    return id;
  } catch {
    return 'c_offline_' + crypto.randomUUID().replace(/-/g, '').slice(0, 10);
  }
}

export function generateCouponCode(): string {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  let code = '';
  for (let i = 0; i < 8; i++) {
    code += chars[Math.floor(Math.random() * chars.length)];
    if (i === 3) code += '-';
  }
  return code;
}

export function formatTimeRemaining(expiresAt: string): string {
  const diff = new Date(expiresAt).getTime() - Date.now();
  if (diff <= 0) return 'Süre doldu';
  const h = Math.floor(diff / 3600000);
  const m = Math.floor((diff % 3600000) / 60000);
  const s = Math.floor((diff % 60000) / 1000);
  if (h > 0) return `${h}s ${m}d ${s}sn`;
  return `${m}d ${s}sn`;
}

export function getMsRemaining(expiresAt: string | null | undefined): number {
  return Math.max(0, parseExpiryMs(expiresAt) - Date.now());
}

export function parseExpiryMs(expiresAt: string | null | undefined): number {
  const value = String(expiresAt ?? '').trim();
  if (!value) return 0;
  if (/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    return new Date(`${value}T23:59:59`).getTime();
  }
  const parsed = new Date(value).getTime();
  return Number.isFinite(parsed) ? parsed : 0;
}

export function formatDurationLeft(expiresAt: string | null | undefined): string {
  const diff = parseExpiryMs(expiresAt) - Date.now();
  if (diff <= 0) return 'Doldu';
  const days = Math.floor(diff / 86400000);
  const hours = Math.floor((diff % 86400000) / 3600000);
  const minutes = Math.floor((diff % 3600000) / 60000);
  if (days > 0) return `${days}g ${hours}sa`;
  if (hours > 0) return `${hours}sa ${minutes}dk`;
  return `${minutes}dk`;
}

export async function fileToDataUrl(file: File, maxSide = 720): Promise<string> {
  const raw = await file.arrayBuffer();
  const blob = new Blob([raw], { type: file.type || 'image/jpeg' });
  const url = URL.createObjectURL(blob);
  try {
    const image = await new Promise<HTMLImageElement>((resolve, reject) => {
      const img = new Image();
      img.onload = () => resolve(img);
      img.onerror = () => reject(new Error('Görsel okunamadı'));
      img.src = url;
    });
    const scale = Math.min(1, maxSide / Math.max(image.width, image.height));
    const canvas = document.createElement('canvas');
    canvas.width = Math.max(1, Math.round(image.width * scale));
    canvas.height = Math.max(1, Math.round(image.height * scale));
    const ctx = canvas.getContext('2d');
    if (!ctx) return url;
    ctx.drawImage(image, 0, 0, canvas.width, canvas.height);
    return canvas.toDataURL('image/jpeg', 0.72);
  } finally {
    URL.revokeObjectURL(url);
  }
}

export async function fileToJpegBlob(file: File, maxSide = 1080): Promise<Blob> {
  const raw = await file.arrayBuffer();
  const url = URL.createObjectURL(new Blob([raw], { type: file.type || 'image/jpeg' }));
  try {
    const image = await new Promise<HTMLImageElement>((resolve, reject) => {
      const img = new Image();
      img.onload = () => resolve(img);
      img.onerror = () => reject(new Error('Görsel okunamadı'));
      img.src = url;
    });
    const scale = Math.min(1, maxSide / Math.max(image.width, image.height));
    const canvas = document.createElement('canvas');
    canvas.width = Math.max(1, Math.round(image.width * scale));
    canvas.height = Math.max(1, Math.round(image.height * scale));
    const ctx = canvas.getContext('2d');
    if (!ctx) throw new Error('Görsel hazırlanamadı');
    ctx.drawImage(image, 0, 0, canvas.width, canvas.height);
    const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, 'image/jpeg', 0.72));
    if (!blob) throw new Error('Görsel hazırlanamadı');
    return blob;
  } finally {
    URL.revokeObjectURL(url);
  }
}
