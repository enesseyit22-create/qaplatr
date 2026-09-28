import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import {
  ArrowLeft, Loader2, MapPin, Plus, Trash2, Building2, AlertCircle, LogOut,
  Menu, X, Users, Shield, Ticket, Heart, ChevronDown, ImagePlus, Search, KeyRound, Bell, BadgeCheck,
} from 'lucide-react';
import {
  createCampaignAction,
  createCompanyAction,
  deleteCampaignAction,
  deleteCompanyAction,
  blockCompanyAccessAction,
  listAdminCampaigns,
  listAdminCompanies,
  setCampaignActiveAction,
  setCompanyFeaturedAction,
  updateCampaignAction,
  updateCompanyProfileAction,
  setCompanyVerifiedAction,
  setCompanyPlanAction,
  setCompanyPushQuotaAction,
  setCompanyTermAction,
  setMemberVipAction,
  MissingCompanyError,
} from '@/lib/actions/admin';
import { deleteAdminUser, listAdminRedemptions, listAdminUsers, upsertAdminUser } from '@/lib/actions/users';
import { rememberActiveCompany } from '@/lib/actions/merchant';
import { applicationFromRow, BUSINESSES_EVENT, listBusinessApplications, setBusinessStatusAction, type BusinessApplication } from '@/lib/businesses';
import { BusinessApplicationsPanel } from '@/components/BusinessApplications';
import type { AppUser, Campaign, Company, UserRedemption } from '@/lib/campaigns';
import { reverseNominatim, searchNominatim } from '@/lib/address';
import { CompanyMapPicker } from '@/components/CompanyMapPicker';
import { AdminUsersPanel } from '@/components/AdminUsers';
import { COMPANY_CATEGORIES } from '@/lib/sectors';
import { StoryStudio } from '@/components/StoryStudio';
import { AdminBusinessDetail } from '@/pages/admin/AdminBusinesses';
import { AdminCampaignList } from '@/components/AdminCampaigns';
import { AdminVipDesk } from '@/components/AdminVipDesk';
import { AdminBannerDesk } from '@/components/AdminBannerDesk';
import { AdminShowcaseQueue } from '@/components/AdminShowcaseQueue';
import { VerifiedBadge } from '@/components/VerifiedBadge';
import { canCompanyPostStories, setCompanyStoryPermission } from '@/lib/stories';
import { subscribeTables } from '@/lib/live';
import { applyCampaignList, subscribeCampaignTable } from '@/lib/campaignLive';
import { useAuth } from '@/lib/authContext';
import { welcomeLine } from '@/lib/auth';
import { listFavoriteIds } from '@/lib/favorites';
import { inspectCouponCode, approveCouponCode, type CouponInspect } from '@/lib/couponTickets';
import { PanelTopBar, panelChip, panelIconBtn } from '@/components/TabPageShell';
import { AdminControlBoundary, AdminControlDesk } from '@/components/AdminControlDesk';
import { SafeCenterModal } from '@/components/SafeCenterModal';
import { deleteAppNotice, isAdminInboxNotice, useAppNotices } from '@/lib/notices';

const CATEGORIES = COMPANY_CATEGORIES;
const DEFAULT_LAT = 40.9888;
const DEFAULT_LNG = 29.0288;

type Tab = 'list' | 'users' | 'stories' | 'codes' | 'controls' | 'company' | 'apps' | 'vip' | 'campaigns' | 'banners';

export function AdminPanelScreen({
  onBack,
  onChanged,
  initialTab = 'list',
}: {
  onBack: () => void;
  onChanged?: () => void;
  initialTab?: Tab;
}) {
  const [tab, setTab] = useState<Tab>(initialTab);
  const [menuOpen, setMenuOpen] = useState(false);
  const [favOpen, setFavOpen] = useState(false);
  const [companies, setCompanies] = useState<Company[]>([]);
  const [campaigns, setCampaigns] = useState<Campaign[]>([]);
  const [users, setUsers] = useState<AppUser[]>([]);
  const [redemptions, setRedemptions] = useState<UserRedemption[]>([]);
  const [applications, setApplications] = useState<BusinessApplication[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<Company | null>(null);
  const [deleteUserTarget, setDeleteUserTarget] = useState<AppUser | null>(null);
  const [firmQuery, setFirmQuery] = useState('');
  const [selectedCompanyId, setSelectedCompanyId] = useState<string | null>(null);
  useEffect(() => { rememberActiveCompany(selectedCompanyId); }, [selectedCompanyId]);
  const [editingCampaign, setEditingCampaign] = useState<Campaign | null>(null);
  const [permTick, setPermTick] = useState(0);
  const [couponCode, setCouponCode] = useState('');
  const [couponInspect, setCouponInspect] = useState<CouponInspect | null>(null);
  const { profile, user, signOut } = useAuth();
  const pendingRef = useRef<number | null>(null);
  const refreshGen = useRef(0);
  const seenNoticeRef = useRef<string | null>(null);
  const [notesOpen, setNotesOpen] = useState(false);
  const [openNoticeId, setOpenNoticeId] = useState<string | null>(null);
  const pushed = useAppNotices();
  const inbox = useMemo(() => pushed.filter(isAdminInboxNotice), [pushed]);
  const latestNoticeId = inbox[0]?.id;
  const pendingCount = applications.filter((item) => item.status === 'pending').length;

  useEffect(() => {
    setTab(initialTab);
  }, [initialTab]);

  const refresh = useCallback(async (silent = false) => {
    const ticket = ++refreshGen.current;
    if (!silent) setLoading(true);
    try {
      const nextCompanies = await listAdminCompanies();
      if (ticket !== refreshGen.current) return;
      setCompanies(nextCompanies);
      setLoading(false);
      const [nextCampaigns, nextUsers, nextRedemptions, nextApps] = await Promise.all([
        listAdminCampaigns(),
        listAdminUsers(),
        listAdminRedemptions(),
        listBusinessApplications(),
      ]);
      if (ticket !== refreshGen.current) return;
      setCampaigns(nextCampaigns);
      setUsers(nextUsers);
      setRedemptions(nextRedemptions);
      setApplications(nextApps);
      const pending = nextApps.filter((item) => item.status === 'pending').length;
      if (pendingRef.current !== null && pending > pendingRef.current) {
        setNotice('Yeni firma başvurusu geldi.');
        setTab('apps');
      }
      pendingRef.current = pending;
      setError(null);
    } catch (err) {
      if (ticket !== refreshGen.current) return;
      setError(err instanceof Error ? err.message : 'Liste yüklenemedi');
    } finally {
      if (!silent && ticket === refreshGen.current) setLoading(false);
    }
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  useEffect(() => {
    const stop = subscribeTables(
      ['companies', 'campaigns', 'businesses', 'profiles', 'app_notices', 'coupon_tickets', 'user_redemptions'],
      (change) => {
        if (change?.eventType === 'DELETE') {
          const id = String(change.old?.id ?? '');
          if (id && change.table === 'companies') {
            setCompanies((current) => current.filter((item) => item.id !== id));
            setCampaigns((current) => current.filter((item) => item.company_id !== id));
          }
          if (id && change.table === 'campaigns') {
            setCampaigns((current) => current.filter((item) => item.id !== id));
          }
          if (id && change.table === 'businesses') {
            setApplications((current) => current.filter((item) => item.id !== id));
          }
          if (id && change.table === 'profiles') {
            setUsers((current) => current.filter((item) => item.id !== id));
          }
        }
        if (change?.table === 'businesses' && change.new && change.eventType !== 'DELETE') {
          const row = applicationFromRow(change.new);
          if (row) {
            setApplications((current) => {
              const next = [row, ...current.filter((item) => item.id !== row.id && item.user_id !== row.user_id)];
              const pending = next.filter((item) => item.status === 'pending').length;
              if (pendingRef.current !== null && pending > pendingRef.current) {
                setNotice(`${row.company_name} başvurusu geldi.`);
                setTab('apps');
              }
              pendingRef.current = pending;
              return next.sort((a, b) => b.created_at.localeCompare(a.created_at));
            });
          }
        }
        void refresh(true);
      },
    );
    const stopCampaigns = subscribeCampaignTable((change) => {
      setCampaigns((current) => applyCampaignList(current, change));
    });
    const onLocal = (event: Event) => {
      const row = (event as CustomEvent<BusinessApplication>).detail;
      if (!row?.id) return;
      setApplications((current) => {
        const next = [row, ...current.filter((item) => item.id !== row.id && item.user_id !== row.user_id)];
        const pending = next.filter((item) => item.status === 'pending').length;
        if (pendingRef.current !== null && pending > pendingRef.current) {
          setNotice(`${row.company_name} başvurusu geldi.`);
          setTab('apps');
        }
        pendingRef.current = pending;
        return next.sort((a, b) => b.created_at.localeCompare(a.created_at));
      });
      void refresh(true);
    };
    window.addEventListener(BUSINESSES_EVENT, onLocal);
    return () => {
      stop();
      stopCampaigns();
      window.removeEventListener(BUSINESSES_EVENT, onLocal);
    };
  }, [refresh]);

  useEffect(() => {
    const latest = inbox[0];
    if (!latest || !latestNoticeId) return;
    if (seenNoticeRef.current === null) {
      seenNoticeRef.current = latestNoticeId;
      return;
    }
    if (latestNoticeId === seenNoticeRef.current) return;
    seenNoticeRef.current = latestNoticeId;
    setNotesOpen(true);
    setOpenNoticeId(latest.id);
  }, [latestNoticeId, inbox]);

  return (
    <div className="flex h-full min-h-0 flex-1 flex-col overflow-hidden bg-[#eef3f1] text-mint-900">
      <PanelTopBar
        title={welcomeLine(profile, user?.email)}
        subtitle="Yönetim paneli"
        onBack={onBack}
        stats={[
          { label: 'Firma', value: companies.length },
          { label: 'Kullanıcı', value: users.filter((item) => item.role === 'user').length },
          { label: 'Kullanım', value: redemptions.length },
        ]}
        actions={(
          <>
            <button
              type="button"
              onClick={() => setNotesOpen((open) => !open)}
              className={`relative ${panelIconBtn}`}
              aria-label="Bildirimler"
            >
              <Bell className="h-4 w-4" />
              {inbox.length > 0 && (
                <span className="absolute -right-0.5 -top-0.5 min-w-[1rem] rounded-full bg-rose-500 px-1 text-[10px] font-bold leading-4 text-white">
                  {inbox.length}
                </span>
              )}
            </button>
            <button type="button" onClick={() => setMenuOpen(true)} className={panelIconBtn} aria-label="Yönetici yetkileri">
              <Menu className="h-5 w-5" strokeWidth={2.4} />
            </button>
            <button type="button" onClick={() => { void signOut(); }} className={panelIconBtn} aria-label="Çıkış">
              <LogOut className="h-4 w-4" />
            </button>
          </>
        )}
      >
        <div className="space-y-1">
          {([
            [['list', 'Firmalar'], ['users', 'Kullanıcılar'], ['apps', 'Başvuru'], ['campaigns', 'Kampanya']],
            [['stories', 'Hikaye'], ['codes', 'Kod'], ['vip', 'VIP'], ['controls', 'Kontrol']],
            [['banners', 'Vitrin']],
          ] as const).map((row, index) => (
            <div key={index} className="flex gap-1">
              {row.map(([id, label]) => (
                <button
                  key={id}
                  type="button"
                  onClick={() => { setTab(id); if (id === 'list') setSelectedCompanyId(null); }}
                  className={`min-w-0 flex-1 ${panelChip(tab === id)}`}
                >
                  {label}
                  {id === 'apps' && pendingCount > 0 ? ` (${pendingCount})` : ''}
                </button>
              ))}
            </div>
          ))}
        </div>
      </PanelTopBar>

      <div className="min-h-0 flex-1 space-y-4 overflow-y-auto px-5 py-4 pb-28">
        {error && (
          <p className="flex gap-2 rounded-2xl border border-red-100 bg-red-50 px-3 py-2 text-sm text-red-600">
            <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" /> {error}
          </p>
        )}
        {notice && (
          <p className="rounded-2xl border border-mint-100 bg-mint-50 px-3 py-2 text-sm text-mint-800">{notice}</p>
        )}
        {notesOpen && (
          <div className="overflow-hidden rounded-3xl bg-white shadow-sm ring-1 ring-mint-100">
            <div className="flex items-center justify-between px-3.5 py-3">
              <p className="text-[11px] font-extrabold uppercase tracking-wide text-mint-600">Yönetim bildirimleri</p>
              <button type="button" onClick={() => setNotesOpen(false)} className="text-[11px] font-bold text-gray-400">Kapat</button>
            </div>
            {inbox.length === 0 ? (
              <p className="px-3.5 pb-3 text-xs text-slate-400">Okunmamış bildirim yok.</p>
            ) : (
              <div className="divide-y divide-mint-50">
                {inbox.map((item) => {
                  const open = openNoticeId === item.id;
                  const isApp = /başvuru|onay/i.test(`${item.title} ${item.body}`);
                  const isUser = /kullanıcı|üye/i.test(`${item.title} ${item.body}`);
                  return (
                    <article key={item.id}>
                      <button
                        type="button"
                        onClick={() => setOpenNoticeId(open ? null : item.id)}
                        className="flex w-full items-start gap-2 px-3.5 py-3 text-left"
                        aria-expanded={open}
                      >
                        <span className={`mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-2xl ${isApp ? 'bg-amber-50 text-amber-700' : 'bg-mint-50 text-mint-700'}`}>
                          {isApp ? <Building2 className="h-4 w-4" /> : <Users className="h-4 w-4" />}
                        </span>
                        <span className="min-w-0 flex-1">
                          <span className="block text-sm font-extrabold text-mint-900">{item.title}</span>
                          {!open ? <span className="mt-0.5 line-clamp-1 block text-[11px] text-gray-400">{item.body}</span> : null}
                          <span className="mt-1 block text-[10px] font-bold uppercase tracking-wide text-gray-300">
                            {new Date(item.created_at).toLocaleString('tr-TR')}
                          </span>
                        </span>
                        <ChevronDown className={`mt-1 h-4 w-4 shrink-0 text-mint-600 transition ${open ? 'rotate-180' : ''}`} />
                      </button>
                      {open ? (
                        <div className="space-y-2 px-3.5 pb-3">
                          <p className="rounded-2xl bg-mint-50/80 px-3 py-2 text-sm leading-relaxed text-mint-800">{item.body}</p>
                          <div className="flex gap-2">
                            <button
                              type="button"
                              onClick={() => {
                                setTab(isUser && !isApp ? 'users' : 'apps');
                                setNotesOpen(false);
                              }}
                              className="flex-1 rounded-2xl bg-mint-50 py-2.5 text-xs font-extrabold text-mint-800"
                            >
                              {isUser && !isApp ? 'Kullanıcılara git' : 'Başvurulara git'}
                            </button>
                            <button
                              type="button"
                              onClick={() => {
                                void deleteAppNotice(item.id);
                                setOpenNoticeId(null);
                              }}
                              className="flex-1 rounded-2xl bg-mint-500 py-2.5 text-xs font-extrabold text-white"
                            >
                              Okudum
                            </button>
                          </div>
                        </div>
                      ) : null}
                    </article>
                  );
                })}
              </div>
            )}
          </div>
        )}
        {loading ? (
          <div className="flex justify-center py-12"><Loader2 className="h-6 w-6 animate-spin text-mint-500" /></div>
        ) : tab === 'list' ? (
          selectedCompanyId ? (
            <AdminBusinessDetail
              company={companies.find((item) => item.id === selectedCompanyId) ?? null}
              campaigns={campaigns.filter((item) => item.company_id === selectedCompanyId)}
              users={users.filter((item) => item.company_id === selectedCompanyId)}
              redemptions={redemptions}
              busy={busy}
              editingCampaign={editingCampaign}
              permTick={permTick}
              onBack={() => { setSelectedCompanyId(null); setEditingCampaign(null); }}
              onFeatured={async (company) => {
                setBusy(true);
                setError(null);
                try {
                  await setCompanyFeaturedAction(company.id, !company.is_featured);
                  await refresh();
                  onChanged?.();
                  setNotice(company.is_featured ? 'Öne çıkarma kapatıldı.' : 'Firma haritada öne çıkarıldı.');
                } catch (err) {
                  setError(err instanceof Error ? err.message : 'Güncellenemedi');
                } finally {
                  setBusy(false);
                }
              }}
              onApprove={async (company) => {
                setBusy(true);
                setError(null);
                try {
                  await setCompanyFeaturedAction(company.id, true);
                  await refresh();
                  onChanged?.();
                  setNotice(`${company.name} onaylandı ve öne çıkarıldı.`);
                } catch (err) {
                  setError(err instanceof Error ? err.message : 'Onaylanamadı');
                } finally {
                  setBusy(false);
                }
              }}
              onHold={async (company) => {
                setBusy(true);
                setError(null);
                try {
                  await blockCompanyAccessAction(company.id);
                  if (canCompanyPostStories(company.id)) setCompanyStoryPermission(company.id, false);
                  setPermTick((value) => value + 1);
                  setSelectedCompanyId(null);
                  await refresh();
                  onChanged?.();
                  setNotice(`${company.name} durduruldu.`);
                } catch (err) {
                  setError(err instanceof Error ? err.message : 'Durdurulamadı');
                } finally {
                  setBusy(false);
                }
              }}
              onSaveProfile={async (draft) => {
                if (!selectedCompanyId) return;
                setBusy(true);
                setError(null);
                try {
                  await updateCompanyProfileAction(selectedCompanyId, draft);
                  await refresh();
                  onChanged?.();
                  setNotice('Firma profili kaydedildi.');
                } catch (err) {
                  setError(err instanceof Error ? err.message : 'Profil kaydedilemedi');
                } finally {
                  setBusy(false);
                }
              }}
              onToggleStories={(company) => {
                const next = !canCompanyPostStories(company.id);
                setCompanyStoryPermission(company.id, next);
                setPermTick((value) => value + 1);
                setNotice(next ? `${company.name} hikaye paylaşabilir.` : `${company.name} hikaye yetkisi kapatıldı.`);
              }}
              onDelete={setDeleteTarget}
              onEditCampaign={setEditingCampaign}
              onSaveCampaign={async (draft) => {
                const companyId = selectedCompanyId;
                if (!companyId) return;
                setBusy(true);
                setError(null);
                try {
                  if (editingCampaign) {
                    await updateCampaignAction({ id: editingCampaign.id, company_id: companyId, ...draft });
                    setNotice('Kampanya güncellendi.');
                  } else {
                    await createCampaignAction({ company_id: companyId, ...draft });
                    setNotice('Kampanya eklendi.');
                  }
                  setEditingCampaign(null);
                  await refresh();
                  onChanged?.();
                } catch (err) {
                  setError(err instanceof Error ? err.message : 'Kampanya kaydedilemedi');
                } finally {
                  setBusy(false);
                }
              }}
              onToggleCampaign={(campaign) => void setCampaignActiveAction(campaign.id, !campaign.is_active).then(() => { void refresh(); })}
              onDeleteCampaign={async (campaign) => {
                setBusy(true);
                setError(null);
                try {
                  await deleteCampaignAction(campaign.id);
                  await refresh();
                  onChanged?.();
                  setNotice('Kampanya silindi.');
                } catch (err) {
                  setError(err instanceof Error ? err.message : 'Kampanya silinemedi');
                } finally {
                  setBusy(false);
                }
              }}
              onChanged={onChanged}
            />
          ) : (
            <CompanyList
              companies={companies}
              campaigns={campaigns}
              query={firmQuery}
              onQuery={setFirmQuery}
              onOpen={(company) => setSelectedCompanyId(company.id)}
              onAdd={() => setTab('company')}
              onVerify={async (company, verified) => {
                setCompanies((rows) => rows.map((row) => (row.id === company.id ? { ...row, is_verified: verified } : row)));
                try {
                  await setCompanyVerifiedAction(company.id, verified);
                } catch (err) {
                  setCompanies((rows) => rows.map((row) => (row.id === company.id ? { ...row, is_verified: company.is_verified } : row)));
                  throw err;
                }
              }}
              onPlan={async (company, tier) => {
                setCompanies((rows) => rows.map((row) => (row.id === company.id ? { ...row, plan_tier: tier } : row)));
                try {
                  await setCompanyPlanAction(company.id, tier);
                } catch (err) {
                  setCompanies((rows) => (err instanceof MissingCompanyError
                    ? rows.filter((row) => row.id !== company.id)
                    : rows.map((row) => (row.id === company.id ? company : row))));
                  throw err;
                }
              }}
              onQuota={async (company, quota) => {
                setCompanies((rows) => rows.map((row) => (row.id === company.id ? { ...row, push_quota_override: quota } : row)));
                try {
                  await setCompanyPushQuotaAction(company.id, quota);
                } catch (err) {
                  setCompanies((rows) => rows.map((row) => (row.id === company.id ? company : row)));
                  throw err;
                }
              }}
            />
          )
        ) : tab === 'campaigns' ? (
          <AdminCampaignList
            campaigns={campaigns}
            companies={companies}
            busy={busy}
            onDelete={async (campaign) => {
              setBusy(true);
              setError(null);
              try {
                await deleteCampaignAction(campaign.id);
                await refresh();
                onChanged?.();
                setNotice('Kampanya silindi.');
              } catch (err) {
                setError(err instanceof Error ? err.message : 'Kampanya silinemedi');
              } finally {
                setBusy(false);
              }
            }}
          />
        ) : tab === 'users' ? (
          <AdminUsersPanel
            users={users}
            companies={companies}
            campaigns={campaigns}
            redemptions={redemptions}
            applications={applications}
            busy={busy}
            onSave={async (input) => {
              setBusy(true);
              setError(null);
              try {
                await upsertAdminUser(input);
                await refresh();
                setNotice(input.id ? 'Üye güncellendi.' : 'Üye eklendi.');
              } catch (err) {
                setError(err instanceof Error ? err.message : 'Kullanıcı kaydedilemedi');
              } finally {
                setBusy(false);
              }
            }}
            onDelete={setDeleteUserTarget}
          />
        ) : tab === 'apps' ? (
          <BusinessApplicationsPanel
            rows={applications}
            busy={busy}
            onApprove={async (row, pilot) => {
              setBusy(true);
              setError(null);
              try {
                await setBusinessStatusAction(row.id, 'approved', { pilot });
                await refresh();
                onChanged?.();
                setNotice(pilot ? `${row.company_name} pilot firma olarak onaylandı. 2 ay ücretsiz.` : `${row.company_name} onaylandı. Firma paneli açıldı.`);
              } catch (err) {
                setError(err instanceof Error ? err.message : 'Onaylanamadı');
              } finally {
                setBusy(false);
              }
            }}
            onReject={async (row) => {
              setBusy(true);
              setError(null);
              try {
                await setBusinessStatusAction(row.id, 'rejected');
                await refresh();
                setNotice(`${row.company_name} reddedildi.`);
              } catch (err) {
                setError(err instanceof Error ? err.message : 'Güncellenemedi');
              } finally {
                setBusy(false);
              }
            }}
          />
        ) : tab === 'company' ? (
          <CompanyForm
            busy={busy}
            onSubmit={async (input) => {
              setBusy(true);
              setError(null);
              try {
                await createCompanyAction(input);
                await refresh();
                onChanged?.();
                setNotice(input.is_pilot_firm ? 'Pilot firma eklendi. 2 ay ücretsiz.' : 'Firma eklendi.');
                setTab('list');
              } catch (err) {
                setError(err instanceof Error ? err.message : 'Firma eklenemedi');
              } finally {
                setBusy(false);
              }
            }}
          />
        ) : tab === 'stories' ? (
          <>
            <AdminShowcaseQueue />
            <StoryStudio actor="admin" allowPlatform companies={companies} onChanged={onChanged} />
          </>
        ) : tab === 'vip' ? (
          <AdminVipDesk
            companies={companies}
            users={users}
            onPlan={async (company, tier) => {
              setCompanies((rows) => rows.map((row) => (row.id === company.id ? { ...row, plan_tier: tier } : row)));
              try {
                await setCompanyPlanAction(company.id, tier);
              } catch (err) {
                setCompanies((rows) => (err instanceof MissingCompanyError
                  ? rows.filter((row) => row.id !== company.id)
                  : rows.map((row) => (row.id === company.id ? company : row))));
                throw err;
              }
            }}
            onQuota={async (company, quota) => {
              setCompanies((rows) => rows.map((row) => (row.id === company.id ? { ...row, push_quota_override: quota } : row)));
              try {
                await setCompanyPushQuotaAction(company.id, quota);
              } catch (err) {
                setCompanies((rows) => rows.map((row) => (row.id === company.id ? company : row)));
                throw err;
              }
            }}
            onTerm={async (company, endsAt) => {
              setCompanies((rows) => rows.map((row) => (row.id === company.id ? { ...row, subscription_ends_at: endsAt } : row)));
              try {
                await setCompanyTermAction(company.id, endsAt);
              } catch (err) {
                setCompanies((rows) => rows.map((row) => (row.id === company.id ? company : row)));
                throw err;
              }
            }}
            onMemberVip={async (user, vip) => {
              setUsers((rows) => rows.map((row) => (row.id === user.id ? { ...row, vip } : row)));
              try {
                await setMemberVipAction(user.id, vip);
              } catch (err) {
                setUsers((rows) => rows.map((row) => (row.id === user.id ? user : row)));
                throw err;
              }
            }}
          />
        ) : tab === 'codes' ? (
          <form
            className="space-y-3 rounded-3xl border border-mint-100 bg-white p-4"
            onSubmit={async (event) => {
              event.preventDefault();
              setBusy(true);
              setError(null);
              setNotice(null);
              try {
                const inspect = await inspectCouponCode(couponCode, {
                  companies,
                  campaigns,
                  users,
                  redemptions,
                });
                setCouponInspect(inspect);
                if (!inspect.found) setError(inspect.issues[0] || 'Kupon bulunamadı.');
              } catch (err) {
                setCouponInspect(null);
                setError(err instanceof Error ? err.message : 'Kod sorgulanamadı');
              } finally {
                setBusy(false);
              }
            }}
          >
            <p className="text-sm font-extrabold text-mint-900">Kupon kodu sorgula</p>
            <p className="text-xs text-gray-400">Kod girince firma, kampanya, alan kişi ve geçerlilik görünür.</p>
            <input
              className={fieldClass}
              value={couponCode}
              onChange={(e) => { setCouponCode(e.target.value); setCouponInspect(null); }}
              placeholder="Kupon kodu"
            />
            <button type="submit" disabled={busy || !couponCode.trim()} className="btn-primary w-full py-3 disabled:opacity-50">
              {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : 'Sorgula'}
            </button>
            {couponInspect?.found && (
              <div className="space-y-2 rounded-2xl border border-mint-100 bg-mint-50/70 p-3 text-sm">
                <p className={`text-xs font-extrabold uppercase tracking-wide ${couponInspect.valid ? 'text-mint-700' : 'text-rose-600'}`}>
                  {couponInspect.valid ? 'Kod doğru · onaylanabilir' : 'Kod bulundu · onaylanamaz'}
                </p>
                <p><span className="text-gray-400">Firma: </span><b>{couponInspect.companyName ?? '—'}</b></p>
                <p><span className="text-gray-400">Kampanya: </span><b>{couponInspect.campaignTitle ?? '—'}</b></p>
                <p><span className="text-gray-400">Alan: </span><b>{couponInspect.holderName ?? '—'}</b></p>
                {couponInspect.holderEmail && <p className="text-xs text-gray-500">{couponInspect.holderEmail}{couponInspect.holderPhone ? ` · ${couponInspect.holderPhone}` : ''}</p>}
                <p className="text-xs text-gray-500">Durum: {couponInspect.status}{couponInspect.createdAt ? ` · ${new Date(couponInspect.createdAt).toLocaleString('tr-TR')}` : ''}</p>
                {couponInspect.issues.length > 0 && (
                  <ul className="list-disc pl-4 text-xs text-rose-600">
                    {couponInspect.issues.map((item) => <li key={item}>{item}</li>)}
                  </ul>
                )}
                <button
                  type="button"
                  disabled={busy || !couponInspect.valid}
                  className="btn-primary w-full py-3 disabled:opacity-50"
                  onClick={async () => {
                    setBusy(true);
                    setError(null);
                    try {
                      const result = await approveCouponCode(couponCode);
                      setNotice(`Onaylandı · ${result.code}`);
                      setCouponCode('');
                      setCouponInspect(null);
                      await refresh();
                    } catch (err) {
                      setError(err instanceof Error ? err.message : 'Onaylanamadı');
                    } finally {
                      setBusy(false);
                    }
                  }}
                >
                  {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : 'Kuponu onayla'}
                </button>
              </div>
            )}
          </form>
        ) : tab === 'banners' ? (
          <>
            <AdminShowcaseQueue />
            <AdminBannerDesk />
          </>
        ) : tab === 'controls' ? (
          <AdminControlBoundary>
            <AdminControlDesk
              users={Array.isArray(users) ? users : []}
              companies={Array.isArray(companies) ? companies : []}
              campaigns={Array.isArray(campaigns) ? campaigns : []}
              redemptions={Array.isArray(redemptions) ? redemptions : []}
            />
          </AdminControlBoundary>
        ) : null}
      </div>

      {menuOpen ? createPortal(
        <div className="fixed inset-0 z-[2000] flex justify-start bg-black/40">
          <button type="button" className="absolute inset-0" aria-label="Kapat" onClick={() => setMenuOpen(false)} />
          <aside className="relative z-[1] h-full w-[min(86%,340px)] overflow-y-auto border-r border-mint-100 bg-[#eef3f1] px-4 pb-10 pt-[max(1.1rem,env(safe-area-inset-top))] shadow-2xl">
            <div className="flex items-center justify-between">
              <p className="flex items-center gap-2 text-sm font-extrabold text-mint-800"><Shield className="h-4 w-4" /> Yönetici yetkileri</p>
              <button type="button" onClick={() => setMenuOpen(false)} className="flex h-8 w-8 items-center justify-center rounded-full bg-white text-mint-700">
                <X className="h-4 w-4" />
              </button>
            </div>
            <p className="mt-1 text-[11px] text-gray-400">Kayıt, işlem ve sistem</p>
            <div className="mt-4 space-y-3">
              {([
                {
                  title: 'Kayıtlar',
                  items: [
                    { id: 'list' as const, label: 'Firmalar', hint: 'Liste, kampanya, hikaye yetkisi', Icon: Building2 },
                    { id: 'users' as const, label: 'Kullanıcılar', hint: 'Üye hesapları', Icon: Users },
                    { id: 'apps' as const, label: 'Başvurular', hint: 'Firma kayıt onayları', Icon: Building2 },
                    { id: 'company' as const, label: 'Firma ekle', hint: 'Yeni işletme kaydı', Icon: Plus },
                  ],
                },
                {
                  title: 'İşlemler',
                  items: [
                    { id: 'stories' as const, label: 'Hikaye', hint: 'QAP görsel ve açıklama', Icon: ImagePlus },
                    { id: 'codes' as const, label: 'Kod onay', hint: 'Tüm kuponlar', Icon: KeyRound },
                  ],
                },
                {
                  title: 'Sistem',
                  items: [
                    { id: 'controls' as const, label: 'Kontrol', hint: 'Ekranlar, metin, bildirim', Icon: Shield },
                  ],
                },
              ]).map((group) => (
                <section key={group.title}>
                  <p className="mb-1.5 px-1 text-[10px] font-extrabold uppercase tracking-[0.16em] text-mint-600/80">{group.title}</p>
                  <div className="space-y-1.5">
                    {group.items.map((item) => (
                      <button
                        key={item.id}
                        type="button"
                        onClick={() => { setTab(item.id); setSelectedCompanyId(null); setMenuOpen(false); }}
                        className={`flex w-full items-start gap-3 rounded-2xl px-3 py-2.5 text-left ${tab === item.id ? 'bg-mint-100 text-mint-800' : 'bg-white text-mint-800'}`}
                      >
                        <item.Icon className="mt-0.5 h-4 w-4 shrink-0" />
                        <span>
                          <span className="block text-sm font-bold">{item.label}</span>
                          <span className="block text-[11px] text-gray-400">{item.hint}</span>
                        </span>
                      </button>
                    ))}
                  </div>
                </section>
              ))}
            </div>
            <section className="mt-5">
              <button
                type="button"
                onClick={() => setFavOpen((openNow) => !openNow)}
                className="flex w-full items-center justify-between rounded-2xl border border-mint-100 bg-white px-3 py-2.5"
              >
                <span className="flex items-center gap-1.5 text-sm font-extrabold text-mint-800">
                  <Heart className="h-4 w-4 text-rose-400" fill="currentColor" /> Favoriler
                </span>
                <span className="flex items-center gap-1 text-[11px] font-bold text-gray-400">
                  {companies.filter((item) => user && listFavoriteIds(user.id).includes(item.id)).length}
                  <ChevronDown className={`h-4 w-4 transition ${favOpen ? 'rotate-180' : ''}`} />
                </span>
              </button>
              {favOpen ? (
                <div className="mt-1.5 overflow-hidden rounded-2xl border border-mint-100 bg-white">
                  {companies.filter((item) => user && listFavoriteIds(user.id).includes(item.id)).length === 0 ? (
                    <p className="px-3 py-3 text-xs text-gray-400">Henüz favori yok.</p>
                  ) : (
                    companies.filter((item) => user && listFavoriteIds(user.id).includes(item.id)).map((item) => (
                      <button
                        key={item.id}
                        type="button"
                        onClick={() => { setTab('list'); setMenuOpen(false); }}
                        className="flex w-full items-center gap-2 border-t border-mint-50 px-3 py-2.5 text-left text-sm font-semibold text-mint-800 first:border-t-0"
                      >
                        <Heart className="h-3.5 w-3.5 text-rose-400" fill="currentColor" />
                        <span className="inline-flex min-w-0 items-center gap-1">{item.name}<VerifiedBadge verified={item.is_verified} /></span>
                      </button>
                    ))
                  )}
                </div>
              ) : null}
            </section>
            <section className="mt-5 rounded-2xl border border-mint-100 bg-white px-3 py-3 text-[11px] leading-relaxed text-mint-800/80">
              <p className="flex items-center gap-1.5 font-bold text-mint-800"><Ticket className="h-3.5 w-3.5 text-mint-500" /> Kupon</p>
              <p className="mt-1">Kod sekmesinden tüm kuponları onayla; raporlarda kullanımlar durur.</p>
            </section>
            <button
              type="button"
              onClick={() => { setMenuOpen(false); void signOut(); }}
              className="mt-5 flex w-full items-center justify-center gap-2 rounded-2xl bg-rose-50 py-2.5 text-sm font-bold text-rose-600"
            >
              <LogOut className="h-4 w-4" /> Oturumu kapat
            </button>
          </aside>
        </div>,
        document.body,
      ) : null}

      {deleteTarget && (
        <SafeCenterModal onClose={() => setDeleteTarget(null)} zIndex={2100}>
          <div className="w-full rounded-4xl border border-mint-100 bg-white p-5 shadow-2xl">
            <h3 className="text-lg font-extrabold text-mint-900">Firmayı sil?</h3>
            <p className="mt-1 text-sm text-gray-500">
              <span className="font-semibold text-mint-800">{deleteTarget.name}</span> ve bağlı kampanyalar kalıcı olarak silinir.
            </p>
            <div className="mt-4 grid grid-cols-2 gap-2">
              <button type="button" onClick={() => setDeleteTarget(null)} className="rounded-2xl bg-mint-50 px-4 py-3 font-semibold text-mint-800">Vazgeç</button>
              <button
                type="button"
                disabled={busy}
                onClick={async () => {
                  setBusy(true);
                  try {
                    await deleteCompanyAction(deleteTarget.id);
                    setDeleteTarget(null);
                    setSelectedCompanyId(null);
                    await refresh();
                    onChanged?.();
                    setNotice('Firma silindi.');
                  } catch (err) {
                    const message = err instanceof Error ? err.message : 'Silinemedi';
                    console.warn('Firma silinemedi', deleteTarget.id, message);
                    setError(message);
                  } finally {
                    setBusy(false);
                  }
                }}
                className="inline-flex items-center justify-center gap-2 rounded-2xl bg-red-500 px-4 py-3 font-semibold text-white"
              >
                {busy ? <Loader2 className="w-4 h-4 animate-spin" /> : <Trash2 className="w-4 h-4" />}
                Sil
              </button>
            </div>
          </div>
        </SafeCenterModal>
      )}

      {deleteUserTarget && (
        <SafeCenterModal onClose={() => setDeleteUserTarget(null)} zIndex={2100}>
          <div className="w-full rounded-4xl border border-mint-100 bg-white p-5 shadow-2xl">
            <h3 className="text-lg font-extrabold text-mint-900">Kullanıcıyı sil?</h3>
            <p className="mt-1 text-sm text-gray-500">
              <span className="font-semibold text-mint-800">{deleteUserTarget.email}</span> kaydı silinir.
            </p>
            <div className="mt-4 grid grid-cols-2 gap-2">
              <button type="button" onClick={() => setDeleteUserTarget(null)} className="rounded-2xl bg-mint-50 px-4 py-3 font-semibold text-mint-800">Vazgeç</button>
              <button
                type="button"
                disabled={busy}
                onClick={async () => {
                  setBusy(true);
                  try {
                    await deleteAdminUser(deleteUserTarget.id);
                    setDeleteUserTarget(null);
                    await refresh();
                    setNotice('Kullanıcı silindi.');
                  } catch (err) {
                    setError(err instanceof Error ? err.message : 'Silinemedi');
                  } finally {
                    setBusy(false);
                  }
                }}
                className="inline-flex items-center justify-center gap-2 rounded-2xl bg-red-500 px-4 py-3 font-semibold text-white"
              >
                {busy ? <Loader2 className="w-4 h-4 animate-spin" /> : <Trash2 className="w-4 h-4" />}
                Sil
              </button>
            </div>
          </div>
        </SafeCenterModal>
      )}
    </div>
  );
}

function CompanyList({
  companies, campaigns, query, onQuery, onOpen, onAdd, onVerify, onPlan, onQuota,
}: {
  companies: Company[];
  campaigns: Campaign[];
  query: string;
  onQuery: (value: string) => void;
  onOpen: (company: Company) => void;
  onAdd: () => void;
  onVerify: (company: Company, verified: boolean) => Promise<void>;
  onPlan: (company: Company, tier: 'standard' | 'premium') => Promise<void>;
  onQuota: (company: Company, quota: number | null) => Promise<void>;
}) {
  const [verifyingId, setVerifyingId] = useState<string | null>(null);
  const [verifyError, setVerifyError] = useState<string | null>(null);
  const [shown, setShown] = useState(24);
  const q = query.trim().toLocaleLowerCase('tr');
  const rows = companies
    .filter((company) => {
      if (!q) return true;
      const hay = `${company.name} ${company.category} ${company.address} ${company.email ?? ''} ${company.phone ?? ''}`.toLocaleLowerCase('tr');
      return hay.includes(q);
    })
    .sort((a, b) => a.name.localeCompare(b.name, 'tr'));

  return (
    <div className="space-y-2">
      <div className="flex gap-2">
        <label className="relative min-w-0 flex-1">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-gray-300" />
          <input
            className={`${fieldClass} !py-2 pl-9`}
            placeholder="Firma adı ara"
            value={query}
            onChange={(event) => onQuery(event.target.value)}
          />
        </label>
        <button type="button" onClick={onAdd} className="inline-flex shrink-0 items-center gap-1 rounded-2xl bg-mint-500 px-3 text-xs font-extrabold text-white">
          <Plus className="h-3.5 w-3.5" /> Firma
        </button>
      </div>
      <p className="px-1 text-[10px] font-bold uppercase tracking-wide text-mint-600">{rows.length} firma</p>
      {verifyError ? <p className="rounded-2xl bg-red-50 px-3 py-2 text-xs text-red-600">{verifyError}</p> : null}
      {rows.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-mint-100 px-3 py-8 text-center">
          <Building2 className="mx-auto h-6 w-6 text-mint-300" />
          <p className="mt-2 text-xs font-bold text-mint-800">Firma bulunamadı</p>
        </div>
      ) : (
        <div className="overflow-hidden rounded-2xl border border-mint-100 bg-white">
          {rows.slice(0, shown).map((company) => {
            const count = campaigns.filter((item) => item.company_id === company.id).length;
            const canVerify = Boolean(company.tax_number?.trim()) || Boolean(company.is_verified);
            return (
              <div key={company.id} className="border-t border-mint-50 first:border-t-0">
                <div className="flex items-center gap-1">
                <button
                  type="button"
                  onClick={() => onOpen(company)}
                  className="flex min-w-0 flex-1 items-center justify-between gap-2 px-3 py-1.5 text-left"
                >
                  <span className="min-w-0">
                    <span className="block truncate text-[12px] font-bold text-mint-900">
                      <span className="inline-flex items-center gap-1">{company.name}<VerifiedBadge verified={company.is_verified} /></span>{company.is_featured ? ' · öne çıkan' : ''}{company.plan_tier === 'premium' ? ' · premium' : ''}
                    </span>
                    <span className="block truncate text-[10px] text-gray-400">{company.category} · Vergi/TC {company.tax_number?.trim() || 'yok'}</span>
                  </span>
                  <span className="shrink-0 text-[10px] font-extrabold text-mint-600">{count}</span>
                </button>
                <button
                  type="button"
                  disabled={verifyingId === company.id || !canVerify}
                  title={canVerify ? (company.is_verified ? 'Yeşil tiki kaldır' : 'Onaylı firma yap') : 'Önce vergi veya T.C. kimlik numarası gerekli'}
                  onClick={() => {
                    setVerifyError(null);
                    setVerifyingId(company.id);
                    void onVerify(company, !company.is_verified)
                      .catch((err: unknown) => setVerifyError(err instanceof Error ? err.message : 'Onay güncellenemedi'))
                      .finally(() => setVerifyingId(null));
                  }}
                  className={`mr-2 rounded-full p-1.5 ${company.is_verified ? 'bg-emerald-50 text-emerald-600' : 'bg-slate-50 text-slate-300'}`}
                  aria-label={company.is_verified ? 'Onayı kaldır' : 'Onaylı firma yap'}
                >
                  <BadgeCheck className="h-4 w-4" />
                </button>
                </div>
                <div className="flex flex-wrap items-center gap-1 px-3 pb-2">
                  {(['standard', 'premium'] as const).map((tier) => (
                    <button
                      key={tier}
                      type="button"
                      onClick={() => {
                        setVerifyError(null);
                        void onPlan(company, tier).catch((err: unknown) => setVerifyError(err instanceof Error ? err.message : 'Paket yazılamadı'));
                      }}
                      className={`rounded-full px-2 py-0.5 text-[10px] font-extrabold ${company.plan_tier === tier || (!company.plan_tier && tier === 'standard') ? 'bg-mint-500 text-white' : 'bg-mint-50 text-mint-700'}`}
                    >
                      {tier === 'premium' ? 'Premium 1299' : 'Standard 599'}
                    </button>
                  ))}
                  <label className="ml-auto flex items-center gap-1 text-[10px] font-bold text-gray-400">
                    Bildirim
                    <input
                      key={`${company.id}-${company.push_quota_override ?? 'auto'}`}
                      defaultValue={company.push_quota_override ?? ''}
                      inputMode="numeric"
                      placeholder="oto"
                      className="w-10 rounded-lg border border-mint-100 px-1 py-0.5 text-[10px] text-mint-800"
                      onBlur={(event) => {
                        const raw = event.target.value.trim();
                        const quota = raw === '' ? null : Math.max(0, Math.min(52, Number(raw)));
                        if (raw !== '' && !Number.isFinite(quota)) return;
                        void onQuota(company, quota).catch((err: unknown) => setVerifyError(err instanceof Error ? err.message : 'Hak yazılamadı'));
                      }}
                    />
                  </label>
                </div>
              </div>
            );
          })}
        </div>
      )}
      {rows.length > shown ? (
        <button type="button" onClick={() => setShown((value) => value + 24)} className="w-full rounded-2xl bg-white py-2 text-xs font-extrabold text-mint-700">
          Daha fazla ({rows.length - shown})
        </button>
      ) : null}
    </div>
  );
}

function CompanyForm({
  busy,
  onSubmit,
}: {
  busy: boolean;
  onSubmit: (input: {
    name: string;
    description: string;
    category: string;
    latitude: number;
    longitude: number;
    address: string;
    is_featured: boolean;
    phone: string;
    email: string;
    password: string;
    is_pilot_firm: boolean;
  }) => Promise<void>;
}) {
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [category, setCategory] = useState<string>(CATEGORIES[0]);
  const [mode, setMode] = useState<'manual' | 'map'>('manual');
  const [city, setCity] = useState('İstanbul');
  const [district, setDistrict] = useState('Kadıköy');
  const [neighborhood, setNeighborhood] = useState('');
  const [street, setStreet] = useState('');
  const [door, setDoor] = useState('');
  const [latitude, setLatitude] = useState(DEFAULT_LAT);
  const [longitude, setLongitude] = useState(DEFAULT_LNG);
  const [featured, setFeatured] = useState(false);
  const [pilot, setPilot] = useState(false);
  const [phone, setPhone] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [geoBusy, setGeoBusy] = useState(false);

  const addressLabel = useMemo(() => {
    return [street, door ? `No: ${door}` : '', neighborhood, district, city].map((part) => part.trim()).filter(Boolean).join(', ');
  }, [city, district, neighborhood, street, door]);

  const applyCoords = async (lat: number, lng: number) => {
    setLatitude(lat);
    setLongitude(lng);
    setGeoBusy(true);
    const geo = await reverseNominatim(lat, lng);
    setGeoBusy(false);
    if (!geo) return;
    setCity(geo.city || city);
    setDistrict(geo.district || district);
    setStreet(geo.neighborhood || geo.label);
  };

  const geocodeManual = async () => {
    const query = addressLabel;
    if (!query) return;
    setGeoBusy(true);
    const found = await searchNominatim(query);
    setGeoBusy(false);
    if (!found) return;
    setLatitude(found.latitude);
    setLongitude(found.longitude);
  };

  return (
    <form
      className="space-y-3"
      onSubmit={(event) => {
        event.preventDefault();
        if (!name.trim() || !addressLabel || password.length < 6) return;
        void onSubmit({
          name,
          description,
          category,
          latitude,
          longitude,
          address: addressLabel,
          is_featured: featured,
          phone,
          email,
          password,
          is_pilot_firm: pilot,
        });
      }}
    >
      <input className={fieldClass} required placeholder="Firma adı" value={name} onChange={(e) => setName(e.target.value)} />
      <input
        className={fieldClass}
        required
        type="tel"
        placeholder="Telefon"
        value={phone}
        onChange={(e) => setPhone(e.target.value)}
      />
      <input
        className={fieldClass}
        required
        type="email"
        placeholder="E-posta"
        value={email}
        onChange={(e) => setEmail(e.target.value)}
      />
      <input
        className={fieldClass}
        required
        type="text"
        autoComplete="new-password"
        minLength={6}
        placeholder="Giriş şifresi"
        value={password}
        onChange={(e) => setPassword(e.target.value)}
      />
      <textarea className={`${fieldClass} min-h-[88px]`} placeholder="Açıklama / Hakkında" value={description} onChange={(e) => setDescription(e.target.value)} />
      <select className={fieldClass} value={category} onChange={(e) => setCategory(e.target.value)}>
        {CATEGORIES.map((item) => <option key={item}>{item}</option>)}
      </select>

      <div className="grid grid-cols-2 gap-1 rounded-2xl bg-mint-50 p-1">
        <button type="button" onClick={() => setMode('manual')} className={mode === 'manual' ? modeOn : modeOff}>Manuel adres</button>
        <button type="button" onClick={() => setMode('map')} className={mode === 'map' ? modeOn : modeOff}>Haritadan pin</button>
      </div>

      {mode === 'manual' ? (
        <div className="space-y-2">
          <input className={fieldClass} placeholder="İl" value={city} onChange={(e) => setCity(e.target.value)} />
          <input className={fieldClass} placeholder="İlçe" value={district} onChange={(e) => setDistrict(e.target.value)} />
          <input className={fieldClass} placeholder="Mahalle" value={neighborhood} onChange={(e) => setNeighborhood(e.target.value)} />
          <input className={fieldClass} required placeholder="Cadde / Sokak" value={street} onChange={(e) => setStreet(e.target.value)} />
          <input className={fieldClass} placeholder="Bina / Kapı no" value={door} onChange={(e) => setDoor(e.target.value)} />
          <button type="button" onClick={() => void geocodeManual()} className="inline-flex w-full items-center justify-center gap-2 rounded-2xl bg-mint-50 px-4 py-2.5 text-sm font-semibold text-mint-800">
            {geoBusy ? <Loader2 className="w-4 h-4 animate-spin" /> : <MapPin className="w-4 h-4" />}
            Adresten koordinat al
          </button>
        </div>
      ) : (
        <div className="space-y-2">
          <p className="text-xs text-gray-400">Haritaya dokun, pin bırak. Adres otomatik dolar.</p>
          <CompanyMapPicker
            latitude={latitude}
            longitude={longitude}
            autoLocate
            onPick={(lat, lng) => void applyCoords(lat, lng)}
          />
          <input className={fieldClass} placeholder="İl" value={city} onChange={(e) => setCity(e.target.value)} />
          <input className={fieldClass} placeholder="İlçe" value={district} onChange={(e) => setDistrict(e.target.value)} />
          <input className={fieldClass} placeholder="Mahalle" value={neighborhood} onChange={(e) => setNeighborhood(e.target.value)} />
          <input className={fieldClass} placeholder="Cadde / Sokak" value={street} onChange={(e) => setStreet(e.target.value)} />
          <input className={fieldClass} placeholder="Bina / Kapı no" value={door} onChange={(e) => setDoor(e.target.value)} />
        </div>
      )}

      <p className="text-[11px] font-semibold text-mint-700">
        {geoBusy ? 'Konum çözülüyor…' : `${latitude.toFixed(5)}, ${longitude.toFixed(5)}`}
      </p>

      <label className="flex items-center gap-2 text-sm font-semibold text-mint-800">
        <input type="checkbox" checked={featured} onChange={(e) => setFeatured(e.target.checked)} />
        Haritada öne çıkar
      </label>
      <label className="flex items-start gap-2 rounded-2xl bg-mint-50 px-3 py-3 text-sm font-semibold text-mint-800">
        <input type="checkbox" className="mt-1" checked={pilot} onChange={(e) => setPilot(e.target.checked)} />
        <span>
          Pilot Firma (2 Ay Ücretsiz)
          <span className="mt-0.5 block text-xs font-semibold text-mint-600">Bitiş bugünden 60 gün sonrası olur. Bu sürede ödeme ekranı açılmaz; süre bitince ücretli plana geçer.</span>
        </span>
      </label>

      <button type="submit" disabled={busy} className="inline-flex w-full items-center justify-center gap-2 rounded-2xl bg-mint-500 py-3.5 font-semibold text-white disabled:opacity-50">
        {busy ? <Loader2 className="w-5 h-5 animate-spin" /> : <><Plus className="w-4 h-4" /> Firmayı kaydet</>}
      </button>
    </form>
  );
}

const fieldClass = 'w-full rounded-2xl border-2 border-mint-100 bg-white px-4 py-3 text-sm text-mint-800 placeholder:text-gray-300 focus:border-mint-400 focus:outline-none';
const modeOn = 'rounded-xl bg-mint-500 py-2 text-sm font-bold text-white';
const modeOff = 'rounded-xl py-2 text-sm font-bold text-mint-600';
