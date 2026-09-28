import type { Campaign, Company } from '@/lib/campaigns';
import { campaignToOffer, campaignWindowOpen, companyToMerchant } from '@/lib/campaignMap';
import { hasValidCoords } from '@/lib/geo';
import { isSupabaseConfigured, supabase, type Merchant, type OfferWithMerchant } from '@/lib/supabase';
import type { RealtimeChannel } from '@supabase/supabase-js';

export type CampaignChange = {
  eventType: 'INSERT' | 'UPDATE' | 'DELETE';
  row: Record<string, unknown> | null;
  previous: Record<string, unknown> | null;
};

function recordId(row: Record<string, unknown> | null | undefined) {
  return String(row?.id ?? '').trim();
}

function asCampaign(row: Record<string, unknown> | null | undefined): Campaign | null {
  const id = recordId(row);
  const companyId = String(row?.company_id ?? '').trim();
  if (!row || !id || !companyId) return null;
  return {
    id,
    company_id: companyId,
    title: String(row.title ?? ''),
    discount_rate: Number(row.discount_rate ?? 0),
    expiry_date: String(row.expiry_date ?? ''),
    details: String(row.details ?? ''),
    is_active: row.is_active !== false,
    created_at: String(row.created_at ?? new Date().toISOString()),
    image_url: (row.image_url as string | null) ?? null,
    duration_type: row.duration_type === 'countdown' ? 'countdown' : 'date',
    duration_hours: row.duration_hours == null ? null : Number(row.duration_hours),
    stock: row.stock == null ? null : Number(row.stock),
  };
}

function stillVisible(campaign: Campaign) {
  if (!campaign.is_active) return false;
  return campaignWindowOpen(campaign.created_at);
}

function merchantCompany(merchant: Merchant): Company {
  return {
    id: merchant.id,
    name: merchant.name,
    description: merchant.description,
    category: merchant.category,
    latitude: merchant.latitude,
    longitude: merchant.longitude,
    address: merchant.address,
    is_featured: Boolean(merchant.is_featured),
    phone: merchant.phone ?? null,
    logo_url: merchant.logo_url ?? null,
    cover_url: merchant.cover_url ?? null,
    whatsapp: merchant.whatsapp ?? null,
    created_at: merchant.created_at,
  };
}

export function applyCampaignList(list: Campaign[], change: CampaignChange): Campaign[] {
  const id = recordId(change.previous) || recordId(change.row);
  if (!id) return list;
  if (change.eventType === 'DELETE') return list.filter((item) => item.id !== id);
  const next = asCampaign(change.row);
  if (!next) return list;
  const previous = list.find((item) => item.id === id);
  const merged: Campaign = { ...previous, ...next, id };
  return [merged, ...list.filter((item) => item.id !== id)];
}

export function applyCampaignOffers(
  offers: OfferWithMerchant[],
  merchants: Merchant[],
  change: CampaignChange,
): OfferWithMerchant[] {
  const id = recordId(change.previous) || recordId(change.row);
  if (!id) return offers;
  if (change.eventType === 'DELETE') return offers.filter((item) => item.id !== id);
  const campaign = asCampaign(change.row);
  if (!campaign || !stillVisible(campaign)) return offers.filter((item) => item.id !== id);
  const current = offers.find((item) => item.id === campaign.id);
  const merchant = merchants.find((item) => item.id === campaign.company_id);
  const company = merchant
    ? merchantCompany(merchant)
    : current?.qapla_merchants
      ? merchantCompany(current.qapla_merchants)
      : null;
  if (!company || company.id !== campaign.company_id) return offers.filter((item) => item.id !== campaign.id);
  const next = campaignToOffer({ ...campaign, companies: company });
  return [next, ...offers.filter((item) => item.id !== next.id)];
}

export function merchantFromCompanyRow(row: Record<string, unknown> | null | undefined): Merchant | null {
  const id = String(row?.id ?? '').trim();
  if (!row || !id || id.startsWith('demo-')) return null;
  const merchant = companyToMerchant({
    id,
    name: String(row.name ?? ''),
    description: String(row.description ?? ''),
    category: String(row.category ?? ''),
    latitude: Number(row.latitude),
    longitude: Number(row.longitude),
    address: String(row.address ?? ''),
    is_featured: Boolean(row.is_featured),
    is_verified: Boolean(row.is_verified),
    plan_tier: row.plan_tier === 'premium' ? 'premium' : 'standard',
    phone: (row.phone as string | null) ?? null,
    logo_url: (row.logo_url as string | null) ?? null,
    cover_url: (row.cover_url as string | null) ?? null,
    whatsapp: (row.whatsapp as string | null) ?? null,
    created_at: String(row.created_at ?? new Date().toISOString()),
  });
  return hasValidCoords(merchant) ? merchant : null;
}

export function applyCompanyToCatalog(
  merchants: Merchant[],
  offers: OfferWithMerchant[],
  change: { eventType: string; new: Record<string, unknown> | null; old: Record<string, unknown> | null },
) {
  const id = String(change.old?.id ?? change.new?.id ?? '').trim();
  if (!id) return { merchants, offers };
  if (change.eventType === 'DELETE') {
    return {
      merchants: merchants.filter((item) => item.id !== id),
      offers: offers.filter((item) => item.merchant_id !== id),
    };
  }
  const merchant = merchantFromCompanyRow(change.new);
  if (!merchant) {
    return {
      merchants: merchants.filter((item) => item.id !== id),
      offers: offers.filter((item) => item.merchant_id !== id),
    };
  }
  const previous = merchants.find((item) => item.id === id);
  const nextMerchant = { ...merchant, distance_m: previous?.distance_m ?? merchant.distance_m };
  return {
    merchants: [nextMerchant, ...merchants.filter((item) => item.id !== id)],
    offers: offers.map((item) => (
      item.merchant_id === id
        ? {
          ...item,
          category: nextMerchant.category,
          is_featured: Boolean(nextMerchant.is_featured),
          qapla_merchants: { ...item.qapla_merchants, ...nextMerchant },
        }
        : item
    )),
  };
}

export function subscribeCampaignTable(onChange: (change: CampaignChange) => void) {
  if (!isSupabaseConfigured) return () => {};

  let retry: number | null = null;
  let stopped = false;
  let generation = 0;
  let channel: RealtimeChannel | null = null;

  const start = () => {
    if (stopped) return;
    if (retry) {
      window.clearTimeout(retry);
      retry = null;
    }
    const token = ++generation;
    const previous = channel;
    channel = supabase.channel(`campaigns-live:${crypto.randomUUID()}`);
    for (const eventType of ['INSERT', 'UPDATE', 'DELETE'] as const) {
      channel.on(
        'postgres_changes',
        { event: eventType as '*', schema: 'public', table: 'campaigns' },
        (payload) => {
          if (stopped || token !== generation) return;
          onChange({
            eventType,
            row: (payload.new as Record<string, unknown> | null) ?? null,
            previous: (payload.old as Record<string, unknown> | null) ?? null,
          });
        },
      );
    }
    void channel.subscribe((status) => {
      if (stopped || token !== generation) return;
      if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT') {
        console.error('Kampanya canlı dinleyici koptu', status);
        if (retry) window.clearTimeout(retry);
        retry = window.setTimeout(start, 1800);
      }
    });
    if (previous) void supabase.removeChannel(previous);
  };

  start();

  return () => {
    stopped = true;
    if (retry) window.clearTimeout(retry);
    if (channel) void supabase.removeChannel(channel);
    channel = null;
  };
}
