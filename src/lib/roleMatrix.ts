import type { AppUserRole } from '@/lib/campaigns';

export type RolePermission = {
  id: string;
  label: string;
  hint: string;
  roles: AppUserRole[];
};

export const ROLE_PERMISSIONS: RolePermission[] = [
  { id: 'explore', label: 'Harita ve keşif', hint: 'Yakındaki işletmeleri ve fırsatları görüntüle', roles: ['user', 'merchant', 'admin'] },
  { id: 'coupons', label: 'Kupon al / kullan', hint: 'Kampanyalardan kupon oluştur', roles: ['user', 'admin'] },
  { id: 'favorites', label: 'Favoriler', hint: 'İşletmeleri kaydet', roles: ['user', 'admin'] },
  { id: 'profile', label: 'Profil ve şifre', hint: 'Hesap bilgilerini ve şifreyi değiştir', roles: ['user', 'merchant', 'admin'] },
  { id: 'campaigns', label: 'Kampanya yönetimi', hint: 'Kampanya oluştur, stok ve indirim ayarla', roles: ['merchant', 'admin'] },
  { id: 'redeem', label: 'Kupon onaylama', hint: 'Müşteri kodunu işletmede doğrula', roles: ['merchant', 'admin'] },
  { id: 'reports', label: 'Firma raporları', hint: 'Kampanya ve kullanım özeti', roles: ['merchant', 'admin'] },
  { id: 'stories', label: 'Hikayeler', hint: 'Paylaşım ve firma yetkisi', roles: ['admin'] },
];

export const ROLE_LABELS: Record<AppUserRole, string> = {
  user: 'Kullanıcı',
  merchant: 'Firma',
  admin: 'Yönetici',
};

export const GUEST_PERMISSION_IDS = ['explore'] as const;

export function permissionsFor(role: AppUserRole | null | undefined, isGuest = false) {
  if (isGuest || !role) {
    return ROLE_PERMISSIONS
      .filter((item) => (GUEST_PERMISSION_IDS as readonly string[]).includes(item.id))
      .map((item) => ({ ...item, allowed: true }));
  }
  return ROLE_PERMISSIONS
    .filter((item) => item.roles.includes(role))
    .map((item) => ({ ...item, allowed: true }));
}
