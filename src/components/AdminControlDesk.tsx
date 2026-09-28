import { Component, useState, type ErrorInfo, type ReactNode } from 'react';
import { CreditCard, Bell, Building2, ChevronLeft, FileText, HelpCircle, ImagePlus, Lock, Send, Settings, Smartphone, Users,
} from 'lucide-react';
import { AdminSubscriptionDesk } from '@/components/AdminSubscriptionDesk';
import { ReachDesk } from '@/components/ReachDesk';
import { AdminVipDesk } from '@/components/AdminVipDesk';
import { AdminReportsPanel } from '@/components/AdminReports';
import {
  MERCHANT_FEATURE_ITEMS,
  USER_FEATURE_ITEMS,
  setAppFeature,
  useAppFeatures,
  type MerchantFeatureId,
  type UserFeatureId,
} from '@/lib/appFeatures';
import { addAppNotice, type NoticeAudience } from '@/lib/notices';
import { readLegalDocs, writeLegalDocs } from '@/lib/legalDocs';
import { AdminNotificationSettings } from '@/pages/admin/AdminNotificationSettings';
import { ManageNotifications } from '@/pages/admin/ManageNotifications';
import { ManageStories } from '@/pages/admin/ManageStories';
import type { AppUser, Campaign, Company, UserRedemption } from '@/lib/campaigns';
import { setCompanyPlanAction, setCompanyPushQuotaAction, setCompanyTermAction, setMemberVipAction } from '@/lib/actions/admin';

type Hub = 'home' | 'user' | 'merchant' | 'vip' | 'subscription' | 'legal' | 'help' | 'notify' | 'prefs' | 'storiesManage' | 'report';

const USER_GROUPS: { title: string; ids: UserFeatureId[] }[] = [
  { title: 'Hesap', ids: ['details', 'security', 'settings'] },
  { title: 'Keşfet', ids: ['explore', 'coupons', 'saved', 'reviews'] },
  { title: 'Destek', ids: ['notify', 'help', 'legal', 'contact'] },
];

const MERCHANT_GROUPS: { title: string; ids: MerchantFeatureId[] }[] = [
  { title: 'Hesap', ids: ['details', 'security', 'settings'] },
  { title: 'Operasyon', ids: ['code', 'campaigns', 'stories', 'report'] },
  { title: 'Keşfet', ids: ['explore'] },
  { title: 'Destek', ids: ['notify', 'help', 'legal', 'contact'] },
];

function asList<T>(value: T[] | null | undefined): T[] {
  return Array.isArray(value) ? value : [];
}

export class AdminControlBoundary extends Component<{ children: ReactNode }, { crashed: boolean }> {
  state = { crashed: false };

  static getDerivedStateFromError() {
    return { crashed: true };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error('Admin kontrol crash', error, info.componentStack);
  }

  render() {
    if (this.state.crashed) {
      return (
        <div className="rounded-3xl border border-mint-100 bg-white p-4">
          <p className="text-sm font-extrabold text-mint-900">Kontrol açılamadı</p>
          <p className="mt-1 text-xs text-gray-400">Bu bölüm yüklenirken bir hata oluştu. Diğer sekmeler duruyor.</p>
          <button
            type="button"
            onClick={() => this.setState({ crashed: false })}
            className="mt-3 rounded-2xl bg-mint-500 px-3 py-2 text-xs font-extrabold text-white"
          >
            Tekrar dene
          </button>
        </div>
      );
    }
    return this.props.children;
  }
}

export function AdminControlDesk({
  users,
  companies,
  campaigns,
  redemptions,
}: {
  users?: AppUser[] | null;
  companies?: Company[] | null;
  campaigns?: Campaign[] | null;
  redemptions?: UserRedemption[] | null;
}) {
  const safeUsers = asList(users);
  const safeCompanies = asList(companies);
  const safeCampaigns = asList(campaigns);
  const safeRedemptions = asList(redemptions);
  const [hub, setHub] = useState<Hub>('home');
  const features = useAppFeatures();

  if (hub !== 'home') {
    return (
      <div className="space-y-3">
        <button type="button" onClick={() => setHub('home')} className="inline-flex items-center gap-1 text-xs font-bold text-mint-600">
          <ChevronLeft className="h-4 w-4" /> Kontrol
        </button>
        {hub === 'user' ? (
          <GroupedToggles
            title="Kullanıcı ekranları"
            groups={USER_GROUPS}
            items={USER_FEATURE_ITEMS}
            values={features?.user}
            onToggle={(id, value) => setAppFeature('user', id, value)}
          />
        ) : null}
        {hub === 'merchant' ? (
          <GroupedToggles
            title="Firma ekranları"
            groups={MERCHANT_GROUPS}
            items={MERCHANT_FEATURE_ITEMS}
            values={features?.merchant}
            onToggle={(id, value) => setAppFeature('merchant', id, value)}
          />
        ) : null}
        {hub === 'vip' ? (
          <AdminVipDesk
            companies={safeCompanies}
            users={safeUsers}
            onPlan={async (company, tier) => { await setCompanyPlanAction(company.id, tier); }}
            onQuota={async (company, quota) => { await setCompanyPushQuotaAction(company.id, quota); }}
            onTerm={async (company, endsAt) => { await setCompanyTermAction(company.id, endsAt); }}
            onMemberVip={async (member, vip) => { await setMemberVipAction(member.id, vip); }}
          />
        ) : null}
        {hub === 'subscription' ? <AdminSubscriptionDesk /> : null}
        {hub === 'legal' ? <LegalEditor field="privacy" title="Gizlilik" extraField="terms" extraTitle="Kullanım koşulları" /> : null}
        {hub === 'help' ? <LegalEditor field="help" title="Yardım metni" /> : null}
        {hub === 'notify' ? <ManageNotifications companies={safeCompanies} /> : null}
        {hub === 'storiesManage' ? <ManageStories companies={safeCompanies} /> : null}
        {hub === 'prefs' ? <AdminNotificationSettings /> : null}
        {hub === 'report' ? (
          <AdminReportsPanel users={safeUsers} companies={safeCompanies} campaigns={safeCampaigns} redemptions={safeRedemptions} />
        ) : null}
      </div>
    );
  }

  return (
    <div className="space-y-2.5">
      <ReachDesk />
      <HubGroup title="Uygulama">
        <HubBtn icon={Users} label="Kullanıcı" onClick={() => setHub('user')} />
        <HubBtn icon={Building2} label="Firma" onClick={() => setHub('merchant')} />
        <HubBtn icon={Lock} label="VIP" onClick={() => setHub('vip')} />
        <HubBtn icon={CreditCard} label="Abonelik" onClick={() => setHub('subscription')} />
      </HubGroup>
      <HubGroup title="Belgeler">
        <HubBtn icon={FileText} label="Sözleşme" onClick={() => setHub('legal')} />
        <HubBtn icon={HelpCircle} label="Yardım" onClick={() => setHub('help')} />
        <HubBtn icon={Settings} label="Rapor" onClick={() => setHub('report')} />
      </HubGroup>
      <HubGroup title="Duyuru">
        <HubBtn icon={Bell} label="Bildirim" onClick={() => setHub('notify')} />
        <HubBtn icon={Smartphone} label="Kayıt bildirimi" onClick={() => setHub('prefs')} />
        <HubBtn icon={ImagePlus} label="Hikaye" onClick={() => setHub('storiesManage')} />
      </HubGroup>
    </div>
  );
}

function HubGroup({
  title,
  cols = 3,
  children,
}: {
  title: string;
  cols?: 2 | 3;
  children: ReactNode;
}) {
  return (
    <section className="rounded-3xl border border-mint-100 bg-white p-3">
      <p className="mb-2 text-[10px] font-extrabold uppercase tracking-[0.16em] text-mint-600/80">{title}</p>
      <div className={`grid gap-1.5 ${cols === 2 ? 'grid-cols-2' : 'grid-cols-3'}`}>{children}</div>
    </section>
  );
}

function HubBtn({ icon: Icon, label, onClick }: { icon: typeof Users; label: string; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="flex items-center gap-2 rounded-2xl bg-mint-50/80 px-2.5 py-2 text-left active:scale-95"
    >
      <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-xl bg-white text-mint-600 shadow-sm">
        <Icon className="h-4 w-4" />
      </span>
      <span className="text-[11px] font-extrabold text-mint-800">{label}</span>
    </button>
  );
}

function GroupedToggles<T extends string>({
  title,
  groups,
  items,
  values,
  onToggle,
}: {
  title: string;
  groups: { title: string; ids: T[] }[];
  items: { id: T; label: string }[];
  values?: Record<T, boolean> | null;
  onToggle: (id: T, value: boolean) => void;
}) {
  const byId = new Map(items.map((item) => [item.id, item]));
  return (
    <div className="space-y-2.5">
      <p className="text-sm font-extrabold text-mint-900">{title}</p>
      {groups.map((group) => (
        <section key={group.title} className="rounded-3xl border border-mint-100 bg-white p-3">
          <p className="mb-2 text-[10px] font-extrabold uppercase tracking-[0.16em] text-mint-600/80">{group.title}</p>
          <div className="flex flex-wrap gap-1.5">
            {group.ids.map((id) => {
              const item = byId.get(id);
              if (!item) return null;
              const on = values?.[id] !== false;
              return (
                <button
                  key={id}
                  type="button"
                  onClick={() => onToggle(id, !on)}
                  className={`rounded-full px-2.5 py-1 text-[11px] font-bold ${on ? 'bg-mint-500 text-white' : 'bg-cream-50 text-gray-400'}`}
                >
                  {item.label}
                </button>
              );
            })}
          </div>
        </section>
      ))}
    </div>
  );
}

function LegalEditor({
  field,
  title,
  extraField,
  extraTitle,
}: {
  field: 'privacy' | 'terms' | 'help';
  title: string;
  extraField?: 'privacy' | 'terms' | 'help';
  extraTitle?: string;
}) {
  const [docs, setDocs] = useState(readLegalDocs);
  const save = (key: 'privacy' | 'terms' | 'help', value: string) => {
    const next = { ...docs, [key]: value };
    setDocs(next);
    void writeLegalDocs(next);
  };
  return (
    <div className="space-y-3">
      <label className="block rounded-3xl border border-mint-100 bg-white p-3">
        <span className="text-sm font-extrabold text-mint-900">{title}</span>
        <textarea
          className="mt-2 min-h-[8rem] w-full resize-none rounded-2xl border-2 border-mint-100 px-3 py-2 text-sm text-mint-800"
          value={docs?.[field] ?? ''}
          onChange={(event) => save(field, event.target.value)}
        />
      </label>
      {extraField ? (
        <label className="block rounded-3xl border border-mint-100 bg-white p-3">
          <span className="text-sm font-extrabold text-mint-900">{extraTitle}</span>
          <textarea
            className="mt-2 min-h-[8rem] w-full resize-none rounded-2xl border-2 border-mint-100 px-3 py-2 text-sm text-mint-800"
            value={docs?.[extraField] ?? ''}
            onChange={(event) => save(extraField, event.target.value)}
          />
        </label>
      ) : null}
    </div>
  );
}

function NoticeComposer({ companies }: { companies: Company[] }) {
  const [audience, setAudience] = useState<NoticeAudience>('all');
  const [asCompany, setAsCompany] = useState('');
  const [title, setTitle] = useState('');
  const [body, setBody] = useState('');
  const [done, setDone] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const firm = companies.find((item) => item.id === asCompany);

  return (
    <form
      className="space-y-2 rounded-3xl border border-mint-100 bg-white p-3"
      onSubmit={async (event) => {
        event.preventDefault();
        if (!title.trim() || !body.trim()) return;
        setBusy(true);
        setDone(null);
        try {
          const companyId = audience === 'merchants' && asCompany ? asCompany : null;
          const published = await addAppNotice({
            title: title.trim(),
            body: body.trim(),
            from_kind: companyId ? 'company' : 'admin',
            from_name: companyId ? (firm?.name ?? 'QapLA') : 'QapLA',
            audience,
            company_id: companyId,
          });
          setTitle('');
          setBody('');
          setDone(published.warning ?? (
            audience === 'all'
              ? 'Misafir, kullanıcı ve firmaya ayrı ayrı gönderildi'
              : audience === 'guests'
                ? 'Misafirlere push olarak gönderildi'
                : audience === 'users'
                  ? 'Kullanıcılara push olarak gönderildi'
                  : companyId
                    ? `${firm?.name} firmasına push olarak gönderildi`
                    : 'Firmalara push olarak gönderildi'
          ));
        } catch (err) {
          const message = err instanceof Error ? err.message : 'Gönderilemedi';
          console.error('Bildirim gönderilemedi', message, err);
          setDone(message);
        } finally {
          setBusy(false);
        }
      }}
    >
      <p className="text-sm font-extrabold text-mint-900">Bildirim gönder</p>
      <p className="text-[11px] text-gray-400">
        {audience === 'all'
          ? 'Tümü; misafir, kullanıcı ve firmaya ayrı bildirim olarak gider.'
          : 'Yalnızca yönetici. Seçilen kitleye gider.'}
      </p>
      <div className="grid grid-cols-4 gap-1.5">
        {([
          ['all', 'Tümü'],
          ['guests', 'Misafir'],
          ['users', 'Kullanıcı'],
          ['merchants', 'Firma'],
        ] as const).map(([id, label]) => (
          <button
            key={id}
            type="button"
            onClick={() => { setAudience(id); if (id !== 'merchants') setAsCompany(''); }}
            className={`rounded-2xl px-2 py-2 text-[11px] font-extrabold ${audience === id ? 'bg-mint-500 text-white' : 'bg-mint-50 text-mint-700'}`}
          >
            {label}
          </button>
        ))}
      </div>
      {audience === 'merchants' ? (
        <select
          className="w-full rounded-2xl border-2 border-mint-100 bg-white px-3 py-2 text-sm text-mint-800"
          value={asCompany}
          onChange={(event) => setAsCompany(event.target.value)}
        >
          <option value="">Tüm firmalar</option>
          {companies.map((item) => (
            <option key={item.id} value={item.id}>{item.name}</option>
          ))}
        </select>
      ) : null}
      <input className="w-full rounded-2xl border-2 border-mint-100 px-3 py-2 text-sm" placeholder="Başlık" value={title} onChange={(event) => setTitle(event.target.value)} />
      <textarea className="min-h-[5.5rem] w-full resize-none rounded-2xl border-2 border-mint-100 px-3 py-2 text-sm" placeholder="Metin" value={body} onChange={(event) => setBody(event.target.value)} />
      <button type="submit" disabled={busy} className="inline-flex w-full items-center justify-center gap-1.5 rounded-2xl bg-mint-500 py-2.5 text-sm font-extrabold text-white disabled:opacity-50">
        <Send className="h-4 w-4" /> {busy ? 'Gönderiliyor' : 'Gönder'}
      </button>
      {done ? <p className={`text-center text-xs font-bold ${done.includes('kayda alındı') || done.includes('kaydedildi') ? 'text-amber-700' : done.includes('gönderildi') ? 'text-mint-600' : 'text-red-600'}`}>{done}</p> : null}
    </form>
  );
}
