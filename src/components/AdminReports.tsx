import { BarChart3, Building2, Ticket, Users } from 'lucide-react';
import type { AppUser, Campaign, Company, UserRedemption } from '@/lib/campaigns';
import { CampaignMiniList } from '@/components/CampaignMiniList';

function asReportList<T>(value: T[] | null | undefined): T[] {
  return Array.isArray(value) ? value : [];
}

export function AdminReportsPanel({
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
  const companyRows = asReportList(companies).map((company) => {
    const companyCampaigns = asReportList(campaigns).filter((item) => item.company_id === company.id);
    const ids = new Set(companyCampaigns.map((item) => item.id));
    const uses = asReportList(redemptions).filter((row) => ids.has(row.campaign_id)).length;
    return { company, campaigns: companyCampaigns, uses };
  }).sort((a, b) => b.uses - a.uses);

  const userRows = asReportList(users).map((user) => {
    const ownedRedemptions = asReportList(redemptions);
    const uses = ownedRedemptions.filter((row) => row.user_id === user.id).length;
    const last = ownedRedemptions.find((row) => row.user_id === user.id)?.redeemed_at;
    return { user, uses, last };
  }).sort((a, b) => b.uses - a.uses);

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-2">
        <Metric icon={Users} label="Kullanıcı" value={asReportList(users).length} />
        <Metric icon={Building2} label="Firma" value={asReportList(companies).length} />
        <Metric icon={Ticket} label="Kampanya" value={asReportList(campaigns).length} />
        <Metric icon={BarChart3} label="Kullanım" value={asReportList(redemptions).length} />
      </div>

      <section className="rounded-3xl border border-mint-100 bg-white p-4">
        <h3 className="font-extrabold text-mint-900">Firma kupon raporları</h3>
        <p className="mt-0.5 text-[11px] text-gray-400">Aktif kupon sayısı ve kalan süre</p>
        <div className="mt-3 space-y-3">
          {companyRows.length === 0 && <p className="text-sm text-gray-400">Firma yok.</p>}
          {companyRows.map(({ company, campaigns: owned, uses }) => (
            <div key={company.id} className="rounded-2xl border border-mint-50 bg-cream-50 p-3">
              <div className="flex items-center justify-between gap-2 text-sm">
                <div>
                  <p className="font-bold text-mint-900">{company.name}</p>
                  <p className="text-[11px] text-gray-400">{owned.length} kampanya · {uses} kullanım</p>
                </div>
              </div>
              <div className="mt-2">
                <CampaignMiniList campaigns={owned} />
              </div>
            </div>
          ))}
        </div>
      </section>

      <section className="rounded-3xl border border-mint-100 bg-white p-4">
        <h3 className="font-extrabold text-mint-900">Kullanıcı aktivitesi</h3>
        <div className="mt-3 space-y-2">
          {userRows.length === 0 && <p className="text-sm text-gray-400">Kullanıcı yok.</p>}
          {userRows.slice(0, 20).map(({ user, uses, last }) => (
            <div key={user.id} className="flex items-center justify-between gap-2 text-sm">
              <div>
                <p className="max-w-[220px] truncate font-bold text-mint-800">{user.email}</p>
                <p className="text-[11px] text-gray-400">{last ? new Date(last).toLocaleString('tr-TR') : 'İşlem yok'}</p>
              </div>
              <p className="font-extrabold text-mint-600">{uses}</p>
            </div>
          ))}
        </div>
      </section>
    </div>
  );
}

function Metric({ icon: Icon, label, value }: { icon: typeof Users; label: string; value: number }) {
  return (
    <div className="rounded-3xl border border-mint-100 bg-white p-3">
      <div className="flex items-center gap-2 text-mint-600">
        <Icon className="h-4 w-4" />
        <p className="text-[10px] uppercase tracking-wide text-gray-400">{label}</p>
      </div>
      <p className="mt-1 text-xl font-extrabold text-mint-900">{value}</p>
    </div>
  );
}
