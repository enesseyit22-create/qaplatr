import type { CampaignWithCompany, Company } from '@/lib/campaigns';
import type { Merchant, OfferWithMerchant } from '@/lib/supabase';

export const CAMPAIGN_WINDOW_MS = 24 * 60 * 60 * 1000;

export function campaignWindowEnd(createdAt?: string | null) {
  const start = new Date(createdAt || '').getTime();
  if (!Number.isFinite(start)) return 0;
  return start + CAMPAIGN_WINDOW_MS;
}

export function campaignWindowOpen(createdAt?: string | null, now = Date.now()) {
  return campaignWindowEnd(createdAt) > now;
}

export function companyToMerchant(company: Company): Merchant {
  return {
    id: company.id,
    name: company.name,
    category: company.category,
    address: company.address,
    latitude: Number(company.latitude),
    longitude: Number(company.longitude),
    distance_m: 0,
    description: company.description,
    accent: company.is_featured ? '#1dc9a0' : '#72c9df',
    is_open: true,
    is_featured: company.is_featured,
    is_verified: Boolean(company.is_verified),
    plan_tier: company.plan_tier === 'premium' ? 'premium' : 'standard',
    created_at: company.created_at,
    phone: company.phone ?? null,
    whatsapp: company.whatsapp ?? null,
    image_url: company.logo_url ?? company.cover_url ?? null,
    logo_url: company.logo_url ?? null,
    cover_url: company.cover_url ?? null,
  };
}

export function campaignToOffer(campaign: CampaignWithCompany): OfferWithMerchant {
  const merchant = companyToMerchant(campaign.companies);
  const expiry = new Date(campaignWindowEnd(campaign.created_at)).toISOString();

  return {
    id: campaign.id,
    merchant_id: campaign.company_id,
    title: campaign.title,
    description: campaign.details?.trim() || campaign.companies.description,
    discount: Number(campaign.discount_rate) > 0 ? `%${Number(campaign.discount_rate)}` : 'Fırsat',
    category: campaign.companies.category,
    badge: campaign.companies.is_featured ? 'Öne çıkan' : 'Kampanya',
    expires_at: expiry,
    stock: Math.max(0, Number(campaign.stock ?? 1)),
    is_featured: campaign.companies.is_featured,
    is_active: campaign.is_active,
    created_at: campaign.created_at,
    image_url: campaign.image_url ?? null,
    qapla_merchants: merchant,
  };
}
