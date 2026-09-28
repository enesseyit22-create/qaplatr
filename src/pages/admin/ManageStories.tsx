import { StoryStudio } from '@/components/StoryStudio';
import type { Company } from '@/lib/campaigns';

export function ManageStories({ companies = [] }: { companies?: Company[] }) {
  return (
    <div className="space-y-3">
      <div>
        <p className="text-[10px] font-extrabold uppercase tracking-[0.16em] text-mint-600">Hikayeler</p>
        <h2 className="text-lg font-extrabold text-mint-900">Hikaye yönetimi</h2>
        <p className="mt-1 text-xs text-gray-500">Yeni hikaye yükle, mevcutları görüntüle veya sil.</p>
      </div>
      <StoryStudio actor="admin" allowPlatform companies={companies} />
    </div>
  );
}
