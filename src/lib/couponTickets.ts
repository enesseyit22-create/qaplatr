import type { AppUser, Campaign, Company, UserRedemption } from '@/lib/campaigns';
import { readLocalClaims, writeLocalClaim } from '@/lib/demoData';
import { isSupabaseConfigured, supabase, type CouponClaim } from '@/lib/supabase';
import { getMsRemaining } from '@/lib/utils';

export type CouponInspect = {
  code: string;
  found: boolean;
  valid: boolean;
  status: string;
  issues: string[];
  companyName: string | null;
  companyId: string | null;
  campaignTitle: string | null;
  campaignId: string | null;
  holderName: string | null;
  holderEmail: string | null;
  holderPhone: string | null;
  createdAt: string | null;
  expiresAt: string | null;
};

export function normalizeCouponCode(code: string) {
  return code.replace(/[^a-zA-Z0-9]/g, '').toUpperCase();
}

function codesMatch(a: string, b: string) {
  return normalizeCouponCode(a) === normalizeCouponCode(b);
}

function personLabel(user?: AppUser | null) {
  if (!user) return null;
  const name = [user.first_name, user.last_name].filter(Boolean).join(' ').trim() || user.full_name?.trim();
  return name || user.email || null;
}

function emptyInspect(code: string, issues: string[]): CouponInspect {
  return {
    code,
    found: false,
    valid: false,
    status: 'missing',
    issues,
    companyName: null,
    companyId: null,
    campaignTitle: null,
    campaignId: null,
    holderName: null,
    holderEmail: null,
    holderPhone: null,
    createdAt: null,
    expiresAt: null,
  };
}

export async function saveCouponTicket(claim: CouponClaim) {
  writeLocalClaim(claim);
  if (!isSupabaseConfigured) return;
  try {
    await supabase.from('coupon_tickets').upsert({
      id: claim.id,
      code: normalizeCouponCode(claim.code),
      user_id: claim.consumer_id,
      campaign_id: claim.offer_id,
      company_id: claim.merchant_id ?? null,
      status: claim.status || 'active',
      expires_at: claim.expires_at,
      created_at: claim.created_at,
    }, { onConflict: 'code' });
  } catch {
    /* tablo yoksa yerel kupon yine durur */
  }
}

export async function inspectCouponCode(
  raw: string,
  ctx: {
    companies: Company[];
    campaigns: Campaign[];
    users: AppUser[];
    redemptions: UserRedemption[];
  },
): Promise<CouponInspect> {
  const code = normalizeCouponCode(raw);
  if (code.length < 4) return emptyInspect(raw.trim(), ['Geçerli bir kupon kodu girin.']);

  type TicketRow = {
    code: string;
    status: string;
    user_id?: string;
    campaign_id?: string;
    company_id?: string | null;
    created_at?: string;
    expires_at?: string | null;
  };
  let ticket: TicketRow | null = null;

  if (isSupabaseConfigured) {
    const remote = await supabase
      .from('coupon_tickets')
      .select('code,status,user_id,campaign_id,company_id,created_at,expires_at')
      .eq('code', code)
      .maybeSingle();
    if (!remote.error && remote.data) ticket = remote.data as TicketRow;
  }

  const local = readLocalClaims().find((item) => codesMatch(item.code, code));
  if (!ticket && local) {
    ticket = {
      code: local.code,
      status: local.status,
      user_id: local.consumer_id,
      campaign_id: local.offer_id,
      company_id: local.merchant_id,
      created_at: local.created_at,
      expires_at: local.expires_at,
    };
  }

  if (!ticket) {
    return emptyInspect(raw.trim().toUpperCase(), ['Bu koda ait kupon bulunamadı.']);
  }

  const campaign = ctx.campaigns.find((item) => item.id === ticket.campaign_id) ?? null;
  const company = ctx.companies.find((item) => item.id === (ticket.company_id || campaign?.company_id)) ?? null;
  const holder = ctx.users.find((item) => item.id === ticket.user_id || item.auth_user_id === ticket.user_id) ?? null;
  const expired = ticket.expires_at ? getMsRemaining(ticket.expires_at) <= 0 : false;
  const issues: string[] = [];
  if (ticket.status === 'used') issues.push('Kupon daha önce onaylanmış.');
  if (ticket.status === 'cancelled' || ticket.status === 'deleted') issues.push('Kupon iptal edilmiş.');
  if (expired && ticket.status === 'active') issues.push('Kupon süresi dolmuş.');
  if (!campaign) issues.push('Kampanya kaydı eşleşmedi.');
  if (!company) issues.push('Firma kaydı eşleşmedi.');
  if (!holder) issues.push('Kullanıcı kaydı eşleşmedi.');
  if (campaign && company && campaign.company_id !== company.id) issues.push('Kampanya bu firmaya ait değil.');

  const valid = ticket.status === 'active' && !expired && Boolean(campaign && company);

  return {
    code: raw.replace(/\s+/g, '').toUpperCase(),
    found: true,
    valid,
    status: expired && ticket.status === 'active' ? 'expired' : ticket.status,
    issues,
    companyName: company?.name ?? null,
    companyId: company?.id ?? ticket.company_id ?? null,
    campaignTitle: campaign?.title ?? null,
    campaignId: campaign?.id ?? ticket.campaign_id ?? null,
    holderName: personLabel(holder),
    holderEmail: holder?.email ?? null,
    holderPhone: holder?.phone ?? null,
    createdAt: ticket.created_at ?? null,
    expiresAt: ticket.expires_at ?? null,
  };
}

export async function approveCouponCode(raw: string, companyId?: string) {
  const inspect = await inspectCouponCode(raw, {
    companies: [],
    campaigns: [],
    users: [],
    redemptions: [],
  });
  const code = normalizeCouponCode(raw);
  const local = readLocalClaims().find((item) => codesMatch(item.code, code));
  if (companyId && local?.merchant_id && local.merchant_id !== companyId && local.offer_id) {
    /* merchant filter applied by caller via inspect context */
  }

  if (local) {
    if (companyId && local.merchant_id && local.merchant_id !== companyId) {
      throw new Error('Bu kupon bu firmaya ait değil.');
    }
    if (local.status === 'used') throw new Error('Bu kupon zaten onaylanmış.');
    if (local.status === 'cancelled' || local.status === 'deleted') throw new Error('Bu kupon geçersiz.');
    const next = { ...local, status: 'used' as const };
    writeLocalClaim(next);
  }

  if (isSupabaseConfigured) {
    const remote = await supabase.from('coupon_tickets').select('*').eq('code', code).maybeSingle();
    if (!remote.error && remote.data) {
      if (companyId && remote.data.company_id && remote.data.company_id !== companyId) {
        throw new Error('Bu kupon bu firmaya ait değil.');
      }
      if (remote.data.status === 'used') throw new Error('Bu kupon zaten onaylanmış.');
      await supabase.from('coupon_tickets').update({ status: 'used', used_at: new Date().toISOString() }).eq('code', code);
    } else if (!local) {
      throw new Error(inspect.issues[0] || 'Bu koda ait kupon bulunamadı.');
    }
  } else if (!local) {
    throw new Error('Bu koda ait kupon bulunamadı.');
  }

  return { code: raw.replace(/\s+/g, '').toUpperCase() };
}
