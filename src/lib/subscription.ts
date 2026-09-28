import { useEffect, useState } from 'react';
import { PLAN_PRICES } from '@/lib/plans';
import { isSupabaseConfigured, supabase } from '@/lib/supabase';
import { subscribeTables } from '@/lib/live';

const KEY = 'qapla_subscription_settings';
const EVENT = 'qapla-subscription';

export type SubscriptionSettings = {
  is_subscription_active: boolean;
  intro_price: number;
  intro_duration_months: number;
  standard_price: number;
};

export const DEFAULT_SUBSCRIPTION: SubscriptionSettings = {
  is_subscription_active: false,
  intro_price: PLAN_PRICES.premiumLaunch,
  intro_duration_months: 1,
  standard_price: PLAN_PRICES.standard,
};

export function normalizeSubscription(raw: unknown): SubscriptionSettings {
  const row = raw && typeof raw === 'object' ? raw as Record<string, unknown> : {};
  return {
    is_subscription_active: Boolean(row.is_subscription_active),
    intro_price: PLAN_PRICES.premiumLaunch,
    intro_duration_months: 1,
    standard_price: PLAN_PRICES.standard,
  };
}

export function readSubscriptionSettings(): SubscriptionSettings {
  try {
    return normalizeSubscription(JSON.parse(localStorage.getItem(KEY) ?? '{}'));
  } catch {
    return DEFAULT_SUBSCRIPTION;
  }
}

function remember(next: SubscriptionSettings) {
  localStorage.setItem(KEY, JSON.stringify(next));
  window.dispatchEvent(new Event(EVENT));
  return next;
}

export function subscriptionPlanText(_settings?: Pick<SubscriptionSettings, 'intro_price' | 'intro_duration_months' | 'standard_price'>) {
  return `Standard ${PLAN_PRICES.standard} TL/ay · Premium lansman ${PLAN_PRICES.premiumLaunch} TL/ay, normal ${PLAN_PRICES.premium} TL/ay`;
}

export function subscriptionPriceNow(
  startedAt: string | null | undefined,
  settings: Pick<SubscriptionSettings, 'intro_price' | 'intro_duration_months' | 'standard_price'>,
) {
  if (!startedAt) return settings.intro_price;
  const start = new Date(startedAt);
  if (Number.isNaN(+start)) return settings.intro_price;
  const introEnds = new Date(start);
  introEnds.setMonth(introEnds.getMonth() + settings.intro_duration_months);
  return Date.now() < +introEnds ? settings.intro_price : settings.standard_price;
}

export const PILOT_FREE_MONTHS = 2;
export const PILOT_FREE_DAYS = 60;

export type PilotAccess = {
  is_pilot_firm?: boolean | null;
  free_trial_months?: number | null;
  subscription_ends_at?: string | null;
  paid_started_at?: string | null;
};

export function addCalendarMonths(from: Date, months: number) {
  const next = new Date(from);
  next.setMonth(next.getMonth() + months);
  return next;
}

export function addDays(from: Date, days: number) {
  const next = new Date(from);
  next.setDate(next.getDate() + days);
  return next;
}

export type BillingAccess = PilotAccess & {
  subscription_enrolled?: boolean | null;
};

export function pilotColumns(enabled: boolean, from = new Date()) {
  if (!enabled) {
    return {
      is_pilot_firm: false,
      free_trial_months: null,
      subscription_ends_at: null,
    };
  }
  return {
    is_pilot_firm: true,
    free_trial_months: PILOT_FREE_MONTHS,
    subscription_ends_at: addDays(from, PILOT_FREE_DAYS).toISOString(),
    subscription_enrolled: false,
    paid_started_at: null,
  };
}

export function mergeFirmBilling(
  company?: BillingAccess | null,
  application?: BillingAccess | null,
): BillingAccess {
  const pilotSource = company?.is_pilot_firm ? company : application?.is_pilot_firm ? application : null;
  return {
    is_pilot_firm: Boolean(company?.is_pilot_firm || application?.is_pilot_firm),
    free_trial_months: pilotSource?.free_trial_months ?? company?.free_trial_months ?? application?.free_trial_months ?? null,
    subscription_ends_at: pilotSource?.subscription_ends_at ?? company?.subscription_ends_at ?? application?.subscription_ends_at ?? null,
    paid_started_at: company?.paid_started_at ?? application?.paid_started_at ?? null,
    subscription_enrolled: Boolean(company?.subscription_enrolled || application?.subscription_enrolled),
  };
}

export function needsSubscriptionPaywall(row: BillingAccess | null | undefined, now = Date.now()) {
  if (!row || row.paid_started_at) return false;
  if (pilotTrialActive(row, now)) return false;
  if (pilotNeedsPaidPlan(row, now)) return true;
  return Boolean(row.subscription_enrolled && !row.is_pilot_firm);
}

export function readPilotAccess(row: Record<string, unknown> | null | undefined): PilotAccess {
  if (!row) return {};
  return {
    is_pilot_firm: Boolean(row.is_pilot_firm),
    free_trial_months: row.free_trial_months == null ? null : Number(row.free_trial_months),
    subscription_ends_at: row.subscription_ends_at ? String(row.subscription_ends_at) : null,
    paid_started_at: row.paid_started_at ? String(row.paid_started_at) : null,
  };
}

export function pilotTrialEnd(row: PilotAccess | null | undefined) {
  if (!row?.is_pilot_firm || !row.subscription_ends_at) return null;
  const end = new Date(row.subscription_ends_at);
  return Number.isNaN(+end) ? null : end;
}

export function pilotTrialActive(row: PilotAccess | null | undefined, now = Date.now()) {
  const end = pilotTrialEnd(row);
  return Boolean(end && now < +end && !row?.paid_started_at);
}

export function pilotNeedsPaidPlan(row: PilotAccess | null | undefined, now = Date.now()) {
  if (!row?.is_pilot_firm || row.paid_started_at) return false;
  const end = pilotTrialEnd(row);
  return Boolean(end && now >= +end);
}

export function formatTrialDate(value: Date | string | null | undefined) {
  const date = value instanceof Date ? value : value ? new Date(value) : null;
  if (!date || Number.isNaN(+date)) return '';
  return date.toLocaleDateString('tr-TR', { day: 'numeric', month: 'long', year: 'numeric' });
}

export async function startPaidSubscription(companyId: string): Promise<{ ok: boolean; message?: string }> {
  if (!companyId) return { ok: false, message: 'Firma bulunamadı.' };
  const settings = await refreshSubscriptionSettings();
  const now = new Date().toISOString();
  const patch = {
    subscription_enrolled: true,
    subscription_started_at: now,
    paid_started_at: now,
    intro_price: settings.intro_price,
    intro_duration_months: settings.intro_duration_months,
    standard_price: settings.standard_price,
  };
  if (!isSupabaseConfigured) return { ok: true };
  const rpc = await supabase.rpc('merchant_start_paid_plan');
  if (!rpc.error) return { ok: true };
  const missingRpc = /merchant_start_paid_plan|schema cache|PGRST202|not_pilot/i.test(rpc.error.message);
  if (!missingRpc) {
    console.error('Ücretli plana geçilemedi', rpc.error.message);
    return { ok: false, message: 'Abonelik başlatılamadı. Biraz sonra tekrar dene.' };
  }
  const { error } = await supabase.from('companies').update(patch).eq('id', companyId);
  if (error) {
    console.error('Ücretli plana geçilemedi', error.message);
    return { ok: false, message: 'Abonelik başlatılamadı. Biraz sonra tekrar dene.' };
  }
  return { ok: true };
}

export async function refreshSubscriptionSettings() {
  if (!isSupabaseConfigured) return readSubscriptionSettings();
  const { data, error } = await supabase
    .from('app_live_settings')
    .select('is_subscription_active, intro_price, intro_duration_months, standard_price')
    .eq('id', 'main')
    .maybeSingle();
  if (error || !data) return readSubscriptionSettings();
  return remember(normalizeSubscription(data));
}

export async function saveSubscriptionSettings(next: SubscriptionSettings): Promise<{ ok: boolean; message?: string }> {
  const clean = normalizeSubscription(next);
  remember(clean);
  if (!isSupabaseConfigured) return { ok: true };
  const { error } = await supabase.from('app_live_settings').update({
    is_subscription_active: clean.is_subscription_active,
    intro_price: clean.intro_price,
    intro_duration_months: clean.intro_duration_months,
    standard_price: clean.standard_price,
  }).eq('id', 'main');
  if (error) {
    console.error('Abonelik ayarı yazılamadı', error.message);
    return { ok: false, message: error.message };
  }
  return { ok: true };
}

export function useSubscriptionSettings() {
  const [settings, setSettings] = useState(readSubscriptionSettings);
  useEffect(() => {
    const sync = () => setSettings(readSubscriptionSettings());
    void refreshSubscriptionSettings();
    window.addEventListener(EVENT, sync);
    window.addEventListener('storage', sync);
    const stop = subscribeTables(['app_live_settings'], () => { void refreshSubscriptionSettings(); });
    return () => {
      window.removeEventListener(EVENT, sync);
      window.removeEventListener('storage', sync);
      stop();
    };
  }, []);
  return settings;
}
