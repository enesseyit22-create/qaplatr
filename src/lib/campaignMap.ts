import type { CampaignWithCompany, Company } from '@/lib/campaigns';
import type { Merchant, OfferWithMerchant } from '@/lib/supabase';

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
  const expiry = campaign.expiry_date.includes('T')
    ? campaign.expiry_date
    : `${campaign.expiry_date}T23:59:59.000Z`;

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
