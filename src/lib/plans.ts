export type PlanTier = 'standard' | 'premium';

export const STORE_PRODUCTS = {
  standard: 'qapla.standard.monthly',
  premium: 'qapla.premium.monthly',
} as const;

export const NEARBY_PUSH_RADIUS_M = 2000;

export const PLAN_PRICES = {
  standard: 599,
  premium: 1599,
  premiumLaunch: 1299,
} as const;

export function planPriceLine(tier: PlanTier) {
  if (tier === 'premium') return `Premium ${PLAN_PRICES.premiumLaunch} TL/ay · normal ${PLAN_PRICES.premium} TL/ay`;
  return `Standard ${PLAN_PRICES.standard} TL/ay`;
}

const MATRIX = {
  standard: {
    dailyCampaigns: 1,
    dailyPosts: 1,
    weeklyPush: 0,
    vip: false,
    label: 'Standard',
    productId: STORE_PRODUCTS.standard,
  },
  premium: {
    dailyCampaigns: 5,
    dailyPosts: 5,
    weeklyPush: 2,
    vip: true,
    label: 'Premium',
    productId: STORE_PRODUCTS.premium,
  },
} as const;

export function planTierOf(row: { plan_tier?: string | null; is_featured?: boolean | null } | null | undefined): PlanTier {
  if (row?.plan_tier === 'premium') return 'premium';
  return 'standard';
}

export function planLimits(tier: PlanTier) {
  return MATRIX[tier];
}

export function weeklyPushLimit(row: { plan_tier?: string | null; is_featured?: boolean | null; push_quota_override?: number | null } | null | undefined) {
  const override = Number(row?.push_quota_override);
  if (Number.isFinite(override) && override >= 0 && row?.push_quota_override != null) return Math.min(52, Math.floor(override));
  return planLimits(planTierOf(row)).weeklyPush;
}

export function planFromProduct(productId: string): PlanTier | null {
  const id = productId.trim();
  if (id === STORE_PRODUCTS.premium) return 'premium';
  if (id === STORE_PRODUCTS.standard) return 'standard';
  return null;
}
