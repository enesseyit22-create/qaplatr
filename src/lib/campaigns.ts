export const CAMPAIGN_COOLDOWN_HOURS = 3;
export const CAMPAIGN_COOLDOWN_MS = CAMPAIGN_COOLDOWN_HOURS * 60 * 60 * 1000;
export const FREE_DAILY_CAMPAIGN_LIMIT = 1;

function startOfLocalDay(date = new Date()) {
  const start = new Date(date);
  start.setHours(0, 0, 0, 0);
  return start;
}

export function campaignsCreatedToday(campaigns: { company_id?: string; created_at?: string }[], companyId?: string) {
  const start = +startOfLocalDay();
  return campaigns.filter((item) => {
    if (companyId && item.company_id && item.company_id !== companyId) return false;
    const at = +new Date(item.created_at ?? '');
    return Number.isNaN(at) || at >= start;
  }).length;
}

export function dailyCampaignLimitReached(campaigns: { company_id?: string; created_at?: string }[], companyId?: string) {
  return campaignsCreatedToday(campaigns, companyId) >= FREE_DAILY_CAMPAIGN_LIMIT;
}

export type Company = {
  id: string;
  name: string;
  description: string;
  category: string;
  latitude: number;
  longitude: number;
  address: string;
  is_featured: boolean;
  phone?: string | null;
  email?: string | null;
  owner_email?: string | null;
  login_password?: string | null;
  logo_url?: string | null;
  cover_url?: string | null;
  whatsapp?: string | null;
  created_at: string;
};

export type AppUserRole = 'user' | 'merchant' | 'admin';

export type AppUser = {
  id: string;
  auth_user_id?: string | null;
  email: string;
  phone: string;
  first_name?: string | null;
  last_name?: string | null;
  full_name?: string | null;
  role: AppUserRole;
  company_id: string | null;
  city?: string | null;
  login_password?: string | null;
  created_at: string;
};

export type Campaign = {
  id: string;
  company_id: string;
  title: string;
  discount_rate: number;
  expiry_date: string;
  details: string;
  is_active: boolean;
  created_at: string;
  image_url?: string | null;
  duration_type?: 'date' | 'countdown';
  duration_hours?: number | null;
  stock?: number | null;
};

export type CampaignWithCompany = Campaign & {
  companies: Company;
};

export type UserRedemption = {
  id: string;
  user_id: string;
  campaign_id: string;
  redeemed_at: string;
};

export type RedemptionCode =
  | 'OK'
  | 'MISSING_USER'
  | 'NOT_FOUND'
  | 'INACTIVE'
  | 'EXPIRED'
  | 'ALREADY_REDEEMED'
  | 'COOLDOWN'
  | 'UNAUTHENTICATED'
  | 'FORBIDDEN'
  | 'LOCATION_REQUIRED'
  | 'TOO_FAR'
  | 'ERROR';

export type CampaignEligibility = {
  ok: boolean;
  can_redeem: boolean;
  code: RedemptionCode;
  message: string;
  already_redeemed: boolean;
  cooldown_active: boolean;
  cooldown_remaining_seconds: number;
  campaign_active: boolean;
  campaign_expired: boolean;
};

export type RedeemCampaignResult = {
  ok: boolean;
  code: RedemptionCode;
  message: string;
  cooldown_remaining_seconds: number;
  redemption: UserRedemption | null;
};
