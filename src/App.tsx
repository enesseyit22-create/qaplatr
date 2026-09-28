import { useState, useEffect, useCallback, useMemo, useRef, lazy, memo, Suspense } from 'react';
import {
  Droplet, Ticket, Clock, Store, Tag, ArrowLeft,
  Check, User, Sparkles, Coffee, Utensils, Dumbbell,
  Scissors, AlertCircle, Loader2, ShoppingBag, Shirt,
  Trash2, RotateCcw, Ban, Navigation, MapPin, Palette, Music,
  Heart, Bookmark, Settings,
} from 'lucide-react';
import { isSupabaseConfigured, type Merchant, type OfferWithMerchant, type CouponClaim } from '@/lib/supabase';
import {
  getConsumerId, generateCouponCode, formatTimeRemaining, getMsRemaining,
} from '@/lib/utils';
import {
  readLocalClaims, writeLocalClaim,
  cancelLocalClaim, deleteLocalClaim, restoreLocalClaim,
} from '@/lib/demoData';
import { readCouponTicketStatus, saveCouponTicket, setCouponTicketStatus } from '@/lib/couponTickets';
import { ExploreTabIcon } from '@/components/ExploreTabIcon';
import { SplashScreen } from '@/components/SplashScreen';
import { ExploreMap } from '@/components/ExploreMap';
import { MapZoomControls } from '@/components/MapZoomControls';
import { ExploreSheet, EXPLORE_NAV_CLEARANCE, SHEET_PEEK, type ExploreFeedId } from '@/components/ExploreSheet';
import { ExploreTopBar } from '@/components/ExploreTopBar';
import { MapPlaceCard } from '@/components/MapPlaceCard';
import { FirmName } from '@/components/VerifiedBadge';
import { useReach } from '@/lib/reach';
import { SideMenu } from '@/components/SideMenu';
import { TabPageShell, tabPrimary } from '@/components/TabPageShell';
import { QapLaMark } from '@/components/QapLaMark';
import { useAppFeatures } from '@/lib/appFeatures';
import { AuthProvider, useAuth } from '@/lib/authContext';
import type { MerchantTab } from '@/components/MerchantPanel';
import { ErrorToastHost } from '@/components/ErrorToast';
import { destinationForAccount, welcomeLine, type AppDestination } from '@/lib/auth';
import { useSecretTaps } from '@/hooks/useSecretTaps';
import { useAndroidBackButton } from '@/hooks/useAndroidBackButton';
import { App as CapacitorApp } from '@capacitor/app';
import { Capacitor } from '@capacitor/core';
import { startDevicePush, stopDevicePush, syncPushIdentity } from '@/lib/devicePush';
import {
  checkCampaignEligibilityAction,
  formatCooldown,
  listCampaignsAction,
  listCompaniesAction,
  redeemCampaignAction,
  listUserRedemptionsAction,
} from '@/lib/actions/campaigns';
import { campaignToOffer, companyToMerchant } from '@/lib/campaignMap';
import type { CampaignEligibility } from '@/lib/campaigns';
import {
  clearSavedAddress,
  readSavedAddress,
  reverseNominatim,
  writeSavedAddress,
  type SavedAddress,
} from '@/lib/address';
import { requestPushDispatch } from '@/lib/companyPush';
import { rememberDeviceArea } from '@/lib/devicePush';
import { locationHint, noteLocationAnchor, requestDeviceLocation, watchSignificantMoves, type LocationFailure } from '@/lib/location';
import { distanceMeters, hasValidCoords } from '@/lib/geo';
import { visibleMapItems } from '@/lib/mapVisibility';
import { nearbyStories, readSeenStoryIds, useLiveStories } from '@/lib/stories';
import { subscribeTables } from '@/lib/live';
import { applyCampaignOffers, applyCompanyToCatalog, subscribeCampaignTable } from '@/lib/campaignLive';
import { listFavoriteIds } from '@/lib/favorites';
import { matchesExploreFeed, matchesSector, type ExploreCategoryId } from '@/lib/sectors';
import { ISTANBUL_CENTER } from '@/lib/mapTiles';
import type { MapFlyTo } from '@/components/maps/QaplaMapFrame';

const AdminPanelScreen = lazy(() => import('@/components/AdminPanel').then((m) => ({ default: m.AdminPanelScreen })));
const MerchantPanelScreen = lazy(() => import('@/components/MerchantPanel').then((m) => ({ default: m.MerchantPanelScreen })));
const MerchantProfileScreen = lazy(() => import('@/components/MerchantProfileScreen').then((m) => ({ default: m.MerchantProfileScreen })));
const MerchantScreenGuard = lazy(() => import('@/components/MerchantScreenGuard').then((m) => ({ default: m.MerchantScreenGuard })));
const MerchantLoginScreen = lazy(() => import('@/components/MerchantGate').then((m) => ({ default: m.MerchantLoginScreen })));
const AdminLoginScreen = lazy(() => import('@/components/AdminGate').then((m) => ({ default: m.AdminLoginScreen })));
const BusinessRegisterPage = lazy(() => import('@/pages/BusinessRegister').then((m) => ({ default: m.BusinessRegisterPage })));
const BusinessPendingScreen = lazy(() => import('@/components/BusinessPendingScreen').then((m) => ({ default: m.BusinessPendingScreen })));
const BusinessProfile = lazy(() => import('@/pages/BusinessProfile').then((m) => ({ default: m.BusinessProfile })));
const StoryViewer = lazy(() => import('@/components/StoryViewer').then((m) => ({ default: m.StoryViewer })));
const SavedPlacesScreen = lazy(() => import('@/components/SavedPlacesScreen').then((m) => ({ default: m.SavedPlacesScreen })));
const ProfileTabScreen = lazy(() => import('@/components/SavedPlacesScreen').then((m) => ({ default: m.ProfileTabScreen })));
const VipSoonScreen = lazy(() => import('@/components/VipSoonScreen').then((m) => ({ default: m.VipSoonScreen })));
const UserRegister = lazy(() => import('@/pages/UserRegister').then((m) => ({ default: m.UserRegister })));

function TabFallback() {
  return (
    <div className="flex h-full min-h-0 items-center justify-center bg-[#eef3f1]">
      <Loader2 className="h-6 w-6 animate-spin text-mint-500" />
    </div>
  );
}

const KADIKOY_FALLBACK: SavedAddress = {
  label: 'İstanbul / Kadıköy',
  city: 'İstanbul',
  district: 'Kadıköy',
  neighborhood: 'Moda',
  latitude: ISTANBUL_CENTER.lat,
  longitude: ISTANBUL_CENTER.lng,
};

type Screen = 'home' | 'coupons' | 'saved' | 'profile' | 'settings' | 'vip' | 'merchant-login' | 'merchant' | 'business-register' | 'business-pending' | 'offer-detail' | 'coupon-detail' | 'admin-login' | 'admin' | 'company';
type Tab = 'home' | 'saved' | 'visits' | 'profile' | 'settings' | 'vip' | 'admin' | 'merchant';

const categoryIcons: Record<string, typeof Coffee> = {
  'Kafe': Coffee,
  'Yeme & İçme': Utensils,
  'Restoran': Utensils,
  'Spor': Dumbbell,
  'Güzellik': Scissors,
  'Market': ShoppingBag,
  'E-Ticaret': ShoppingBag,
  'Giyim': Shirt,
  'Dekorasyon': Palette,
  'Eğlence': Music,
};

function matchesExploreCategory(
  category: ExploreCategoryId,
  offer: OfferWithMerchant,
) {
  const merchant = offer.qapla_merchants;
  const haystack = `${offer.category} ${merchant?.category ?? ''}`;
  if (category === 'esnaf') return true;
  if (category === 'gelinlik') {
    return matchesSector(haystack, 'Gelinlik') || matchesSector(haystack, 'Giyim');
  }
  if (category === 'mobilya') return matchesSector(haystack, 'Mobilya');
  if (category === 'firsat') {
    return Boolean(offer.is_featured || merchant?.is_featured || getMsRemaining(offer.expires_at) < 3 * 3600000);
  }
  if (category === 'restoran') return matchesSector(haystack, 'Restoran');
  if (category === 'guzellik') return matchesSector(haystack, 'Güzellik');
  if (category === 'spor') return matchesSector(haystack, 'Spor');
  if (category === 'dekorasyon') return matchesSector(haystack, 'Dekorasyon');
  if (category === 'eglence') return matchesSector(haystack, 'Eğlence');
  return true;
}

function offerMeters(offer: OfferWithMerchant, origin: { latitude: number; longitude: number } | null) {
  const place = offer.qapla_merchants;
  if (!origin || !place || !hasValidCoords(place)) return Number.POSITIVE_INFINITY;
  return distanceMeters(origin.latitude, origin.longitude, place.latitude, place.longitude);
}

function matchesFeed(feed: ExploreFeedId, offer: OfferWithMerchant) {
  const merchant = offer.qapla_merchants;
  return matchesExploreFeed(feed, {
    category: `${offer.category ?? ''} ${merchant?.category ?? ''}`,
    title: offer.title,
    featured: Boolean(offer.is_featured || merchant?.is_featured),
    expiresSoon: getMsRemaining(offer.expires_at) > 0 && getMsRemaining(offer.expires_at) < 6 * 3600000,
  });
}

export default function App() {
  return (
    <AuthProvider>
      <AppShell />
    </AuthProvider>
  );
}

function AppShell() {
  useReach();
  const { user, profile, businessApplication, loading: authLoading, signOut } = useAuth();
  const [screen, setScreen] = useState<Screen>('home');
  const [activeTab, setActiveTab] = useState<Tab>('home');
  const [selectedOffer, setSelectedOffer] = useState<OfferWithMerchant | null>(null);
  const [selectedMerchant, setSelectedMerchant] = useState<Merchant | null>(null);
  const [activeCoupon, setActiveCoupon] = useState<CouponClaim | null>(null);
  const [merchants, setMerchants] = useState<Merchant[]>([]);
  const merchantsRef = useRef(merchants);
  merchantsRef.current = merchants;
  const [offers, setOffers] = useState<OfferWithMerchant[]>([]);
  const offersRef = useRef(offers);
  offersRef.current = offers;
  const catalogGen = useRef(0);
  const catalogReady = useRef(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [showSplash, setShowSplash] = useState(true);
  const [history, setHistory] = useState<Screen[]>(['home']);
  const [authOpen, setAuthOpen] = useState(false);
  const [claimTrigger, setClaimTrigger] = useState(0);
  const [exploreSector, setExploreSector] = useState<ExploreCategoryId>('esnaf');
  const [merchantTab, setMerchantTab] = useState<MerchantTab>('code');
  const [adminTab, setAdminTab] = useState<'list' | 'vip'>('list');
  const claimAfterAuth = useRef(false);
  const cornerTap = useSecretTaps(5);

  const openAuth = (resumeClaim = false) => {
    claimAfterAuth.current = resumeClaim;
    setAuthOpen(true);
  };

  const dismissSplash = useCallback(() => {
    setShowSplash(false);
  }, []);

  useEffect(() => {
    void startDevicePush();
    return () => {
      void stopDevicePush();
    };
  }, []);

  useEffect(() => {
    syncPushIdentity({
      userId: user?.id || profile?.id || null,
      companyId: profile?.company_id ?? null,
      role: profile?.role ?? null,
    });
  }, [profile?.company_id, profile?.id, profile?.role, user?.id]);

  const goTo = useCallback((next: Screen, options?: { reset?: boolean }) => {
    if (options?.reset) {
      setHistory([next]);
    } else {
      setHistory((stack) => (stack[stack.length - 1] === next ? stack : [...stack, next]));
    }
    setScreen(next);
    if (next === 'home') setActiveTab('home');
    if (next === 'coupons') setActiveTab('visits');
    if (next === 'saved') setActiveTab('saved');
    if (next === 'profile') setActiveTab('profile');
    if (next === 'settings') setActiveTab('settings');
    if (next === 'vip') setActiveTab('vip');
    if (next === 'admin') setActiveTab('admin');
    if (next === 'merchant') setActiveTab('merchant');
  }, []);

  const goBack = useCallback(() => {
    if (showSplash) {
      if (Capacitor.isNativePlatform()) {
        void CapacitorApp.exitApp();
      }
      return;
    }

    if (history.length <= 1) {
      if (Capacitor.isNativePlatform()) {
        void CapacitorApp.exitApp();
      }
      return;
    }

    const nextStack = history.slice(0, -1);
    const previous = nextStack[nextStack.length - 1];
    setHistory(nextStack);
    setScreen(previous);
    if (previous === 'home') setActiveTab('home');
    if (previous === 'coupons') setActiveTab('visits');
    if (previous === 'saved') setActiveTab('saved');
    if (previous === 'profile') setActiveTab('profile');
    if (previous === 'settings') setActiveTab('settings');
    if (previous === 'vip') setActiveTab('vip');
    if (previous === 'admin') setActiveTab('admin');
    if (previous === 'merchant') setActiveTab('merchant');
  }, [history, showSplash]);

  useAndroidBackButton(goBack);

  const goByRole = useCallback((destination: AppDestination) => {
    if (destination === 'admin') {
      goTo('admin', { reset: true });
      return;
    }
    if (destination === 'merchant') {
      goTo('merchant', { reset: true });
      return;
    }
    if (destination === 'pending') {
      goTo('business-pending', { reset: true });
      return;
    }
    setExploreSector('esnaf');
    goTo('home', { reset: true });
  }, [goTo]);

  const routedKey = useRef<string | null>(null);

  useEffect(() => {
    if (authLoading || showSplash) return;

    if (!user) {
      routedKey.current = null;
      if (screen === 'admin' || screen === 'merchant') {
        goTo('home', { reset: true });
      }
      return;
    }

    if (!profile) return;

    const destination = destinationForAccount(profile.role, businessApplication, user.signupKind);

    if (screen === 'business-pending' || screen === 'business-register') {
      if (destination === 'merchant' || destination === 'admin') goByRole(destination);
      return;
    }

    const key = `${user.id}:${profile.role}:${businessApplication?.status ?? 'none'}:${destination}`;
    if (routedKey.current === key) return;
    routedKey.current = key;

    if (destination === 'merchant' && screen === 'merchant') return;

    if (destination === 'home') {
      if (claimAfterAuth.current) return;
      if (screen === 'offer-detail' || screen === 'coupon-detail' || screen === 'coupons') return;
      if (screen === 'merchant') return;
    }

    goByRole(destination);
  }, [authLoading, user, profile, businessApplication, screen, goByRole, goTo, showSplash]);

  const openAdmin = () => {
    dismissSplash();
    goTo(profile?.role === 'admin' ? 'admin' : 'admin-login');
  };

  const loadData = useCallback(async (silent = false) => {
    const ticket = ++catalogGen.current;
    if (!silent) setLoading(true);
    setError(null);
    try {
      const [companies, campaigns] = await Promise.all([
        listCompaniesAction(),
        listCampaignsAction(),
      ]);
      if (ticket !== catalogGen.current) return;
      catalogReady.current = true;
      setOffers(campaigns.map(campaignToOffer).filter((item) => item.id && !item.id.startsWith('demo-')));
      setMerchants(companies.map(companyToMerchant).filter((item) => hasValidCoords(item) && !item.id.startsWith('demo-')));
    } catch (err) {
      if (ticket !== catalogGen.current) return;
      setMerchants([]);
      setOffers([]);
      setError(err instanceof Error ? err.message : 'Harita verisi yüklenemedi');
    } finally {
      if (!silent && ticket === catalogGen.current) setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (showSplash) return;
    void loadData();
  }, [loadData, showSplash]);
  useEffect(() => {
    if (showSplash) return;
    return subscribeTables(
      ['companies', 'campaigns', 'coupon_tickets', 'user_redemptions'],
      (change) => {
        if (change?.table === 'companies') {
          const next = applyCompanyToCatalog(merchantsRef.current, offersRef.current, {
            eventType: change.eventType,
            new: change.new,
            old: change.old,
          });
          setMerchants(next.merchants);
          setOffers(next.offers);
        }
        if (change?.table === 'campaigns' && change.eventType === 'DELETE') {
          const id = String(change.old?.id ?? '');
          if (id) setOffers((current) => current.filter((item) => item.id !== id));
        }
        void loadData(true);
        void requestPushDispatch();
      },
    );
  }, [loadData, showSplash]);

  useEffect(() => {
    if (showSplash) return;
    return subscribeCampaignTable((change) => {
      const id = String(change.row?.id ?? change.previous?.id ?? '');
      console.log('Kampanya ekranı güncellendi', { event: change.eventType, id });
      setOffers((current) => applyCampaignOffers(current, merchantsRef.current, change));
    });
  }, [showSplash]);

  const openOffer = (offer: OfferWithMerchant) => {
    setSelectedOffer(offer);
    goTo('offer-detail');
  };

  const handleCouponCreated = (coupon: CouponClaim) => {
    setActiveCoupon(coupon);
    void loadData();
    goTo('coupon-detail');
  };

  const showHome = () => goTo('home', { reset: true });
  const showCoupons = () => {
    if (profile?.role === 'admin') return;
    if (profile?.role === 'merchant') {
      setMerchantTab('code');
      goTo('merchant', { reset: true });
      return;
    }
    if (!user) {
      openAuth(false);
      return;
    }
    goTo('coupons', { reset: true });
  };
  const showSaved = () => {
    if (profile?.role === 'merchant') {
      goTo('profile', { reset: true });
      return;
    }
    if (!user) {
      openAuth(false);
      return;
    }
    goTo('saved', { reset: true });
  };
  const showProfile = () => {
    if (profile?.role === 'merchant') {
      goTo('profile', { reset: true });
      return;
    }
    if (!user) {
      openAuth(false);
      return;
    }
    goTo('profile', { reset: true });
  };
  const showSettings = () => {
    if (!user) {
      openAuth(false);
      return;
    }
    goTo('settings', { reset: true });
  };
  const showMerchant = (tab: MerchantTab = 'code') => {
    setMerchantTab(tab);
    goTo('merchant', { reset: true });
    if (tab === 'vip') setActiveTab('vip');
  };
  const showAdmin = (tab: 'list' | 'vip' = 'list') => {
    setAdminTab(tab);
    goTo('admin', { reset: true });
    if (tab === 'vip') setActiveTab('vip');
  };
  const showVip = () => {
    if (profile?.role === 'merchant') {
      showMerchant('vip');
      return;
    }
    if (profile?.role === 'admin') {
      showAdmin('vip');
      return;
    }
    goTo('vip', { reset: true });
  };

  useEffect(() => {
    if (screen !== 'home') return;
    window.requestAnimationFrame(() => window.dispatchEvent(new Event('resize')));
  }, [screen]);

  useEffect(() => {
    if (loading || screen !== 'company' || !selectedMerchant) return;
    if (!catalogReady.current) return;
    if (!merchants.some((item) => item.id === selectedMerchant.id)) {
      setSelectedMerchant(null);
      goTo('home', { reset: true });
      return;
    }
    const live = merchants.find((item) => item.id === selectedMerchant.id);
    if (live && (live.name !== selectedMerchant.name || live.address !== selectedMerchant.address || live.logo_url !== selectedMerchant.logo_url)) {
      setSelectedMerchant(live);
    }
  }, [goTo, loading, merchants, screen, selectedMerchant]);

  useEffect(() => {
    if (loading || screen !== 'offer-detail' || !selectedOffer) return;
    const live = offers.find((item) => item.id === selectedOffer.id);
    if (!live) {
      setSelectedOffer(null);
      goTo('home', { reset: true });
      return;
    }
    if (live.title !== selectedOffer.title || live.is_active !== selectedOffer.is_active || live.expires_at !== selectedOffer.expires_at) {
      setSelectedOffer(live);
    }
  }, [goTo, loading, offers, screen, selectedOffer]);

  const adminChrome = screen === 'admin' || screen === 'admin-login';

  return (
    <div className={`h-full min-h-0 w-full flex justify-center overflow-hidden ${adminChrome ? 'bg-cream-100' : 'bg-cream-100'}`}>
      <div className={`relative h-full w-full max-w-none flex flex-col overflow-hidden ${adminChrome ? 'bg-[#eef3f1] text-mint-900' : 'bg-cream-50'}`}>
        {showSplash && (
          <SplashScreen onDone={dismissSplash} onSecretUnlock={openAdmin} />
        )}
        <div className="app-tab-stage relative flex-1 min-h-0 overflow-hidden">
        <div className={screen === 'home' ? 'h-full min-h-0' : 'hidden'}>
          {!showSplash && <HomeScreen
            merchants={merchants}
            offers={offers}
            loading={loading}
            error={error}
            onOfferClick={openOffer}
            onMerchantLogin={() => {
              if (profile?.role === 'merchant') {
                showMerchant('code');
                return;
              }
              goTo('merchant-login');
            }}
            onBusinessRegister={() => goTo('business-register')}
            onRetry={loadData}
            onSecretAdmin={openAdmin}
            userEmail={user?.email ?? null}
            welcomeName={user ? welcomeLine(profile, user.email) : null}
            category={exploreSector}
            onCategory={setExploreSector}
            onOpenAuth={() => openAuth(false)}
            hideMemberAuth={profile?.role === 'admin'}
            enableLocation={!showSplash}
            onOpenCompany={(merchant) => {
              setSelectedMerchant(merchant);
              goTo('company');
            }}
            onVisits={showCoupons}
            onSaved={showSaved}
          />}
        </div>
        <Suspense fallback={<TabFallback />}>
        {screen === 'company' && selectedMerchant && (
          <BusinessProfile merchant={selectedMerchant} offers={offers} onBack={goBack} onOffer={openOffer} onRequireAuth={() => openAuth(false)} />
        )}
        {screen === 'coupons' && (
          <CouponsScreen
            title="Ziyaretler"
            subtitle="Kullandığın ve açık kuponların"
            onBack={goBack}
            onViewCoupon={(c) => { setActiveCoupon(c); goTo('coupon-detail'); }}
            onRequireAuth={() => openAuth(false)}
          />
        )}
        {screen === 'saved' && (
          <SavedPlacesScreen
            merchants={merchants.filter((merchant) => user && listFavoriteIds(user.id).includes(merchant.id))}
            onOpen={(merchant) => {
              setSelectedMerchant(merchant);
              goTo('company');
            }}
            onRequireAuth={() => openAuth(false)}
          />
        )}
        {screen === 'profile' && profile?.role === 'merchant' ? (
          <MerchantProfileScreen
            onExplore={showHome}
            onVip={showVip}
            onChanged={() => { void loadData(); }}
          />
        ) : screen === 'profile' ? (
          <ProfileTabScreen
            merchants={merchants}
            onRequireAuth={() => openAuth(false)}
            onExplore={showHome}
            onVisits={showCoupons}
            onSaved={showSaved}
            onVip={showVip}
            onOpenCompany={(merchant) => {
              setSelectedMerchant(merchant);
              goTo('company');
            }}
          />
        ) : null}
        {screen === 'settings' && (
          <ProfileTabScreen
            merchants={merchants}
            onRequireAuth={() => openAuth(false)}
            onExplore={showHome}
            onVisits={showCoupons}
            onSaved={showSaved}
            onVip={showVip}
            onOpenCompany={(merchant) => {
              setSelectedMerchant(merchant);
              goTo('company');
            }}
          />
        )}
        {screen === 'vip' && <VipSoonScreen />}
        {screen === 'business-register' && (
          <div className="h-full min-h-0">
            <BusinessRegisterPage
              onBack={goBack}
              onPending={() => goTo('business-pending', { reset: true })}
            />
          </div>
        )}
        {screen === 'business-pending' && (
          <div className="h-full min-h-0">
            <BusinessPendingScreen
              onBack={() => { void signOut(); goTo('home', { reset: true }); }}
              onSignOut={() => { void signOut(); goTo('home', { reset: true }); }}
              companyName={businessApplication?.company_name}
            />
          </div>
        )}
        {screen === 'merchant-login' && (
          <div className="h-full min-h-0">
            <MerchantLoginScreen
              onBack={goBack}
              onSuccess={goByRole}
              onRegister={() => goTo('business-register')}
            />
          </div>
        )}
        {screen === 'merchant' && (
          <MerchantScreenGuard onBack={() => goTo('home', { reset: true })}>
            <MerchantPanelScreen
              initialTab={merchantTab}
              onBack={() => goTo('home', { reset: true })}
              onChanged={() => { void loadData(); }}
            />
          </MerchantScreenGuard>
        )}
        {screen === 'admin-login' && (
          <AdminLoginScreen onBack={goBack} onSuccess={goByRole} />
        )}
        {screen === 'admin' && (
          <AdminPanelScreen
            initialTab={adminTab}
            onBack={() => goTo('home', { reset: true })}
            onChanged={() => { void loadData(); }}
          />
        )}
        {screen === 'offer-detail' && selectedOffer && (
          <OfferDetailScreen
            offer={selectedOffer}
            onBack={goBack}
            onClaimed={handleCouponCreated}
            onRequireAuth={() => openAuth(true)}
            claimTrigger={claimTrigger}
            onOpenCompany={(merchant) => {
              setSelectedMerchant(merchant);
              goTo('company');
            }}
          />
        )}
        {screen === 'coupon-detail' && activeCoupon && (
          <CouponDetailScreen
            coupon={activeCoupon}
            offers={offers}
            onBack={() => { setActiveCoupon(null); goBack(); }}
            onChanged={(next) => {
              setActiveCoupon(next);
              if (!next) goBack();
            }}
          />
        )}
        </Suspense>
        </div>

        {!showSplash && (screen === 'home' || screen === 'coupons' || screen === 'saved' || screen === 'profile' || screen === 'settings' || screen === 'vip' || screen === 'admin' || (screen === 'merchant' && profile?.role === 'merchant')) && (
          <BottomNav
            role={profile?.role ?? null}
            activeTab={activeTab}
            onHome={showHome}
            onSaved={showSaved}
            onVisits={showCoupons}
            onProfile={showProfile}
            onSettings={showSettings}
            onMerchant={() => showMerchant('code')}
            onAdmin={() => showAdmin('list')}
            onVip={showVip}
          />
        )}
        <button
          type="button"
          tabIndex={-1}
          aria-hidden
          className="absolute bottom-[5.5rem] right-1 w-6 h-6 z-40 opacity-0"
          onClick={() => {
            if (cornerTap()) openAdmin();
          }}
        />
        <Suspense fallback={null}>
        <UserRegister
          open={authOpen && profile?.role !== 'admin'}
          onClose={() => {
            claimAfterAuth.current = false;
            setAuthOpen(false);
          }}
          onSuccess={(destination) => {
            const resume = claimAfterAuth.current;
            claimAfterAuth.current = false;
            setAuthOpen(false);
            dismissSplash();
            if (destination === 'pending') {
              goTo('business-pending', { reset: true });
            } else if (destination === 'admin' || destination === 'merchant') {
              goByRole(destination);
            } else {
              setExploreSector('esnaf');
              goTo('home', { reset: true });
            }
            if (resume) setClaimTrigger((value) => value + 1);
          }}
        />
        </Suspense>
        <ErrorToastHost />
      </div>
    </div>
  );
}

const HomeScreen = memo(function HomeScreen({
  merchants, offers, loading, error, onOfferClick, onMerchantLogin, onBusinessRegister, onRetry, onSecretAdmin,
  userEmail: _userEmail, welcomeName: _welcomeName, onOpenAuth, hideMemberAuth: _hideMemberAuth, onOpenCompany, category, onCategory, enableLocation = true,
  onVisits, onSaved,
}: {
  merchants: Merchant[];
  offers: OfferWithMerchant[];
  loading: boolean;
  error: string | null;
  onOfferClick: (o: OfferWithMerchant) => void;
  onMerchantLogin: () => void;
  onBusinessRegister?: () => void;
  onRetry: () => void;
  onSecretAdmin: () => void;
  userEmail: string | null;
  welcomeName: string | null;
  onOpenAuth: () => void;
  hideMemberAuth?: boolean;
  onOpenCompany: (merchant: Merchant) => void;
  category: ExploreCategoryId;
  onCategory: (id: ExploreCategoryId) => void;
  enableLocation?: boolean;
  onVisits?: () => void;
  onSaved?: () => void;
}) {
  const [address, setAddress] = useState<SavedAddress | null>(() => readSavedAddress() ?? KADIKOY_FALLBACK);
  const [sheetHeight, setSheetHeight] = useState(SHEET_PEEK);
  const [locating, setLocating] = useState(false);
  const [locationReason, setLocationReason] = useState<LocationFailure | null>(null);
  const [focusToken, setFocusToken] = useState(1);
  const [pinFly, setPinFly] = useState<MapFlyTo | null>(null);
  const [previewMerchant, setPreviewMerchant] = useState<Merchant | null>(null);
  const [previewOffer, setPreviewOffer] = useState<OfferWithMerchant | null>(null);
  const [sheetCollapsed, setSheetCollapsed] = useState(true);
  const [feed, setFeed] = useState<ExploreFeedId>('all');
  const [clock, setClock] = useState(0);
  const [storyOpen, setStoryOpen] = useState(false);
  const [sheetQuery, setSheetQuery] = useState('');
  const logoTap = useSecretTaps(5);
  const manualLock = useRef(false);
  const { user, profile } = useAuth();
  const liveStories = useLiveStories();
  const favoriteMerchants = merchants.filter((merchant) => user && listFavoriteIds(user.id).includes(merchant.id));

  useEffect(() => {
    if (!previewOffer) return;
    const live = offers.find((item) => item.id === previewOffer.id);
    if (!live) {
      setPreviewOffer(null);
      setPreviewMerchant(null);
      return;
    }
    if (live !== previewOffer) setPreviewOffer(live);
  }, [offers, previewOffer]);

  useEffect(() => {
    if (!previewMerchant || merchants.length === 0) return;
    const live = merchants.find((item) => item.id === previewMerchant.id);
    if (!live) {
      setPreviewMerchant(null);
      setPreviewOffer(null);
      return;
    }
    if (live.name !== previewMerchant.name || live.address !== previewMerchant.address || live.logo_url !== previewMerchant.logo_url) {
      setPreviewMerchant(live);
    }
  }, [merchants, previewMerchant]);

  const origin = address && hasValidCoords(address) ? address : null;
  const storyFeed = nearbyStories(origin, liveStories);
  const unseenStoryCount = storyFeed.filter((item) => !readSeenStoryIds().includes(item.id)).length;
  const storyUnseen = unseenStoryCount > 0;
  const nearbyMerchants = visibleMapItems(merchants, origin, profile?.role, profile?.company_id);
  const nearbyIds = new Set(nearbyMerchants.map((item) => item.id));
  const nearbyOffers = offers.filter((offer) => {
    const merchant = offer.qapla_merchants ?? merchants.find((item) => item.id === offer.merchant_id);
    return Boolean(merchant && nearbyIds.has(merchant.id));
  });
  const searchQ = sheetQuery.trim().toLocaleLowerCase('tr');
  const offerSearchHay = (offer: OfferWithMerchant) => {
    const merchant = offer.qapla_merchants;
    return `${offer.title} ${merchant?.name ?? ''} ${offer.category} ${merchant?.category ?? ''}`.toLocaleLowerCase('tr');
  };
  const filteredOffers = nearbyOffers.filter((offer) => {
    if (!searchQ) return matchesExploreCategory(category, offer);
    return offerSearchHay(offer).includes(searchQ);
  });
  const campaignHits = (['esnaf', 'gelinlik', 'mobilya', 'restoran', 'firsat', 'guzellik', 'spor', 'dekorasyon', 'eglence'] as ExploreCategoryId[])
    .filter((id) => nearbyOffers.some((offer) => matchesExploreCategory(id, offer) && offerSearchHay(offer).includes(searchQ)));
  const mapOffers = nearbyOffers.filter((offer) => {
    const place = offer.qapla_merchants;
    return Boolean(offer.is_active && place && hasValidCoords(place) && getMsRemaining(offer.expires_at) > 0);
  });
  const sheetOffers = useMemo(() => {
    const base = searchQ ? filteredOffers : filteredOffers.filter((offer) => matchesFeed(feed, offer));
    return [...base].sort((a, b) => offerMeters(a, origin) - offerMeters(b, origin) || a.id.localeCompare(b.id));
  }, [feed, filteredOffers, origin, searchQ]);

  useEffect(() => {
    const id = window.setInterval(() => setClock((value) => value + 1), 1000);
    return () => window.clearInterval(id);
  }, []);

  const pickMapLocation = async (latitude: number, longitude: number, source: 'gps' | 'manual' = 'manual') => {
    try {
      if (source === 'manual') manualLock.current = true;
      const resolved = await reverseNominatim(latitude, longitude);
      const next = resolved ?? {
        label: source === 'gps' ? 'Konumun' : `Harita · ${latitude.toFixed(4)}, ${longitude.toFixed(4)}`,
        city: '',
        district: '',
        neighborhood: '',
        latitude,
        longitude,
      };
      writeSavedAddress(next);
      setAddress(next);
      void rememberDeviceArea(next.latitude, next.longitude);
      setLocationReason(null);
      if (source === 'gps') {
        setFocusToken((value) => value + 1);
      }
    } catch {
      setAddress({
        label: 'Seçilen konum',
        city: '',
        district: '',
        neighborhood: '',
        latitude,
        longitude,
      });
    }
  };

  const askDeviceLocation = useCallback(async () => {
    setLocating(true);
    try {
      const result = await requestDeviceLocation();
      if (manualLock.current) return;
      if (!result.ok) {
        if (!manualLock.current) setLocationReason(result.reason);
        setAddress((current) => current ?? KADIKOY_FALLBACK);
        return;
      }
      noteLocationAnchor({ latitude: result.latitude, longitude: result.longitude });
      await pickMapLocation(result.latitude, result.longitude, 'gps');
    } catch {
      if (!manualLock.current) setLocationReason('unavailable');
    } finally {
      setLocating(false);
    }
  }, []);

  const pickRef = useRef(pickMapLocation);
  pickRef.current = pickMapLocation;

  useEffect(() => {
    if (!enableLocation) return;
    const saved = readSavedAddress();
    if (saved && hasValidCoords(saved)) noteLocationAnchor(saved);
    return watchSignificantMoves((coords) => {
      if (manualLock.current) return;
      void pickRef.current(coords.latitude, coords.longitude, 'gps');
    }, (reason) => {
      if (!manualLock.current) setLocationReason(reason);
    });
  }, [enableLocation]);

  const openMerchantPin = (merchant: Merchant) => {
    const offer = offers.find((item) => item.merchant_id === merchant.id
      || item.qapla_merchants?.id === merchant.id) ?? null;
    setPreviewMerchant(merchant);
    setPreviewOffer(offer);
    setSheetCollapsed(true);
    if (hasValidCoords(merchant)) {
      setPinFly({
        lat: merchant.latitude,
        lng: merchant.longitude,
        zoom: 16,
        token: Date.now(),
      });
    }
  };

  const openPinCard = (offer: OfferWithMerchant) => {
    const merchant = offer.qapla_merchants;
    if (!merchant) return;
    setPreviewOffer(offer);
    setPreviewMerchant(merchant);
    setSheetCollapsed(true);
    if (hasValidCoords(merchant)) {
      setPinFly({
        lat: merchant.latitude,
        lng: merchant.longitude,
        zoom: 16,
        token: Date.now(),
      });
    }
  };

  const overlayBottom = (sheetCollapsed ? SHEET_PEEK : sheetHeight) + EXPLORE_NAV_CLEARANCE;

  return (
    <div className="relative h-full min-h-0 flex-1 overflow-hidden bg-[#e7ecea]">
      <ExploreMap
        offers={mapOffers}
        userAddress={address}
        sheetOffset={overlayBottom}
        gesturesLocked={false}
        flyTo={
          pinFly ?? (
            focusToken > 0 && address && hasValidCoords(address)
              ? { lat: address.latitude, lng: address.longitude, zoom: 15, token: focusToken }
              : null
          )
        }
        onPickLocation={(lat, lng) => {
          setPreviewMerchant(null);
          setPreviewOffer(null);
          void pickMapLocation(lat, lng, 'manual');
        }}
        onPreviewOffer={openPinCard}
      />

      <MapZoomControls
        locating={locating}
        hidden={!sheetCollapsed}
        onLocate={() => {
          manualLock.current = false;
          void askDeviceLocation();
        }}
      />

      <ExploreTopBar
        merchants={nearbyMerchants}
        offers={filteredOffers}
        favoriteMerchants={favoriteMerchants}
        onSector={onCategory}
        onFavorite={onOpenCompany}
        onRequireAuth={onOpenAuth}
        onSecretAdmin={() => {
          if (logoTap()) onSecretAdmin();
        }}
        onPickMerchant={openMerchantPin}
        onVisits={onVisits}
        onSaved={onSaved}
        onMerchantLogin={onMerchantLogin}
        onBusinessRegister={onBusinessRegister}
        storyCount={unseenStoryCount}
        storyUnseen={storyUnseen}
        onOpenStories={() => setStoryOpen(true)}
        onPickAddress={(next) => {
          manualLock.current = true;
          writeSavedAddress(next);
          setAddress(next);
          void rememberDeviceArea(next.latitude, next.longitude);
          setLocationReason(null);
          setPreviewMerchant(null);
          setPreviewOffer(null);
          setFocusToken((value) => value + 1);
        }}
      />

      {previewMerchant ? (
        <div
          className="pointer-events-auto absolute inset-x-3 z-[1180]"
          style={{ bottom: overlayBottom + 8 }}
        >
          <MapPlaceCard
            merchant={previewMerchant}
            offer={previewOffer ?? offers.find((item) => item.merchant_id === previewMerchant.id
                || item.qapla_merchants?.id === previewMerchant.id
                || item.qapla_merchants?.name === previewMerchant.name) ?? null}
            offers={offers.filter((item) => item.is_active && getMsRemaining(item.expires_at) > 0 && (item.merchant_id === previewMerchant.id || item.qapla_merchants?.id === previewMerchant.id))}
            origin={address}
            onInspectCampaign={(picked) => {
              const offer = picked ?? previewOffer ?? offers.find((item) => item.merchant_id === previewMerchant.id
                || item.qapla_merchants?.id === previewMerchant.id
                || item.qapla_merchants?.name === previewMerchant.name) ?? null;
              setPreviewMerchant(null);
              setPreviewOffer(null);
              if (offer) onOfferClick(offer);
            }}
            onOpenProfile={() => {
              const selected = previewMerchant;
              setPreviewMerchant(null);
              setPreviewOffer(null);
              onOpenCompany(selected);
            }}
          />
        </div>
      ) : null}

      <ExploreSheet
        category={category}
        locationHint={origin ? null : locationHint(locationReason)}
        onCategory={onCategory}
        onHeightChange={setSheetHeight}
        collapsed={sheetCollapsed}
        onToggle={() => setSheetCollapsed((current) => !current)}
        searchQuery={sheetQuery}
        onSearchQuery={setSheetQuery}
        campaignHits={searchQ ? campaignHits : []}
        feed={feed}
        onFeed={setFeed}
        origin={origin}
        places={nearbyMerchants.map((item) => ({ id: item.id, latitude: item.latitude, longitude: item.longitude }))}
      >
        {loading ? (
          <div className="flex flex-col items-center py-10">
            <Loader2 className="h-7 w-7 animate-spin text-mint-500" />
            <p className="mt-2 text-sm text-mint-600">Fırsatlar yükleniyor...</p>
          </div>
        ) : error ? (
          <div className="px-2 py-8 text-center">
            <AlertCircle className="mx-auto h-8 w-8 text-red-400" />
            <p className="mt-2 text-sm text-gray-600">{error}</p>
            <button type="button" onClick={onRetry} className="btn-primary mt-3">Tekrar dene</button>
          </div>
        ) : (
          <>
            <div className="mb-2 mt-4 flex items-baseline justify-between px-0.5">
              <h2 className="text-[15px] font-extrabold text-slate-800">Kampanya Akışı</h2>
              <span className="text-[11px] font-semibold text-slate-400">{sheetOffers.length}</span>
            </div>
            {sheetOffers.length === 0 ? (
              <p className="py-6 text-center text-sm text-gray-400">
                {searchQ ? 'Bu aramaya uyan kampanya yok.' : profile?.role === 'admin' ? 'Haritada kampanya yok.' : '2 km içinde bu kategoride kampanya yok.'}
              </p>
            ) : (
              <div className="grid grid-cols-2 gap-2">
                {groupOffersByMerchant(sheetOffers).map((group, index) => (
                  group.length > 1 ? (
                    <div key={group[0].merchant_id} className="col-span-2 space-y-1.5">
                      {group.map((offer) => (
                        <CompactOfferCard
                          key={offer.id}
                          variant="row"
                          pulse={clock}
                          offer={offer}
                          onClick={() => onOfferClick(offer)}
                          onOpenCompany={() => {
                            if (offer.qapla_merchants) onOpenCompany(offer.qapla_merchants);
                          }}
                        />
                      ))}
                    </div>
                  ) : (
                    <CompactOfferCard
                      key={group[0].id}
                      variant="grid"
                      tone={index}
                      pulse={clock}
                      offer={group[0]}
                      onClick={() => onOfferClick(group[0])}
                      onOpenCompany={() => {
                        if (group[0].qapla_merchants) onOpenCompany(group[0].qapla_merchants);
                      }}
                    />
                  )
                ))}
              </div>
            )}
          </>
        )}
      </ExploreSheet>
      {storyOpen ? (
        <Suspense fallback={null}>
          <StoryViewer
            stories={storyFeed}
            isVerified={(companyId) => Boolean(companyId && nearbyMerchants.some((item) => item.id === companyId && item.is_verified))}
            onClose={() => setStoryOpen(false)}
          />
        </Suspense>
      ) : null}
    </div>
  );
});

const GRID_TONES = [
  'from-[#2f6fe0] to-[#5aa7ff]',
  'from-[#2eaf6a] to-[#7dcea0]',
  'from-[#f39c12] to-[#f6c56b]',
  'from-[#3d8bfd] to-[#8ec5ff]',
];

function groupOffersByMerchant(offers: OfferWithMerchant[]) {
  const groups: OfferWithMerchant[][] = [];
  const index = new Map<string, number>();
  for (const offer of offers) {
    const id = offer.merchant_id || offer.qapla_merchants?.id || offer.id;
    const at = index.get(id);
    if (at == null) {
      index.set(id, groups.length);
      groups.push([offer]);
    } else {
      groups[at].push(offer);
    }
  }
  return groups;
}

function sheetCountdown(expiresAt: string) {
  const diff = new Date(expiresAt).getTime() - Date.now();
  if (diff <= 0) return 'Süre doldu';
  const h = Math.floor(diff / 3600000);
  const m = Math.floor((diff % 3600000) / 60000);
  const s = Math.floor((diff % 60000) / 1000);
  if (h > 0) return `${h}Sa ${m}d ${s}sn`;
  return `${m}d ${s}sn`;
}

function CompactOfferCard({
  offer,
  onClick,
  onOpenCompany,
  variant = 'row',
  tone = 0,
  pulse,
}: {
  offer: OfferWithMerchant;
  onClick: () => void;
  onOpenCompany: () => void;
  variant?: 'tile' | 'row' | 'grid';
  tone?: number;
  pulse?: number;
}) {
  const merchant = offer.qapla_merchants;
  const [, setTick] = useState(0);
  useEffect(() => {
    if (pulse != null) return;
    const id = window.setInterval(() => setTick((value) => value + 1), 1000);
    return () => window.clearInterval(id);
  }, [pulse]);
  if (!merchant) return null;
  const Icon = categoryIcons[offer.category] || Tag;
  const countdown = variant === 'grid' ? sheetCountdown(offer.expires_at) : formatTimeRemaining(offer.expires_at);
  void pulse;

  if (variant === 'grid') {
    const wash = GRID_TONES[tone % GRID_TONES.length];
    return (
      <article className="overflow-hidden rounded-[1.35rem] bg-white shadow-md ring-1 ring-slate-100">
        <button type="button" onClick={onClick} className="w-full text-left">
          <div className={`relative flex h-[7.2rem] items-center justify-center bg-gradient-to-br ${wash}`}>
            {offer.image_url ? (
              <img src={offer.image_url} alt="" className="absolute inset-0 h-full w-full object-cover" />
            ) : (
              <Icon className="h-10 w-10 text-white/90" />
            )}
            <span className="absolute left-2 top-2 rounded-full bg-white/95 px-2 py-0.5 text-[11px] font-extrabold text-slate-800 shadow-sm">
              {offer.discount}
            </span>
            <span className="absolute bottom-2 left-1/2 inline-flex max-w-[92%] -translate-x-1/2 items-center gap-1 whitespace-nowrap rounded-full bg-black/25 px-2 py-0.5 text-[9px] font-extrabold text-white">
              <Clock className="h-3 w-3" />
              {countdown}
            </span>
          </div>
          <div className="px-2.5 pb-2 pt-2">
            <h3 className="line-clamp-2 min-h-[2.2rem] text-[12px] font-extrabold leading-tight text-slate-800">{offer.title}</h3>
            <FirmName name={merchant.name} verified={merchant.is_verified} className="mt-0.5 text-[11px] font-semibold text-slate-400" />
          </div>
        </button>
        <button
          type="button"
          onClick={onOpenCompany}
          className="mx-2.5 mb-2.5 w-[calc(100%-1.25rem)] rounded-full bg-[#2f6fe0] py-1.5 text-center text-[11px] font-extrabold text-white"
        >
          Firma profili
        </button>
      </article>
    );
  }

  if (variant === 'tile') {
    return (
      <article className="relative w-[10.6rem] shrink-0 snap-start overflow-hidden rounded-2xl bg-white shadow-lg ring-1 ring-[#00A884]/20">
        <button type="button" onClick={onClick} className="w-full text-left">
          <div className="relative h-[4.8rem]">
            {offer.image_url ? (
              <img src={offer.image_url} alt="" className="h-full w-full object-cover" />
            ) : (
              <div className="flex h-full items-center justify-center bg-[#00A884]/15">
                <Icon className="h-6 w-6 text-[#00A884]" />
              </div>
            )}
            <span className="absolute left-1.5 top-1.5 rounded-full bg-[#00A884] px-1.5 py-0.5 text-[9px] font-extrabold text-white shadow-md">
              {offer.discount}
            </span>
            <span className="absolute bottom-1.5 right-1.5 inline-flex items-center gap-0.5 rounded-full bg-[#00A884] px-1.5 py-0.5 text-[9px] font-extrabold text-white shadow-md">
              <Clock className="h-2.5 w-2.5" />
              {countdown}
            </span>
          </div>
          <div className="px-2 py-1.5">
            <h3 className="line-clamp-2 text-[11px] font-extrabold leading-tight text-slate-800">{offer.title}</h3>
            <FirmName name={merchant.name} verified={merchant.is_verified} className="mt-1 text-[9px] font-bold text-slate-400" />
          </div>
        </button>
        <button
          type="button"
          onClick={onOpenCompany}
          className="w-full border-t border-[#00A884]/15 bg-[#00A884]/5 px-2 py-1.5 text-center text-[10px] font-extrabold text-[#00A884]"
        >
          Firma profili
        </button>
      </article>
    );
  }

  return (
    <article className="overflow-hidden rounded-2xl bg-white shadow-lg ring-1 ring-[#00A884]/20">
      <div className="flex items-stretch">
        <button type="button" onClick={onClick} className="flex min-w-0 flex-1 items-center gap-2.5 py-2 pl-2 pr-2 text-left">
          <div className="relative h-14 w-14 shrink-0 overflow-hidden rounded-2xl">
            {offer.image_url ? (
              <img src={offer.image_url} alt="" className="h-full w-full object-cover" />
            ) : (
              <div className="flex h-full w-full items-center justify-center bg-[#00A884]/15">
                <Icon className="h-4 w-4 text-[#00A884]" />
              </div>
            )}
          </div>
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-1.5">
              <span className="rounded-full bg-[#00A884] px-1.5 py-px text-[9px] font-extrabold text-white">{offer.discount}</span>
              <span className="inline-flex items-center gap-0.5 rounded-full bg-[#00A884]/10 px-1.5 py-px text-[10px] font-extrabold text-[#00A884]">
                <Clock className="h-2.5 w-2.5" />
                {countdown}
              </span>
            </div>
            <h3 className="mt-0.5 truncate text-[13px] font-extrabold leading-tight text-slate-800">{offer.title}</h3>
            <FirmName name={merchant.name} verified={merchant.is_verified} className="text-[10px] text-gray-400" />
          </div>
        </button>
        <button
          type="button"
          onClick={onOpenCompany}
          className="shrink-0 self-stretch bg-[#00A884]/5 px-2.5 text-[10px] font-extrabold text-[#00A884]"
        >
          Profil
        </button>
      </div>
    </article>
  );
}

function OfferDetailScreen({
  offer, onBack, onClaimed, onRequireAuth, claimTrigger, onOpenCompany,
}: {
  offer: OfferWithMerchant;
  onBack: () => void;
  onClaimed: (c: CouponClaim) => void;
  onRequireAuth: () => void;
  claimTrigger: number;
  onOpenCompany: (merchant: Merchant) => void;
}) {
  const { user, profile } = useAuth();
  const merchant = offer.qapla_merchants;
  const Icon = categoryIcons[offer.category] || Tag;
  const [claiming, setClaiming] = useState(false);
  const [claimError, setClaimError] = useState<string | null>(null);
  const [eligibility, setEligibility] = useState<CampaignEligibility | null>(null);
  const [tick, setTick] = useState(0);

  useEffect(() => {
    const interval = setInterval(() => setTick((t) => t + 1), 1000);
    return () => clearInterval(interval);
  }, []);

  useEffect(() => {
    if (!user) {
      setEligibility(null);
      return;
    }
    let cancelled = false;
    const loadEligibility = async () => {
      const status = await checkCampaignEligibilityAction(offer.id);
      if (!cancelled) {
        setEligibility(status);
        setTick(0);
      }
    };
    void loadEligibility();
    return () => {
      cancelled = true;
    };
  }, [offer.id, user?.id]);

  const offerExpired = getMsRemaining(offer.expires_at) <= 0 || Boolean(eligibility?.campaign_expired);
  const outOfStock = offer.stock <= 0;
  const cooldownLeft = eligibility
    ? Math.max(0, eligibility.cooldown_remaining_seconds - tick)
    : 0;
  const cooldownBlocks = Boolean(user) && cooldownLeft > 0;
  const alreadyRedeemed = Boolean(user) && Boolean(eligibility?.already_redeemed);
  const guest = !user;
  const merchantBlocked = profile?.role === 'merchant';
  const adminTester = profile?.role === 'admin';
  const canSubmit = !offerExpired && !outOfStock && Boolean(merchant) && !merchantBlocked
    && (adminTester || (!cooldownBlocks && !alreadyRedeemed));

  const redeem = async () => {
    if (!user || offerExpired || outOfStock || profile?.role === 'merchant') return;
    if (!adminTester && (cooldownBlocks || alreadyRedeemed)) return;
    setClaiming(true);
    setClaimError(null);
    try {
      const result = await redeemCampaignAction(offer.id, {
        latitude: merchant.latitude,
        longitude: merchant.longitude,
      });
      if (!result.ok) {
        if (result.code === 'UNAUTHENTICATED') {
          onRequireAuth();
          return;
        }
        const cooldownHint = result.code === 'COOLDOWN'
          ? ` Kalan süre: ${formatCooldown(result.cooldown_remaining_seconds)}.`
          : '';
        setClaimError(`${result.message}${cooldownHint}`);
        return;
      }

      const code = generateCouponCode();
      const expiresAt = new Date(Date.now() + 2 * 60 * 60 * 1000).toISOString();
      const localClaim: CouponClaim = {
        id: result.redemption?.id ?? crypto.randomUUID(),
        offer_id: offer.id,
        consumer_id: user.id,
        merchant_id: offer.merchant_id,
        code,
        expires_at: expiresAt,
        status: 'active',
        created_at: result.redemption?.redeemed_at ?? new Date().toISOString(),
      };
      writeLocalClaim(localClaim);
      void saveCouponTicket(localClaim);
      onClaimed(localClaim);
    } catch (err) {
      setClaimError(err instanceof Error ? err.message : 'Kupon oluşturulamadı');
    } finally {
      setClaiming(false);
    }
  };

  useEffect(() => {
    if (claimTrigger > 0 && user) {
      void redeem();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [claimTrigger]);

  const handleClaim = () => {
    if (merchantBlocked) return;
    if (!canSubmit && !guest) return;
    if (guest) {
      onRequireAuth();
      return;
    }
    void redeem();
  };

  const remaining = formatTimeRemaining(offer.expires_at);
  void tick;
  if (!merchant) return null;
  const campaignImage = offer.image_url?.trim() || '';
  const companyLogo = merchant.logo_url || merchant.image_url || '';

  return (
    <div className="flex-1 flex flex-col pb-20">
      <div className="relative h-56 flex-shrink-0 overflow-hidden" style={{ background: `linear-gradient(135deg, ${merchant.accent}, ${merchant.accent}cc)` }}>
        {campaignImage ? (
          <img src={campaignImage} alt="" className="absolute inset-0 h-full w-full object-cover" />
        ) : null}
        <button
          onClick={onBack}
          className="absolute top-12 left-4 z-10 w-10 h-10 rounded-2xl bg-black/35 backdrop-blur-sm flex items-center justify-center text-white transition active:scale-90"
        >
          <ArrowLeft className="w-5 h-5" />
        </button>
        {campaignImage ? null : (
          <div className="absolute inset-0 flex items-center justify-center">
            <div className="w-24 h-24 rounded-5xl bg-white/20 backdrop-blur-sm flex items-center justify-center overflow-hidden">
              {companyLogo ? (
                <img src={companyLogo} alt="" className="h-full w-full object-cover" />
              ) : (
                <Icon className="w-12 h-12 text-white" />
              )}
            </div>
          </div>
        )}
        <div className="absolute inset-x-0 bottom-0 z-10 flex items-center gap-2.5 bg-gradient-to-t from-black/75 to-transparent px-4 pb-4 pt-10">
          <span className="flex h-11 w-11 shrink-0 items-center justify-center overflow-hidden rounded-2xl bg-[#00A884] ring-2 ring-white">
            {companyLogo ? (
              <img src={companyLogo} alt="" className="h-full w-full object-cover" />
            ) : (
              <span className="text-lg font-extrabold text-white">{(merchant.name || '?').slice(0, 1).toLocaleUpperCase('tr')}</span>
            )}
          </span>
          <span className="min-w-0">
            <FirmName name={merchant.name} verified={merchant.is_verified} tone="onDark" className="text-base font-extrabold text-white" />
            <span className="block truncate text-xs font-semibold text-white/80">{merchant.category || offer.category}</span>
          </span>
        </div>
        <Droplet className="absolute -bottom-6 -right-6 w-40 h-40 text-white/10" fill="currentColor" />
      </div>

      <div className="flex-1 px-5 pt-5 -mt-4 bg-cream-50 rounded-t-4xl">
        <div className="flex items-center gap-2 mb-2">
          <span className="rounded-full bg-[#00A884] px-2.5 py-0.5 text-[10px] font-extrabold text-white shadow-sm">{offer.discount}</span>
          <span className="rounded-full bg-[#00A884]/10 px-2.5 py-0.5 text-[10px] font-extrabold text-[#00A884]">{remaining}</span>
        </div>
        <h1 className="text-2xl font-extrabold text-slate-800 leading-tight">{offer.title}</h1>
        <div className="mt-2 flex items-center gap-2 text-sm text-gray-500">
          <Store className="w-4 h-4" />
          <span className="font-medium text-mint-700">{merchant?.name ?? 'İşletme'}</span>
          <span>•</span>
          <span>{merchant?.category ?? offer.category}</span>
        </div>
        <button
          type="button"
          onClick={() => merchant && onOpenCompany(merchant)}
          className="mt-3 inline-flex rounded-2xl bg-[#00A884] px-4 py-2.5 text-sm font-extrabold text-white shadow-md disabled:opacity-50"
        >
          Firma Profiline Git
        </button>

        <div className="mt-4 rounded-2xl border border-emerald-100 bg-white p-4 shadow-md">
          <p className="text-sm text-gray-600 leading-relaxed">{offer.description}</p>
          <div className="flex items-center gap-4 mt-3 pt-3 border-t border-mint-50">
            <div className="flex items-center gap-1.5 text-xs text-gray-500">
              <Navigation className="w-3.5 h-3.5 text-mint-500" />
              {merchant.distance_m < 1000 ? `${merchant.distance_m} m` : `${(merchant.distance_m / 1000).toFixed(1)} km`}
            </div>
            <div className="flex items-center gap-1.5 text-xs text-gray-500">
              <MapPin className="w-3.5 h-3.5 text-mint-500" />
              {merchant.address}
            </div>
          </div>
        </div>

        <div className="mt-3 grid grid-cols-2 gap-3">
          <div className="p-3 rounded-2xl bg-mint-50 text-center">
            <Clock className="w-5 h-5 text-mint-500 mx-auto" />
            <p className="text-xs text-gray-500 mt-1">Fırsat süresi</p>
            <p className="font-bold text-mint-700 text-sm">
              {offerExpired ? 'Süre doldu' : remaining}
            </p>
          </div>
          <div className="p-3 rounded-2xl bg-mint-50 text-center">
            <Ticket className="w-5 h-5 text-mint-500 mx-auto" />
            <p className="text-xs text-gray-500 mt-1">Kalan stok</p>
            <p className="font-bold text-mint-700 text-sm">{offer.stock} adet</p>
          </div>
        </div>

        {claimError && (
          <div className="mt-3 p-3 rounded-2xl bg-red-50 border border-red-100 flex items-center gap-2 text-sm text-red-600">
            <AlertCircle className="w-4 h-4 flex-shrink-0" />
            {claimError}
          </div>
        )}

        <div className="mt-5 pb-4">
          <button
            onClick={handleClaim}
            disabled={claiming || offerExpired || outOfStock || merchantBlocked || (!adminTester && (alreadyRedeemed || cooldownBlocks))}
            className="btn-primary w-full text-base py-4 disabled:opacity-50"
          >
            {claiming ? (
              <><Loader2 className="w-5 h-5 animate-spin" /> Kupon oluşturuluyor...</>
            ) : merchantBlocked ? (
              'İşletmeler kupon alamaz'
            ) : offerExpired ? (
              'Süre doldu'
            ) : outOfStock ? (
              'Stok tükendi'
            ) : adminTester ? (
              <><Droplet className="w-5 h-5" fill="currentColor" /> Deneme kuponu al</>
            ) : alreadyRedeemed ? (
              'Bu kampanyayı kullandınız'
            ) : cooldownBlocks ? (
              `3 saat bekleme · ${formatCooldown(cooldownLeft)}`
            ) : guest ? (
              <><User className="w-5 h-5" /> Fırsatı Kullan</>
            ) : (
              <><Droplet className="w-5 h-5" fill="currentColor" /> Fırsatı Kullan</>
            )}
          </button>
          <p className="text-center text-xs text-gray-400 mt-2">
            {merchantBlocked
              ? 'Kendi kampanyalarınızı işletme panelinden yönetin.'
              : guest
              ? 'Kampanyayı incelemen ücretsiz. Kullanmak için üye girişi yap.'
              : profile?.role === 'admin'
                ? 'Yönetici deneme kuponu: bekleme ve tek kullanım kuralı uygulanmaz.'
                : 'Kupon kodu anında oluşturulur, 2 saat geçerlidir'}
          </p>
        </div>
      </div>
    </div>
  );
}

function CouponDetailScreen({
  coupon, offers, onBack, onChanged,
}: {
  coupon: CouponClaim;
  offers: OfferWithMerchant[];
  onBack: () => void;
  onChanged: (coupon: CouponClaim | null) => void;
}) {
  const { profile } = useAuth();
  const canCancel = profile?.role === 'user' || profile?.role === 'admin';
  const canDelete = profile?.role === 'admin';
  const offer = offers.find((o) => o.id === coupon.offer_id);
  const [copied, setCopied] = useState(false);
  const [tick, setTick] = useState(0);
  const [latest, setLatest] = useState(coupon);
  const cancelled = latest.status === 'cancelled' || latest.status === 'deleted';

  useEffect(() => {
    setLatest(readLocalClaims().find((item) => item.id === coupon.id) ?? coupon);
  }, [coupon]);

  useEffect(() => {
    const interval = setInterval(() => setTick((t) => t + 1), 1000);
    return () => clearInterval(interval);
  }, []);

  useEffect(() => subscribeTables(['coupon_tickets', 'user_redemptions'], () => {
    void readCouponTicketStatus(coupon.id).then((status) => {
      if (!status || status === coupon.status) return;
      if (status === 'deleted') {
        onChanged(null);
        return;
      }
      const next = { ...(readLocalClaims().find((item) => item.id === coupon.id) ?? coupon), status };
      writeLocalClaim(next);
      setLatest(next);
      onChanged(next);
    });
  }), [coupon, onChanged]);

  const timeLeft = formatTimeRemaining(latest.expires_at);
  const isExpired = getMsRemaining(latest.expires_at) <= 0;
  void tick;

  const copyCode = () => {
    navigator.clipboard?.writeText(latest.code);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div className="flex-1 flex flex-col pb-20">
      <div className="px-5 pt-12 pb-4 bg-gradient-to-b from-mint-500 to-mint-600 text-white">
        <button
          onClick={onBack}
          className="w-10 h-10 rounded-2xl bg-white/20 flex items-center justify-center transition active:scale-90"
        >
          <ArrowLeft className="w-5 h-5" />
        </button>
        <h1 className="text-xl font-extrabold mt-3">{cancelled ? 'Kupon iptal' : 'Kuponun hazır'}</h1>
        <p className="text-mint-100 text-sm mt-0.5">
          {cancelled ? 'İstersen kuponu geri alabilirsin' : 'İşletmede göster, fırsatı kap'}
        </p>
      </div>

      <div className="flex-1 px-5 pt-5">
        <div className="relative bg-white rounded-4xl shadow-mint-lg overflow-hidden p-6 text-center">
          <Droplet className="absolute -top-8 -right-8 w-32 h-32 text-mint-50" fill="currentColor" />
          <Droplet className="absolute -bottom-8 -left-8 w-32 h-32 text-mint-50" fill="currentColor" />

          <div className="relative">
            <div className="w-16 h-16 mx-auto rounded-5xl bg-mint-100 flex items-center justify-center">
              <Ticket className="w-8 h-8 text-mint-500" />
            </div>
            <p className="text-sm text-gray-500 mt-4">Kupon kodun</p>
            <button
              onClick={copyCode}
              className="mt-2 inline-flex items-center gap-2 px-6 py-3 rounded-2xl bg-mint-50 border-2 border-dashed border-mint-300 transition active:scale-95 hover:bg-mint-100"
            >
              <span className="text-2xl font-extrabold tracking-widest text-mint-700">{latest.code}</span>
            </button>
            <p className="text-xs text-gray-400 mt-2 flex items-center justify-center gap-1">
              {copied ? <><Check className="w-3 h-3 text-mint-500" /> Kopyalandı</> : 'Koda dokun, kopyala'}
            </p>

            <div className="mt-5 p-4 rounded-3xl bg-gradient-to-b from-mint-50 to-cream-50 border border-mint-100">
              <div className="flex items-center justify-center gap-2 mb-2">
                <Clock className={`w-5 h-5 ${isExpired || cancelled ? 'text-gray-400' : 'text-mint-500'}`} />
                <span className="text-xs text-gray-500">
                  {cancelled ? 'İptal edildi' : isExpired ? 'Süre doldu' : 'Kalan süre'}
                </span>
              </div>
              <p className={`text-2xl font-extrabold tabular-nums ${isExpired || cancelled ? 'text-gray-400' : 'text-mint-600'}`}>
                {timeLeft}
              </p>
            </div>

            {offer?.qapla_merchants && (
              <div className="mt-4 p-3 rounded-2xl bg-cream-50 text-left">
                <p className="font-bold text-sm text-mint-800">{offer.title}</p>
                <FirmName name={offer.qapla_merchants.name} verified={offer.qapla_merchants.is_verified} className="mt-0.5 text-xs text-gray-500" />
                <div className="flex items-center gap-2 mt-2">
                  <span className="chip bg-mint-100 text-mint-700">{offer.discount}</span>
                  <span className="text-xs text-gray-400">{offer.qapla_merchants.address}</span>
                </div>
              </div>
            )}
          </div>
        </div>

        {(canCancel || canDelete) && (
        <div className="mt-4 grid grid-cols-2 gap-2">
          {canCancel && (cancelled ? (
            <button
              type="button"
              className="btn-primary py-3"
              onClick={() => {
                void setCouponTicketStatus(latest, 'active').then((restored) => {
                  setLatest(restored);
                  onChanged(restored);
                });
              }}
            >
              <RotateCcw className="w-4 h-4" /> Geri al
            </button>
          ) : (
            <button
              type="button"
              className="rounded-2xl bg-amber-50 px-3 py-3 text-sm font-bold text-amber-700 flex items-center justify-center gap-1.5"
              onClick={() => {
                void setCouponTicketStatus(latest, 'cancelled').then((next) => {
                  setLatest(next);
                  onChanged(next);
                });
              }}
            >
              <Ban className="w-4 h-4" /> İptal et
            </button>
          ))}
          {canDelete && (
          <button
            type="button"
            className="rounded-2xl bg-red-50 px-3 py-3 text-sm font-bold text-red-600 flex items-center justify-center gap-1.5"
            onClick={() => {
              void setCouponTicketStatus(latest, 'deleted').then(() => onChanged(null));
            }}
          >
            <Trash2 className="w-4 h-4" /> Sil
          </button>
          )}
        </div>
        )}

        <div className="mt-4 p-4 rounded-2xl bg-white border border-mint-100">
          <h3 className="font-bold text-sm text-mint-800 mb-2 flex items-center gap-1.5">
            <Sparkles className="w-4 h-4 text-mint-500" /> Nasıl kullanırım?
          </h3>
          <ol className="space-y-1.5 text-xs text-gray-500">
            <li className="flex gap-2"><span className="font-bold text-mint-500">1.</span> İşletmeye git, fırsatı söyle.</li>
            <li className="flex gap-2"><span className="font-bold text-mint-500">2.</span> Kupon kodunu göster.</li>
            <li className="flex gap-2"><span className="font-bold text-mint-500">3.</span> İndirimini al, fırsatı kap!</li>
          </ol>
        </div>
      </div>
    </div>
  );
}

function CouponsScreen({
  onBack, onViewCoupon, onRequireAuth,
  title = 'Ziyaretler',
  subtitle = 'Aktif ve geçmiş kuponların',
}: {
  onBack: () => void;
  onViewCoupon: (c: CouponClaim) => void;
  onRequireAuth?: () => void;
  title?: string;
  subtitle?: string;
}) {
  const { user, profile } = useAuth();
  const ownsCoupon = profile?.role === 'user' || profile?.role === 'admin';
  const canDelete = profile?.role === 'admin';
  const [coupons, setCoupons] = useState<CouponClaim[]>([]);
  const [loading, setLoading] = useState(true);
  const consumerId = user?.id ?? getConsumerId();

  const loadCoupons = useCallback(async (silent = false) => {
    if (!silent) setLoading(true);
    const local = readLocalClaims().filter((c) => (
      (c.consumer_id === consumerId || c.consumer_id === user?.id)
      && c.status !== 'deleted'
    ));
    if (!isSupabaseConfigured) {
      setCoupons(local);
      setLoading(false);
      return;
    }
    try {
      const remote = await listUserRedemptionsAction();
      const mapped: CouponClaim[] = remote.map((row) => ({
        id: row.id,
        offer_id: row.campaign_id,
        consumer_id: row.user_id,
        code: row.id.slice(0, 8).toUpperCase(),
        expires_at: row.redeemed_at,
        status: 'used',
        created_at: row.redeemed_at,
      }));
      const merged = [...mapped];
      for (const claim of local) {
        if (!merged.some((item) => item.id === claim.id || item.code === claim.code)) {
          merged.push(claim);
        }
      }
      setCoupons(merged.length ? merged : local);
    } catch {
      setCoupons(local);
    } finally {
      setLoading(false);
    }
  }, [consumerId, user?.id]);

  useEffect(() => { void loadCoupons(); }, [loadCoupons]);
  useEffect(() => subscribeTables(
    ['coupon_tickets', 'user_redemptions', 'campaigns'],
    () => { void loadCoupons(true); },
  ), [loadCoupons]);

  if (!user) {
    return (
      <TabPageShell title={title} subtitle="Ziyaret geçmişin üye hesabına bağlı.">
        <div className="flex flex-col items-center rounded-3xl border border-mint-100 bg-white px-6 py-10 text-center shadow-sm">
          <div className="flex h-16 w-16 items-center justify-center rounded-3xl bg-mint-50">
            <User className="h-8 w-8 text-mint-400" />
          </div>
          <h2 className="mt-4 font-bold text-mint-800">Üye girişi gerekir</h2>
          <p className="mt-1 text-sm text-gray-400">Ziyaretler ve kuponların yalnızca üye hesapta tutulur.</p>
          <button type="button" onClick={onRequireAuth} className={`${tabPrimary} mt-5 max-w-[14rem]`}>
            Giriş yap / üye ol
          </button>
        </div>
      </TabPageShell>
    );
  }

  return (
    <TabPageShell title={title} subtitle={subtitle}>
        {loading ? (
          <div className="flex flex-col items-center py-16">
            <Loader2 className="h-8 w-8 animate-spin text-mint-500" />
          </div>
        ) : coupons.length === 0 ? (
          <div className="flex flex-col items-center rounded-3xl border border-mint-100 bg-white px-6 py-10 text-center shadow-sm">
            <div className="flex h-16 w-16 items-center justify-center rounded-3xl bg-mint-50">
              <Ticket className="h-8 w-8 text-mint-400" />
            </div>
            <h2 className="mt-4 font-bold text-mint-800">Henüz ziyaret yok</h2>
            <p className="mt-1 text-sm text-gray-400">Fırsatları keşfet, ilk kuponunu kap!</p>
            <button type="button" onClick={onBack} className={`${tabPrimary} mt-5 max-w-[14rem]`}>
              Fırsatları keşfet
            </button>
          </div>
        ) : (
          <div className="space-y-2">
            {coupons.map((c) => {
              const isExpired = getMsRemaining(c.expires_at) <= 0;
              const cancelled = c.status === 'cancelled';
              const used = c.status === 'used';
              const statusLabel = cancelled ? 'İptal' : used ? 'Kullanıldı' : isExpired ? 'Doldu' : 'Aktif';
              const muted = cancelled || used || isExpired;
              return (
                <div key={c.id} className="flex overflow-hidden rounded-2xl border border-mint-100 bg-white shadow-sm">
                  <button
                    type="button"
                    onClick={() => onViewCoupon(c)}
                    className="flex flex-1 text-left"
                  >
                    <div className={`flex w-20 flex-shrink-0 flex-col items-center justify-center gap-1 p-3 ${muted ? 'bg-gray-50' : 'bg-mint-50'}`}>
                      <Ticket className={`h-7 w-7 ${muted ? 'text-gray-300' : 'text-mint-500'}`} />
                      <span className={`text-[10px] font-bold ${muted ? 'text-gray-400' : 'text-mint-600'}`}>
                        {statusLabel}
                      </span>
                    </div>
                    <div className="flex-1 p-3.5">
                      <p className="text-sm font-bold tracking-widest text-mint-800">{c.code}</p>
                      <p className="mt-1 text-xs text-gray-400">
                        {cancelled ? 'İptal edildi · geri alabilirsin' : isExpired ? 'Süre doldu' : formatTimeRemaining(c.expires_at)}
                      </p>
                    </div>
                  </button>
                  {(ownsCoupon || canDelete) && (
                  <div className="flex flex-col justify-center gap-1 pr-2">
                    {ownsCoupon && !used && (cancelled ? (
                      <button
                        type="button"
                        className="rounded-xl bg-mint-50 px-2 py-1.5 text-[10px] font-bold text-mint-700"
                        onClick={() => {
                          void setCouponTicketStatus(c, 'active').then(() => loadCoupons(true));
                        }}
                      >
                        Geri al
                      </button>
                    ) : (
                      <button
                        type="button"
                        className="rounded-xl bg-amber-50 px-2 py-1.5 text-[10px] font-bold text-amber-700"
                        onClick={() => {
                          void setCouponTicketStatus(c, 'cancelled').then(() => loadCoupons(true));
                        }}
                      >
                        İptal
                      </button>
                    ))}
                    {canDelete && (
                    <button
                      type="button"
                      className="rounded-xl bg-red-50 px-2 py-1.5 text-[10px] font-bold text-red-600"
                      onClick={() => {
                        void setCouponTicketStatus(c, 'deleted').then(() => loadCoupons(true));
                      }}
                    >
                      Sil
                    </button>
                    )}
                  </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
    </TabPageShell>
  );
}

const BottomNav = memo(function BottomNav({
  role, activeTab, onHome, onSaved, onVisits, onProfile, onSettings, onMerchant, onAdmin, onVip,
}: {
  role?: string | null;
  activeTab: Tab;
  onHome: () => void;
  onSaved: () => void;
  onVisits: () => void;
  onProfile: () => void;
  onSettings?: () => void;
  onMerchant?: () => void;
  onAdmin?: () => void;
  onVip: () => void;
}) {
  const features = useAppFeatures();
  const item = (active: boolean) =>
    `flex h-12 min-h-12 min-w-0 flex-1 flex-col items-center justify-center gap-0.5 transition active:scale-90 ${active ? 'text-[#00A884]' : 'text-slate-600'}`;
  const admin = role === 'admin';
  const merchant = role === 'merchant';
  return (
    <nav className="explore-bottom-nav pointer-events-auto absolute left-3 right-3 z-[1300] rounded-3xl bg-white/95 px-2 py-2.5 shadow-xl backdrop-blur-md">
      <div className={`grid items-center ${admin ? 'grid-cols-4' : 'grid-cols-5'}`}>
        <button type="button" onClick={onHome} className={item(activeTab === 'home')}>
          <ExploreTabIcon active={activeTab === 'home'} className="h-6 w-6" />
          <span className="text-[10px] font-bold">Keşfet</span>
        </button>
        {admin ? (
          <button type="button" onClick={onAdmin} className={item(activeTab === 'admin')}>
            <QapLaMark className="h-8 w-8" />
            <span className="text-[10px] font-bold">Yönetim</span>
          </button>
        ) : merchant ? (
          <button type="button" onClick={onMerchant} className={item(activeTab === 'merchant')}>
            <Store className="h-6 w-6" />
            <span className="text-[10px] font-bold">Firma</span>
          </button>
        ) : features.user.saved ? (
          <button type="button" onClick={onSaved} className={item(activeTab === 'saved')}>
            <Bookmark className="h-6 w-6" fill={activeTab === 'saved' ? 'currentColor' : 'none'} />
            <span className="text-[10px] font-bold">Kaydedilenler</span>
          </button>
        ) : (
          <span />
        )}
        {admin ? (
          <button type="button" onClick={onVip} className={item(activeTab === 'vip')}>
            <QapLaMark className="h-8 w-8" />
            <span className="text-[10px] font-bold">VIP</span>
          </button>
        ) : merchant ? (
          <button type="button" onClick={onVip} className={item(activeTab === 'vip')}>
            <QapLaMark className="h-8 w-8" />
            <span className="text-[10px] font-bold">VIP</span>
          </button>
        ) : features.user.coupons ? (
          <button type="button" onClick={onVisits} className={item(activeTab === 'visits')}>
            <Heart className="h-6 w-6" fill={activeTab === 'visits' ? 'currentColor' : 'none'} />
            <span className="text-[10px] font-bold">Ziyaretler</span>
          </button>
        ) : (
          <span />
        )}
        {admin ? (
          <button type="button" onClick={onProfile} className={item(activeTab === 'profile' || activeTab === 'settings')}>
            <User className="h-6 w-6" />
            <span className="text-[10px] font-bold">Profil</span>
          </button>
        ) : merchant ? (
          <>
            <button type="button" onClick={onProfile} className={item(activeTab === 'profile')}>
              <User className="h-6 w-6" />
              <span className="text-[10px] font-bold">Profilim</span>
            </button>
            <button type="button" onClick={onSettings} className={item(activeTab === 'settings')}>
              <Settings className="h-6 w-6" />
              <span className="text-[10px] font-bold">Ayarlar</span>
            </button>
          </>
        ) : (
          <>
            <button type="button" onClick={onVip} className={item(activeTab === 'vip')}>
              <QapLaMark className="h-8 w-8" />
              <span className="text-[10px] font-bold">VIP</span>
            </button>
            <button type="button" onClick={onProfile} className={item(activeTab === 'profile')}>
              <User className="h-6 w-6" />
              <span className="text-[10px] font-bold">Profil</span>
            </button>
          </>
        )}
      </div>
    </nav>
  );
});
