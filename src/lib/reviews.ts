export type CompanyReview = {
  id: string;
  company_id: string;
  user_id: string;
  coupon_id: string;
  rating: number;
  text: string;
  created_at: string;
};

const KEY = 'qapla_company_reviews';

export function readReviews(): CompanyReview[] {
  try {
    const parsed = JSON.parse(localStorage.getItem(KEY) ?? '[]') as CompanyReview[];
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

export function reviewsForCompany(companyId: string) {
  return readReviews()
    .filter((item) => item.company_id === companyId)
    .sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());
}

export function reviewsForUser(userId: string) {
  return readReviews()
    .filter((item) => item.user_id === userId)
    .sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());
}

export function addReview(input: Omit<CompanyReview, 'id' | 'created_at'>) {
  const row: CompanyReview = {
    ...input,
    id: crypto.randomUUID(),
    created_at: new Date().toISOString(),
  };
  localStorage.setItem(KEY, JSON.stringify([row, ...readReviews()]));
  return row;
}
