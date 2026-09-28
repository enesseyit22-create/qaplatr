import { useEffect, useState } from 'react';
import { Bell, Building2, Loader2, UserPlus } from 'lucide-react';
import { useAuth } from '@/lib/authContext';
import {
  loadAdminNotifySettings,
  updateAdminNotifyFlag,
  type AdminNotifySettings,
} from '@/lib/adminSettings';

export function AdminNotificationSettings() {
  const { user, profile } = useAuth();
  const adminId = profile?.role === 'admin' ? (user?.id ?? profile.id) : '';
  const [settings, setSettings] = useState<AdminNotifySettings | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState<string | null>(null);

  useEffect(() => {
    if (!adminId) {
      setLoading(false);
      return;
    }
    let cancelled = false;
    setLoading(true);
    void loadAdminNotifySettings(adminId).then((next) => {
      if (!cancelled) {
        setSettings(next);
        setLoading(false);
      }
    });
    return () => {
      cancelled = true;
    };
  }, [adminId]);

  const toggle = async (field: 'notify_user_signup' | 'notify_business_signup', value: boolean) => {
    if (!adminId || !settings) return;
    setSettings({ ...settings, [field]: value });
    setSaving(field);
    const saved = await updateAdminNotifyFlag(adminId, field, value);
    if (saved) setSettings(saved);
    setSaving(null);
  };

  if (!adminId) {
    return <p className="rounded-2xl bg-white px-4 py-6 text-center text-sm text-gray-400">Yalnızca yöneticiler bu ayarları görür.</p>;
  }

  if (loading || !settings) {
    return (
      <div className="flex justify-center py-10">
        <Loader2 className="h-5 w-5 animate-spin text-mint-500" />
      </div>
    );
  }

  return (
    <div className="space-y-3">
      <div>
        <p className="text-[10px] font-extrabold uppercase tracking-[0.16em] text-mint-600">Yönetici bildirimleri</p>
        <h2 className="mt-1 text-lg font-extrabold text-mint-900">Kayıt bildirim tercihleri</h2>
        <p className="mt-1 text-xs leading-relaxed text-gray-500">
          Yeni üye veya firma başvurusunda telefona push gider. Cihaz token’ı girişte otomatik kaydedilir.
        </p>
      </div>

      <ToggleRow
        icon={UserPlus}
        title="Yeni kullanıcı kayıtlarında bildirim al"
        hint="Üye olduğunda “Yeni Kullanıcı Kaydoldu” gönderilir."
        on={settings.notify_user_signup}
        busy={saving === 'notify_user_signup'}
        onChange={(value) => void toggle('notify_user_signup', value)}
      />
      <ToggleRow
        icon={Building2}
        title="Yeni firma başvurularında bildirim al"
        hint="Başvuru gelince “Yeni Firma Başvurusu Bulunuyor” gider."
        on={settings.notify_business_signup}
        busy={saving === 'notify_business_signup'}
        onChange={(value) => void toggle('notify_business_signup', value)}
      />

      <p className="flex items-center gap-1.5 px-1 text-[11px] text-gray-400">
        <Bell className="h-3.5 w-3.5" />
        {settings.fcm_token ? 'Bu cihazda bildirim token’ı kayıtlı.' : 'Token henüz yok. Yönetici olarak uygulamayı telefonda açın.'}
      </p>
    </div>
  );
}

function ToggleRow({
  icon: Icon,
  title,
  hint,
  on,
  busy,
  onChange,
}: {
  icon: typeof Bell;
  title: string;
  hint: string;
  on: boolean;
  busy: boolean;
  onChange: (value: boolean) => void;
}) {
  return (
    <div className="flex items-start gap-3 rounded-3xl border border-mint-100 bg-white p-4">
      <span className="mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-2xl bg-mint-50 text-mint-700">
        <Icon className="h-4 w-4" />
      </span>
      <div className="min-w-0 flex-1">
        <p className="text-sm font-extrabold text-mint-900">{title}</p>
        <p className="mt-0.5 text-xs leading-relaxed text-gray-400">{hint}</p>
      </div>
      <button
        type="button"
        role="switch"
        aria-checked={on}
        disabled={busy}
        onClick={() => onChange(!on)}
        className={`relative mt-0.5 h-7 w-12 shrink-0 rounded-full transition ${on ? 'bg-mint-500' : 'bg-gray-200'} disabled:opacity-50`}
      >
        <span className={`absolute top-0.5 h-6 w-6 rounded-full bg-white shadow-sm transition ${on ? 'left-5' : 'left-0.5'}`} />
      </button>
    </div>
  );
}
