import type { Company } from '@/lib/campaigns';
import { supabase } from '@/lib/supabase';

const RICH = [
  'id', 'name', 'description', 'category', 'latitude', 'longitude', 'address',
  'is_featured', 'phone', 'email', 'owner_email', 'logo_url', 'cover_url', 'whatsapp',
  'is_pilot_firm', 'free_trial_months', 'subscription_ends_at', 'paid_started_at',
  'subscription_enrolled', 'subscription_started_at', 'plan_tier', 'is_verified',
  'tax_number', 'push_quota_override', 'created_at',
].join(',');

const PLAIN = [
  'id', 'name', 'description', 'category', 'latitude', 'longitude', 'address',
  'is_featured', 'phone', 'email', 'owner_email', 'logo_url', 'cover_url', 'whatsapp',
  'created_at',
].join(',');

function missingColumn(message: string) {
  const raw = message.toLowerCase();
  return raw.includes('column') || raw.includes('schema cache');
}

function asCompanies(data: unknown) {
  return ((data as Company[]) ?? []).filter((row) => row?.id);
}

export async function fetchCompanyList(): Promise<Company[]> {
  const rich = await supabase.from('companies').select(RICH);
  if (!rich.error) return asCompanies(rich.data);
  if (!missingColumn(rich.error.message)) throw new Error(rich.error.message);
  const plain = await supabase.from('companies').select(PLAIN);
  if (plain.error) throw new Error(plain.error.message);
  return asCompanies(plain.data);
}

export async function fetchCompanyById(id: string): Promise<Company | null> {
  const value = id.trim();
  if (!value) return null;
  const rich = await supabase.from('companies').select(RICH).eq('id', value).maybeSingle();
  if (!rich.error) return (rich.data as Company | null) ?? null;
  if (!missingColumn(rich.error.message)) return null;
  const plain = await supabase.from('companies').select(PLAIN).eq('id', value).maybeSingle();
  return (plain.data as Company | null) ?? null;
}

export async function fetchCompanyByEmail(email: string): Promise<Company | null> {
  const value = email.trim().toLowerCase();
  if (!value) return null;
  const columns = RICH;
  const [byEmail, byOwner] = await Promise.all([
    supabase.from('companies').select(columns).eq('email', value).limit(1).maybeSingle(),
    supabase.from('companies').select(columns).eq('owner_email', value).limit(1).maybeSingle(),
  ]);
  if (!byEmail.error && byEmail.data) return byEmail.data as unknown as Company;
  if (!byOwner.error && byOwner.data) return byOwner.data as unknown as Company;
  if ((byEmail.error && missingColumn(byEmail.error.message)) || (byOwner.error && missingColumn(byOwner.error.message))) {
    const [plainEmail, plainOwner] = await Promise.all([
      supabase.from('companies').select(PLAIN).eq('email', value).limit(1).maybeSingle(),
      supabase.from('companies').select(PLAIN).eq('owner_email', value).limit(1).maybeSingle(),
    ]);
    return (plainEmail.data as Company | null) ?? (plainOwner.data as Company | null) ?? null;
  }
  return null;
}
