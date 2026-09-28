import { Check, Sparkles } from 'lucide-react';
import { TabPageShell } from '@/components/TabPageShell';
import { VipGoldMark } from '@/components/VipGoldMark';
import { useAuth } from '@/lib/authContext';
import { displayNameFrom } from '@/lib/auth';

type VipAudience = 'guest' | 'user' | 'merchant';

function copyFor(audience: VipAudience, name: string, firm: string) {
  if (audience === 'merchant') {
    return {
      kicker: 'Firmana özel',
      title: 'QAP VIP',
      subtitle: firm ? `${firm} vitrini` : 'İşletmene özel üyelik',
      pageSub: 'Firmana özel QAP üyelik.',
      body: firm
        ? `${firm} için Standard 599 TL/ay, Premium lansman 1299 TL/ay. Premium ile hikaye ve bölgesel bildirim açılır.`
        : 'QAP VIP firmana bağlıdır. Altın rozet, hikaye, bildirim ve günlük paylaşım kotası bu üyeliğe özeldir.',
      items: [
        'Standart hesap: günde 1 gönderi ve 1 kampanya',
        'Premium: günde 5 paylaşım, hikaye ve haftada 2 bölgesel bildirim',
        'Lansman 1299 TL/ay, normal fiyat 1599 TL/ay',
        'Standard: 599 TL/ay, günde 1 kampanya',
      ],
      foot: 'Premium lansman 1299 TL/ay',
    };
  }
  if (audience === 'user') {
    return {
      kicker: 'Sana özel',
      title: 'QAP VIP',
      subtitle: name ? `${name}, sıran önde` : 'Üyeye özel öncelik',
      pageSub: 'Sana özel öncelikli sıra.',
      body: 'QAP VIP kullanıcıda öncelik demek. Kupon kuyruğunda öne geçersin, yakındaki VIP fırsatları önce sen görürsün, dolu saatlerde sıran korunur.',
      items: [
        'Kupon ve fırsatta öncelikli sıra',
        'Yakındaki VIP işletmeleri ilk sen gör',
        'Dolu saatlerde ayrı kuyruk',
      ],
      foot: 'Üye önceliği yakında',
    };
  }
  return {
    kicker: 'Yakında',
    title: 'QAP VIP',
    subtitle: 'Genel VIP üyelik',
    pageSub: 'Genel VIP · yakında.',
    body: 'QAP VIP yakında. Öncelikli sıra, özel fırsatlar ve öne çıkan işletmeler tek yerde toplanacak. Üye olunca sana özel, işletmelerde firmaya özel açılır.',
    items: [
      'Öncelikli sıra ve kuyruk',
      'Öne çıkan VIP işletmeler',
      'Üye ve firmaya özel ayrı haklar',
    ],
    foot: 'Çok yakında',
  };
}

export function VipSoonScreen() {
  const { user, profile } = useAuth();
  const audience: VipAudience = !user ? 'guest' : profile?.role === 'merchant' ? 'merchant' : 'user';
  const copy = copyFor(audience, displayNameFrom(profile, user?.email), '');
  return (
    <TabPageShell title="QAP VIP" subtitle={copy.pageSub}>
      <VipSoonCard />
    </TabPageShell>
  );
}

export function VipSoonCard({
  compact = false,
  companyName,
  audience: audienceProp,
}: {
  compact?: boolean;
  companyName?: string | null;
  audience?: VipAudience;
}) {
  const { user, profile } = useAuth();
  const audience: VipAudience = audienceProp
    ?? (!user ? 'guest' : profile?.role === 'merchant' ? 'merchant' : 'user');
  const copy = copyFor(
    audience,
    displayNameFrom(profile, user?.email),
    companyName?.trim() ?? '',
  );

  return (
    <div className={`relative overflow-hidden rounded-[28px] border border-amber-200/80 bg-white text-[#3d2a08] shadow-[0_12px_32px_-18px_rgba(166,124,20,0.4)] ${compact ? 'p-5' : 'p-6'}`}>
      <div className="relative">
        <div className="flex flex-col items-center text-center">
          <VipGoldMark className="h-[6.25rem] w-[6.25rem]" />
          <p className="mt-4 text-[10px] font-extrabold uppercase tracking-[0.28em] text-amber-700/80">{copy.kicker}</p>
          <h2 className="mt-1 font-display text-4xl font-black tracking-tight text-mint-900">
            QAP<span className="text-amber-700"> VIP</span>
          </h2>
          <p className="mt-1 text-sm font-bold text-amber-800/90">{copy.subtitle}</p>
        </div>
        <p className="mt-4 text-center text-sm leading-relaxed text-mint-800/75">{copy.body}</p>
        <ul className="mt-4 space-y-2 text-left text-sm font-semibold text-mint-800">
          {copy.items.map((line) => (
            <li key={line} className="flex items-start gap-2 rounded-2xl bg-amber-50/80 px-3 py-2">
              <Check className="mt-0.5 h-4 w-4 shrink-0 text-amber-700" />
              {line}
            </li>
          ))}
        </ul>
        <div className="mt-5 flex items-center justify-center gap-2 rounded-full bg-amber-50 px-3 py-2 text-[11px] font-extrabold uppercase tracking-wide text-amber-800/85">
          <Sparkles className="h-3.5 w-3.5" /> {copy.foot}
        </div>
      </div>
    </div>
  );
}
