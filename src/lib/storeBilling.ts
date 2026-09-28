import { planFromProduct, planTierOf, type PlanTier } from '@/lib/plans';
import { startPaidSubscription } from '@/lib/subscription';
import { isSupabaseConfigured, supabase } from '@/lib/supabase';

export type PlanPurchaseResult = { ok: true; tier: PlanTier } | { ok: false; message: string };

function missingColumn(message: string) {
  const raw = message.toLowerCase();
  return raw.includes('plan_tier') || raw.includes('schema cache') || raw.includes('column');
}

export async function applyPlanPurchase(companyId: string, tier: PlanTier): Promise<PlanPurchaseResult> {
  const id = companyId.trim();
  if (!id) return { ok: false, message: 'Firma bulunamadı.' };
  const started = await startPaidSubscription(id);
  if (!started.ok) return { ok: false, message: started.message ?? 'Abonelik başlatılamadı.' };
  if (!isSupabaseConfigured) return { ok: true, tier };
  const applied = await supabase.rpc('merchant_apply_plan', { p_tier: tier });
  if (!applied.error) return { ok: true, tier };
  const raw = applied.error.message.toLowerCase();
  if (raw.includes('merchant_apply_plan') || raw.includes('schema cache') || missingColumn(applied.error.message)) {
    await supabase.from('companies').update({ plan_tier: tier }).eq('id', id);
    return { ok: true, tier };
  }
  return { ok: false, message: applied.error.message };
}

export async function applyStoreProduct(companyId: string, productId: string): Promise<PlanPurchaseResult> {
  const tier = planFromProduct(productId);
  if (!tier) return { ok: false, message: 'Mağaza ürünü tanınmadı.' };
  return applyPlanPurchase(companyId, tier);
}

export function currentPlanTier(row: { plan_tier?: string | null; is_featured?: boolean | null } | null | undefined) {
  return planTierOf(row);
}
