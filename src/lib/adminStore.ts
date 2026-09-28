import type { AppUser, Campaign, Company, UserRedemption } from '@/lib/campaigns';

const COMPANIES_KEY = 'qapla_admin_companies';
const CAMPAIGNS_KEY = 'qapla_admin_campaigns';
const USERS_KEY = 'qapla_admin_users';
const LOCAL_AUTH_USERS_KEY = 'qapla_local_auth_users';
const LOCAL_REDEMPTIONS_KEY = 'qapla_user_redemptions';
const SECRETS_KEY = 'qapla_admin_login_secrets';

export type LoginSecret = {
  email: string;
  password: string;
  kind?: string;
  companyId?: string | null;
  label?: string | null;
};

export function readLocalSecrets(): LoginSecret[] {
  return readJson<LoginSecret>(SECRETS_KEY);
}

export function secretMap(): Record<string, string> {
  return Object.fromEntries(
    readLocalSecrets()
      .filter((item) => item.email && item.password)
      .map((item) => [item.email.trim().toLowerCase(), item.password]),
  );
}

export function upsertLocalSecret(secret: LoginSecret) {
  const email = secret.email.trim().toLowerCase();
  const next = [
    { ...secret, email },
    ...readLocalSecrets().filter((item) => item.email.trim().toLowerCase() !== email),
  ];
  writeJson(SECRETS_KEY, next);
}

function readJson<T>(key: string): T[] {
  try {
    const raw = localStorage.getItem(key);
    const parsed = raw ? JSON.parse(raw) as T[] : [];
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function writeJson<T>(key: string, value: T[]) {
  localStorage.setItem(key, JSON.stringify(value));
}

export function readLocalCompanies(): Company[] {
  return readJson<Company>(COMPANIES_KEY);
}

export function readLocalCampaigns(): Campaign[] {
  return readJson<Campaign>(CAMPAIGNS_KEY);
}

export function upsertLocalCompany(company: Company) {
  const next = [company, ...readLocalCompanies().filter((item) => item.id !== company.id)];
  writeJson(COMPANIES_KEY, next);
}

export function removeLocalCompany(id: string) {
  writeJson(COMPANIES_KEY, readLocalCompanies().filter((item) => item.id !== id));
  writeJson(CAMPAIGNS_KEY, readLocalCampaigns().filter((item) => item.company_id !== id));
}

export function upsertLocalCampaign(campaign: Campaign) {
  const next = [campaign, ...readLocalCampaigns().filter((item) => item.id !== campaign.id)];
  writeJson(CAMPAIGNS_KEY, next);
}

export function removeLocalCampaign(id: string) {
  writeJson(CAMPAIGNS_KEY, readLocalCampaigns().filter((item) => item.id !== id));
}

export function mergeById<T extends { id: string }>(remote: T[], local: T[]): T[] {
  const map = new Map<string, T>();
  for (const item of remote) map.set(item.id, item);
  for (const item of local) map.set(item.id, item);
  return [...map.values()];
}

export function readLocalUsers(): AppUser[] {
  const stored = readJson<AppUser>(USERS_KEY);
  let authUsers: AppUser[] = [];
  try {
    const raw = localStorage.getItem(LOCAL_AUTH_USERS_KEY);
    const parsed = raw ? JSON.parse(raw) as Array<{ id: string; email: string; phone?: string }> : [];
    authUsers = (Array.isArray(parsed) ? parsed : []).map((item) => ({
      id: item.id,
      email: item.email,
      phone: item.phone ?? '',
      role: 'user' as const,
      company_id: null,
      created_at: new Date().toISOString(),
    }));
  } catch {
    authUsers = [];
  }
  return mergeById(authUsers, stored);
}

export function upsertLocalUser(user: AppUser) {
  writeJson(USERS_KEY, [user, ...readLocalUsers().filter((item) => item.id !== user.id && item.email !== user.email)]);
}

export function removeLocalUser(id: string) {
  writeJson(USERS_KEY, readLocalUsers().filter((item) => item.id !== id));
}

export function readAllLocalRedemptions(): UserRedemption[] {
  try {
    const raw = localStorage.getItem(LOCAL_REDEMPTIONS_KEY);
    const parsed = raw ? JSON.parse(raw) as UserRedemption[] : [];
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}
