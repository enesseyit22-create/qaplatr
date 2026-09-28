import { assertCouponGpsNearMerchant } from '@/lib/couponLocation';
import { hasValidCoords } from '@/lib/geo';
import { isSupabaseConfigured, supabase } from '@/lib/supabase';
import { loadMyProfile } from '@/lib/auth';
import { attachCompanies, decrementCampaignStockAction, listAdminCampaigns, listAdminCompanies } from '@/lib/actions/admin';
import {
  CAMPAIGN_COOLDOWN_MS,
  type CampaignEligibility,
  type CampaignWithCompany,
  type Company,
  type RedeemCampaignResult,
  type RedemptionCode,
  type UserRedemption,
} from '@/lib/campaigns';

async function currentUserId(): Promise<string | null> {
  if (!isSupabaseConfigured) {
    try {
      const raw = localStorage.getItem('qapla_local_auth_session');
      if (!raw) return null;
      const parsed = JSON.parse(raw) as { id?: string };
      return parsed.id ?? null;
    } catch {
      return null;
    }
  }
  const { data } = await supabase.auth.getUser();
  return data.user?.id ?? null;
}

function merchantForbiddenEligibility(): CampaignEligibility {
  return {
    ok: false,
    can_redeem: false,
    code: 'FORBIDDEN',
    message: 'İşletme hesapları kupon alamaz. Yalnızca kendi kampanyalarınızı yönetebilirsiniz.',
    already_redeemed: false,
    cooldown_active: false,
    cooldown_remaining_seconds: 0,
    campaign_active: true,
    campaign_expired: false,
  };
}

function unauthenticatedEligibility(): CampaignEligibility {
  return {
    ok: false,
    can_redeem: false,
    code: 'UNAUTHENTICATED',
    message: 'Fırsatı kullanmak için giriş yapın veya üye olun.',
    already_redeemed: false,
    cooldown_active: false,
    cooldown_remaining_seconds: 0,
    campaign_active: true,
    campaign_expired: false,
  };
}

const LOCAL_REDEMPTIONS_KEY = 'qapla_user_redemptions';

function asCode(value: unknown): RedemptionCode {
  const allowed: RedemptionCode[] = [
    'OK',
    'MISSING_USER',
    'NOT_FOUND',
    'INACTIVE',
    'EXPIRED',
    'ALREADY_REDEEMED',
    'COOLDOWN',
    'UNAUTHENTICATED',
    'FORBIDDEN',
    'LOCATION_REQUIRED',
    'TOO_FAR',
    'ERROR',
  ];
  return allowed.includes(value as RedemptionCode) ? (value as RedemptionCode) : 'ERROR';
}

function readLocalRedemptions(): UserRedemption[] {
  try {
    const raw = localStorage.getItem(LOCAL_REDEMPTIONS_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as UserRedemption[];
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function writeLocalRedemption(row: UserRedemption) {
  const next = [row, ...readLocalRedemptions().filter((item) => item.id !== row.id)];
  localStorage.setItem(LOCAL_REDEMPTIONS_KEY, JSON.stringify(next));
}

function localEligibility(campaignId: string, userId: string): CampaignEligibility {
  if (!userId || userId.length < 8) {
    return {
      ok: false,
      can_redeem: false,
      code: 'MISSING_USER',
      message: 'Kullanıcı kimliği gerekli.',
      already_redeemed: false,
      cooldown_active: false,
      cooldown_remaining_seconds: 0,
      campaign_active: true,
      campaign_expired: false,
    };
  }

  const mine = readLocalRedemptions().filter((row) => row.user_id === userId);
  const already = mine.some((row) => row.campaign_id === campaignId);
  const last = mine.reduce<number>((latest, row) => {
    const ts = new Date(row.redeemed_at).getTime();
    return Number.isFinite(ts) ? Math.max(latest, ts) : latest;
  }, 0);
  const remainingMs = last ? Math.max(0, last + CAMPAIGN_COOLDOWN_MS - Date.now()) : 0;
  const cooldownSeconds = Math.ceil(remainingMs / 1000);

  if (already) {
    return {
      ok: true,
      can_redeem: false,
      code: 'ALREADY_REDEEMED',
      message: 'Bu kampanyadan yalnızca bir kez yararlanabilirsiniz.',
      already_redeemed: true,
      cooldown_active: cooldownSeconds > 0,
      cooldown_remaining_seconds: cooldownSeconds,
      campaign_active: true,
      campaign_expired: false,
    };
  }

  if (cooldownSeconds > 0) {
    return {
      ok: true,
      can_redeem: false,
      code: 'COOLDOWN',
      message: 'Son kullanımdan sonra 3 saat boyunca başka kampanya kullanamazsınız.',
      already_redeemed: false,
      cooldown_active: true,
      cooldown_remaining_seconds: cooldownSeconds,
      campaign_active: true,
      campaign_expired: false,
    };
  }

  return {
    ok: true,
    can_redeem: true,
    code: 'OK',
    message: 'Kampanya kullanılabilir.',
    already_redeemed: false,
    cooldown_active: false,
    cooldown_remaining_seconds: 0,
    campaign_active: true,
    campaign_expired: false,
  };
}

export async function listCompaniesAction(): Promise<Company[]> {
  return listAdminCompanies();
}

export async function listCampaignsAction(): Promise<CampaignWithCompany[]> {
  const [companies, campaigns] = await Promise.all([
    listAdminCompanies(),
    listAdminCampaigns(),
  ]);
  return attachCompanies(
    campaigns.filter((item) => item.is_active),
    companies,
  );
}

export async function checkCampaignEligibilityAction(
  campaignId: string,
): Promise<CampaignEligibility> {
  const userId = await currentUserId();
  if (!userId) {
    return unauthenticatedEligibility();
  }

  const profile = await loadMyProfile();
  if (profile?.role === 'merchant') {
    return merchantForbiddenEligibility();
  }
  if (profile?.role === 'admin') {
    return {
      ok: true,
      can_redeem: true,
      code: 'OK',
      message: 'Yönetici deneme kuponu alınabilir.',
      already_redeemed: false,
      cooldown_active: false,
      cooldown_remaining_seconds: 0,
      campaign_active: true,
      campaign_expired: false,
    };
  }

  if (!isSupabaseConfigured || campaignId.startsWith('demo-')) {
    return localEligibility(campaignId, userId);
  }

  const { data, error } = await supabase.rpc('check_campaign_eligibility', {
    p_campaign_id: campaignId,
    p_user_id: userId,
  });
  if (error) {
    return {
      ...unauthenticatedEligibility(),
      code: 'ERROR',
      message: error.message,
    };
  }

  const payload = (data ?? {}) as Partial<CampaignEligibility>;
  if (asCode(payload.code) === 'NOT_FOUND') {
    return localEligibility(campaignId, userId);
  }
  return {
    ok: Boolean(payload.ok),
    can_redeem: Boolean(payload.can_redeem),
    code: asCode(payload.code),
    message: payload.message ?? 'Kampanya durumu alınamadı.',
    already_redeemed: Boolean(payload.already_redeemed),
    cooldown_active: Boolean(payload.cooldown_active),
    cooldown_remaining_seconds: Number(payload.cooldown_remaining_seconds ?? 0),
    campaign_active: Boolean(payload.campaign_active),
    campaign_expired: Boolean(payload.campaign_expired),
  };
}

function gpsFailResult(code: RedemptionCode, message: string): RedeemCampaignResult {
  return {
    ok: false,
    code,
    message,
    cooldown_remaining_seconds: 0,
    redemption: null,
  };
}

async function resolveMerchantPin(
  campaignId: string,
  merchantPin?: { latitude: number; longitude: number } | null,
) {
  if (merchantPin && hasValidCoords(merchantPin)) return merchantPin;
  const campaigns = await listCampaignsAction();
  const found = campaigns.find((item) => item.id === campaignId)?.companies;
  if (found && hasValidCoords(found)) {
    return { latitude: found.latitude, longitude: found.longitude };
  }
  return null;
}

export async function redeemCampaignAction(
  campaignId: string,
  merchantPin?: { latitude: number; longitude: number } | null,
): Promise<RedeemCampaignResult> {
  const userId = await currentUserId();
  if (!userId) {
    return {
      ok: false,
      code: 'UNAUTHENTICATED',
      message: 'Fırsatı kullanmak için giriş yapın veya üye olun.',
      cooldown_remaining_seconds: 0,
      redemption: null,
    };
  }

  const profile = await loadMyProfile();
  if (profile?.role === 'merchant') {
    return {
      ok: false,
      code: 'FORBIDDEN',
      message: merchantForbiddenEligibility().message,
      cooldown_remaining_seconds: 0,
      redemption: null,
    };
  }

  const eligibility = await checkCampaignEligibilityAction(campaignId);
  if (!eligibility.can_redeem) {
    return {
      ok: false,
      code: eligibility.code,
      message: eligibility.message,
      cooldown_remaining_seconds: eligibility.cooldown_remaining_seconds,
      redemption: null,
    };
  }

  if (profile?.role !== 'admin') {
    const pin = await resolveMerchantPin(campaignId, merchantPin);
    if (!pin) {
      return gpsFailResult('ERROR', 'İşletme harita konumu henüz tanımlı değil.');
    }
    const geo = await assertCouponGpsNearMerchant(pin.latitude, pin.longitude);
    if (!geo.ok) {
      return gpsFailResult(geo.code, geo.message);
    }
  }

  if (!isSupabaseConfigured || campaignId.startsWith('demo-') || profile?.role === 'admin') {
    const redemption: UserRedemption = {
      id: crypto.randomUUID(),
      user_id: userId,
      campaign_id: campaignId,
      redeemed_at: new Date().toISOString(),
    };
    writeLocalRedemption(redemption);
    await decrementCampaignStockAction(campaignId);
    return {
      ok: true,
      code: 'OK',
      message: profile?.role === 'admin' ? 'Deneme kuponu oluşturuldu.' : 'Kampanya kullanıldı.',
      cooldown_remaining_seconds: 0,
      redemption,
    };
  }

  const { data, error } = await supabase.rpc('redeem_campaign', {
    p_campaign_id: campaignId,
    p_user_id: userId,
  });
  if (error) {
    return {
      ok: false,
      code: 'ERROR',
      message: error.message,
      cooldown_remaining_seconds: 0,
      redemption: null,
    };
  }

  const payload = (data ?? {}) as Partial<RedeemCampaignResult>;
  if (asCode(payload.code) === 'NOT_FOUND') {
    const redemption: UserRedemption = {
      id: crypto.randomUUID(),
      user_id: userId,
      campaign_id: campaignId,
      redeemed_at: new Date().toISOString(),
    };
    writeLocalRedemption(redemption);
    await decrementCampaignStockAction(campaignId);
    return {
      ok: true,
      code: 'OK',
      message: 'Kampanya kullanıldı.',
      cooldown_remaining_seconds: 0,
      redemption,
    };
  }

  if (payload.ok) {
    await decrementCampaignStockAction(campaignId);
  }

  return {
    ok: Boolean(payload.ok),
    code: asCode(payload.code),
    message: payload.message ?? 'Kampanya kullanılamadı.',
    cooldown_remaining_seconds: Number(payload.cooldown_remaining_seconds ?? 0),
    redemption: payload.redemption ?? null,
  };
}

export async function listUserRedemptionsAction(): Promise<UserRedemption[]> {
  const userId = await currentUserId();
  if (!userId) return [];

  if (!isSupabaseConfigured) {
    return readLocalRedemptions().filter((row) => row.user_id === userId);
  }

  const { data, error } = await supabase.rpc('list_user_redemptions', {
    p_user_id: userId,
  });
  if (error) throw error;
  return (data as UserRedemption[]) ?? [];
}

export function formatCooldown(seconds: number): string {
  const safe = Math.max(0, seconds);
  const h = Math.floor(safe / 3600);
  const m = Math.floor((safe % 3600) / 60);
  if (h > 0) return `${h} saat ${m} dk`;
  if (m > 0) return `${m} dk`;
  return `${safe} sn`;
}
