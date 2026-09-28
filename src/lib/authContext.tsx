import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import type { AuthChangeEvent, Session, User } from '@supabase/supabase-js';
import {
  asProfile,
  destinationForAccount,
  friendlyAuthError,
  joinFullName,
  loadMyProfile,
  isValidPhone,
  loginGateMessage,
  normalizePhone,
  roleAllowedForGate,
  EXISTING_ACCOUNT_MESSAGE,
  isDuplicateSignupUser,
  isExistingAccountAuthError,
  sessionAfterSignUp,
  writeOwnProfile,
  type AppDestination,
  type AppProfile,
  type LoginGate,
  type ProfileRole,
} from '@/lib/auth';
import { upsertLocalUser } from '@/lib/adminStore';
import { notifyAdminsOfSignup } from '@/lib/adminSettings';
import { loadBusinessForUser, retryPendingBusinessApplication, type BusinessApplication } from '@/lib/businesses';
import { isSupabaseConfigured, supabase } from '@/lib/supabase';

export type AuthUser = {
  id: string;
  email: string;
  phone: string;
  signupKind?: 'user' | 'business';
};

type AuthResult = {
  ok: boolean;
  message?: string;
  role?: ProfileRole;
  destination?: AppDestination;
};

type AuthContextValue = {
  user: AuthUser | null;
  profile: AppProfile | null;
  businessApplication: BusinessApplication | null;
  loading: boolean;
  signIn: (email: string, password: string, gate?: LoginGate) => Promise<AuthResult>;
  signUp: (email: string, password: string, phone: string, firstName: string, lastName: string, city: string) => Promise<AuthResult>;
  signOut: () => Promise<void>;
  refreshProfile: () => Promise<AppProfile | null>;
  updateAccount: (input: { firstName: string; lastName: string; phone: string; password?: string; email?: string }) => Promise<AuthResult>;
};

const LOCAL_USERS_KEY = 'qapla_local_auth_users';
const LOCAL_SESSION_KEY = 'qapla_local_auth_session';

const AuthContext = createContext<AuthContextValue | null>(null);

async function withApprovedBusinessRole(
  userId: string,
  email: string | null | undefined,
  profile: AppProfile | null,
): Promise<AppProfile | null> {
  if (!profile || profile.role === 'admin' || !userId) return profile;
  try {
    const application = await loadBusinessForUser(userId, email);
    if (application?.status === 'approved') {
      return {
        ...profile,
        role: 'merchant',
        company_id: application.company_id ?? profile.company_id,
      };
    }
  } catch {
    return profile;
  }
  return profile;
}

function toAuthUser(user: User, phoneOverride?: string): AuthUser {
  const phone = phoneOverride || String(user.user_metadata?.phone ?? user.phone ?? '');
  const kind = String(user.user_metadata?.signup_kind ?? '');
  return {
    id: user.id,
    email: user.email ?? '',
    phone,
    signupKind: kind === 'business' ? 'business' : 'user',
  };
}

type LocalAccount = { id: string; email: string; password: string; phone?: string; role?: ProfileRole; first_name?: string; last_name?: string; city?: string };

function readLocalUsers(): LocalAccount[] {
  try {
    const raw = localStorage.getItem(LOCAL_USERS_KEY);
    const parsed = raw ? JSON.parse(raw) as LocalAccount[] : [];
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function writeLocalUsers(users: LocalAccount[]) {
  localStorage.setItem(LOCAL_USERS_KEY, JSON.stringify(users));
}

function readLocalSession(): { user: AuthUser; profile: AppProfile } | null {
  try {
    const raw = localStorage.getItem(LOCAL_SESSION_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as AuthUser & { role?: ProfileRole; company_id?: string | null };
    if (!parsed?.id || !parsed?.email) return null;
    const user = { id: parsed.id, email: parsed.email, phone: parsed.phone ?? '' };
    const profile: AppProfile = {
      id: parsed.id,
      email: parsed.email,
      phone: parsed.phone ?? '',
      role: parsed.role === 'admin' || parsed.role === 'merchant' ? parsed.role : 'user',
      company_id: parsed.company_id ?? null,
      city: (parsed as { city?: string }).city ?? null,
    };
    return { user, profile };
  } catch {
    return null;
  }
}

function writeLocalSession(user: AuthUser | null, profile: AppProfile | null) {
  if (!user) {
    localStorage.removeItem(LOCAL_SESSION_KEY);
    return;
  }
  localStorage.setItem(LOCAL_SESSION_KEY, JSON.stringify({
    ...user,
    role: profile?.role ?? 'user',
    company_id: profile?.company_id ?? null,
    city: profile?.city ?? null,
  }));
}

function rememberProfile(user: AuthUser, role: ProfileRole = 'user') {
  upsertLocalUser({
    id: user.id,
    email: user.email,
    phone: user.phone ?? '',
    role,
    company_id: null,
    created_at: new Date().toISOString(),
  });
}

function localProfile(account: LocalAccount): AppProfile {
  const role = account.role === 'admin' || account.role === 'merchant' ? account.role : 'user';
  const first_name = account.first_name ?? null;
  const last_name = account.last_name ?? null;
  return {
    id: account.id,
    email: account.email,
    phone: account.phone ?? '',
    first_name,
    last_name,
    full_name: joinFullName(first_name, last_name) || null,
    role,
    company_id: null,
    city: account.city ?? null,
  };
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<AuthUser | null>(null);
  const [profile, setProfile] = useState<AppProfile | null>(null);
  const [businessApplication, setBusinessApplication] = useState<BusinessApplication | null>(null);
  const [loading, setLoading] = useState(true);
  const fetchGen = useRef(0);

  const syncBusinessApplication = useCallback(async (userId?: string | null, email?: string | null) => {
    if (!userId) {
      setBusinessApplication(null);
      return null;
    }
    const row = await retryPendingBusinessApplication(userId, email).catch(() => loadBusinessForUser(userId, email).catch(() => null));
    setBusinessApplication(row);
    return row;
  }, []);

  const applySessionUser = useCallback(async (authUser: User | null) => {
    const gen = ++fetchGen.current;
    if (!authUser) {
      setUser(null);
      setProfile(null);
      setBusinessApplication(null);
      return null;
    }

    setUser(toAuthUser(authUser));
    try {
      const nextProfile = await loadMyProfile();
      if (gen !== fetchGen.current) return nextProfile;
      const resolved = await withApprovedBusinessRole(authUser.id, authUser.email, nextProfile);
      if (gen !== fetchGen.current) return resolved;
      await syncBusinessApplication(authUser.id, authUser.email);
      if (gen !== fetchGen.current) return resolved;
      setProfile(resolved);
      return resolved;
    } catch {
      if (gen !== fetchGen.current) return null;
      const fallback = {
        id: authUser.id,
        auth_user_id: authUser.id,
        email: authUser.email ?? '',
        phone: String(authUser.user_metadata?.phone ?? ''),
        role: 'user' as const,
        company_id: null,
      };
      setProfile(fallback);
      await syncBusinessApplication(authUser.id, authUser.email);
      return fallback;
    }
  }, [syncBusinessApplication]);

  const refreshProfile = useCallback(async () => {
    const gen = fetchGen.current;
    try {
      const nextProfile = await loadMyProfile();
      if (gen !== fetchGen.current) return nextProfile;
      if (!isSupabaseConfigured) {
        setProfile(nextProfile);
        return nextProfile;
      }
      const { data } = await supabase.auth.getUser();
      const resolved = await withApprovedBusinessRole(data.user?.id ?? nextProfile?.id ?? '', data.user?.email, nextProfile);
      if (gen !== fetchGen.current) return resolved;
      await syncBusinessApplication(data.user?.id ?? nextProfile?.id, data.user?.email ?? nextProfile?.email);
      if (gen !== fetchGen.current) return resolved;
      setProfile(resolved);
      return resolved;
    } catch {
      return null;
    }
  }, [syncBusinessApplication]);

  useEffect(() => {
    let cancelled = false;

    const boot = async () => {
      if (!isSupabaseConfigured) {
        if (!cancelled) {
          const local = readLocalSession();
          setUser(local?.user ?? null);
          setProfile(local?.profile ?? null);
          setLoading(false);
        }
        return;
      }

      const { data } = await supabase.auth.getSession();
      if (cancelled) return;
      await applySessionUser(data.session?.user ?? null);
      if (!cancelled) setLoading(false);
    };

    void boot();

    if (!isSupabaseConfigured) {
      return () => {
        cancelled = true;
      };
    }

    const { data } = supabase.auth.onAuthStateChange((event: AuthChangeEvent, session: Session | null) => {
      window.setTimeout(() => {
        if (cancelled) return;
        if ((event === 'TOKEN_REFRESHED' || event === 'USER_UPDATED') && session?.user) {
          void refreshProfile();
          return;
        }
        void applySessionUser(session?.user ?? null);
      }, 0);
    });

    return () => {
      cancelled = true;
      data.subscription.unsubscribe();
    };
  }, [applySessionUser, refreshProfile]);

  useEffect(() => {
    if (!isSupabaseConfigured || !user?.id) return;

    const applyRow = (payload: { eventType: string; new: Record<string, unknown>; old: Record<string, unknown> }) => {
      try {
        if (payload.eventType === 'DELETE') {
          void refreshProfile();
          return;
        }
        const next = asProfile((payload.new ?? payload.old) as AppProfile);
        if (next) setProfile(next);
      } catch {
        void refreshProfile();
      }
    };

    const channel = supabase
      .channel(`profile-role-id-${user.id}`)
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'profiles', filter: `id=eq.${user.id}` },
        applyRow,
      )
      .subscribe();

    return () => {
      void supabase.removeChannel(channel);
    };
  }, [user?.id, refreshProfile]);

  const signIn = useCallback(async (email: string, password: string, gate: LoginGate = 'user'): Promise<AuthResult> => {
    const normalized = email.trim().toLowerCase();
    if (!normalized || password.length < 6) {
      return { ok: false, message: 'Geçerli e-posta ve en az 6 karakter şifre girin.' };
    }

    if (!isSupabaseConfigured) {
      return { ok: false, message: 'Supabase yapılandırılmadı. Giriş için Auth gerekir.' };
    }

    const { data, error } = await supabase.auth.signInWithPassword({ email: normalized, password });
    if (error || !data.user) {
      return { ok: false, message: friendlyAuthError(error?.message, 'E-posta veya şifre hatalı.') };
    }

    const nextProfile = await applySessionUser(data.user);
    const application = await retryPendingBusinessApplication(data.user.id, normalized).catch(() => loadBusinessForUser(data.user.id, normalized).catch(() => null));
    setBusinessApplication(application);
    const kind = toAuthUser(data.user).signupKind;
    if (gate === 'merchant') {
      if (application && application.status !== 'approved') {
        return { ok: true, role: 'user', destination: 'pending' };
      }
      if (application?.status === 'approved' || nextProfile?.role === 'merchant') {
        if (nextProfile && nextProfile.role !== 'admin') {
          setProfile({
            ...nextProfile,
            role: 'merchant',
            company_id: application?.company_id ?? nextProfile.company_id,
          });
        }
        return { ok: true, role: 'merchant', destination: 'merchant' };
      }
      await supabase.auth.signOut();
      setUser(null);
      setProfile(null);
      setBusinessApplication(null);
      return { ok: false, message: loginGateMessage('merchant') };
    }
    const role = nextProfile?.role ?? 'user';
    if (!roleAllowedForGate(role, gate) && destinationForAccount(role, application, kind) !== 'pending') {
      await supabase.auth.signOut();
      setUser(null);
      setProfile(null);
      setBusinessApplication(null);
      return { ok: false, message: loginGateMessage(gate) };
    }
    return { ok: true, role, destination: destinationForAccount(role, application, kind) };
  }, [applySessionUser]);

  const signUp = useCallback(async (email: string, password: string, phone: string, firstName: string, lastName: string, city: string): Promise<AuthResult> => {
    const normalized = email.trim().toLowerCase();
    const tel = normalizePhone(phone);
    const first = firstName.trim();
    const last = lastName.trim();
    const cityName = city.trim();
    if (!normalized || password.length < 6) {
      return { ok: false, message: 'Geçerli e-posta ve en az 6 karakter şifre girin.' };
    }
    if (!first || !last) {
      return { ok: false, message: 'İsim ve soyisim girin.' };
    }
    if (!cityName) {
      return { ok: false, message: 'Şehir seçin.' };
    }
    if (!isValidPhone(tel, true)) {
      return { ok: false, message: 'Geçerli bir telefon numarası girin.' };
    }

    if (!isSupabaseConfigured) {
      const users = readLocalUsers();
      if (users.some((item) => item.email === normalized)) {
        return { ok: false, message: EXISTING_ACCOUNT_MESSAGE };
      }
      const account: LocalAccount = {
        id: crypto.randomUUID(),
        email: normalized,
        password,
        phone: tel,
        role: 'user',
        first_name: first,
        last_name: last,
        city: cityName,
      };
      writeLocalUsers([account, ...users]);
      const next = { id: account.id, email: account.email, phone: tel };
      const nextProfile = localProfile(account);
      writeLocalSession(next, nextProfile);
      rememberProfile(next, 'user');
      setUser(next);
      setProfile(nextProfile);
      return { ok: true, role: 'user', destination: 'home' };
    }

    const fullName = joinFullName(first, last);
    try {
      const { data, error } = await supabase.auth.signUp({
        email: normalized,
        password,
        options: { data: { phone: tel, first_name: first, last_name: last, full_name: fullName, city: cityName } },
      });
      if (error && isExistingAccountAuthError(error)) {
        return { ok: false, message: EXISTING_ACCOUNT_MESSAGE };
      }
      if (isDuplicateSignupUser(data.user, Boolean(data.session))) {
        return { ok: false, message: EXISTING_ACCOUNT_MESSAGE };
      }
      if (error) {
        return { ok: false, message: friendlyAuthError(error.message) };
      }

      const session = await sessionAfterSignUp(normalized, password, {
        user: data.user ?? null,
        session: data.session,
      });
      if (!session.ok) return session;

      rememberProfile(toAuthUser(session.user, tel), 'user');
      await supabase.auth.updateUser({
        data: { phone: tel, first_name: first, last_name: last, full_name: fullName, city: cityName },
      });
      const saved = await writeOwnProfile({
        id: session.user.id,
        email: normalized,
        phone: tel,
        fullName,
        role: 'user',
        city: cityName,
      });
      if (!saved.ok) return saved;

      const nextProfile = await applySessionUser(session.user);
      const role = nextProfile?.role ?? 'user';
      if (role !== 'user') {
        await supabase.auth.signOut();
        setUser(null);
        setProfile(null);
        return { ok: false, message: loginGateMessage('user') };
      }
      void notifyAdminsOfSignup('user');
      return { ok: true, role: 'user', destination: 'home' };
    } catch (err) {
      return { ok: false, message: friendlyAuthError(err instanceof Error ? err.message : null) };
    }
  }, [applySessionUser]);

  const signOut = useCallback(async () => {
    fetchGen.current += 1;
    if (isSupabaseConfigured) {
      await supabase.auth.signOut();
    } else {
      writeLocalSession(null, null);
    }
    setUser(null);
    setProfile(null);
    setBusinessApplication(null);
  }, []);

  const updateAccount = useCallback(async (input: { firstName: string; lastName: string; phone: string; password?: string; email?: string }): Promise<AuthResult> => {
    if (!user) return { ok: false, message: 'Giriş yapın.' };
    const first = input.firstName.trim();
    const last = input.lastName.trim();
    const tel = normalizePhone(input.phone);
    const fullName = joinFullName(first, last);
    const nextEmail = (input.email ?? user.email).trim().toLowerCase();
    if (!first || !last) return { ok: false, message: 'İsim ve soyisim girin.' };
    if (input.password && input.password.length < 6) return { ok: false, message: 'Şifre en az 6 karakter olmalı.' };
    if (!nextEmail || !nextEmail.includes('@')) return { ok: false, message: 'Geçerli bir e-posta girin.' };

    if (!isSupabaseConfigured) {
      const users = readLocalUsers();
      const nextUsers = users.map((item) => item.id === user.id ? {
        ...item,
        phone: tel,
        first_name: first,
        last_name: last,
        password: input.password || item.password,
        email: nextEmail,
      } : item);
      writeLocalUsers(nextUsers);
      const nextUser = { ...user, phone: tel, email: nextEmail };
      const nextProfile = {
        ...(profile ?? {
          id: user.id,
          email: nextEmail,
          phone: tel,
          role: 'user' as const,
          company_id: null,
        }),
        email: nextEmail,
        phone: tel,
        first_name: first,
        last_name: last,
        full_name: fullName,
      };
      writeLocalSession(nextUser, nextProfile);
      setUser(nextUser);
      setProfile(nextProfile);
      return { ok: true };
    }

    const { error } = await supabase.auth.updateUser({
      email: nextEmail,
      ...(input.password ? { password: input.password } : {}),
      data: { phone: tel, first_name: first, last_name: last, full_name: fullName },
    });
    if (error) return { ok: false, message: error.message };
    await supabase.from('profiles').upsert(
      { id: user.id, email: nextEmail, role: profile?.role ?? 'user', full_name: fullName, phone: tel },
      { onConflict: 'id' },
    );
    setUser({ ...user, phone: tel, email: nextEmail });
    await refreshProfile();
    return { ok: true };
  }, [user, profile, refreshProfile]);

  const value = useMemo(
    () => ({ user, profile, businessApplication, loading, signIn, signUp, signOut, refreshProfile, updateAccount }),
    [user, profile, businessApplication, loading, signIn, signUp, signOut, refreshProfile, updateAccount],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) {
    throw new Error('useAuth must be used within AuthProvider');
  }
  return ctx;
}
