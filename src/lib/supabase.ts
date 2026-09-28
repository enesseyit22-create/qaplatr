import { createClient } from '@supabase/supabase-js';

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL?.trim() ?? '';
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY?.trim() ?? '';

export const isSupabaseConfigured = Boolean(supabaseUrl && supabaseAnonKey);

export const supabase = createClient(
  supabaseUrl || 'https://placeholder.supabase.co',
  supabaseAnonKey || 'public-anon-key',
  {
    auth: {
      persistSession: true,
      autoRefreshToken: true,
      detectSessionInUrl: true,
    },
  },
);

export type Merchant = {
  id: string;
  name: string;
  category: string;
  address: string;
  latitude: number;
  longitude: number;
  distance_m: number;
  description: string;
  accent: string;
  is_open: boolean;
  is_featured?: boolean;
  is_verified?: boolean;
  plan_tier?: 'standard' | 'premium';
  created_at: string;
  phone?: string | null;
  image_url?: string | null;
  logo_url?: string | null;
  cover_url?: string | null;
  whatsapp?: string | null;
};

export type Offer = {
  id: string;
  merchant_id: string;
  title: string;
  description: string;
  discount: string;
  category: string;
  badge: string;
  expires_at: string;
  stock: number;
  is_featured: boolean;
  is_active: boolean;
  created_at: string;
  image_url?: string | null;
};

export type CouponClaim = {
  id: string;
  offer_id: string;
  consumer_id: string;
  code: string;
  expires_at: string;
  status: string;
  created_at: string;
  merchant_id?: string;
};

export type OfferWithMerchant = Offer & {
  qapla_merchants: Merchant;
};
