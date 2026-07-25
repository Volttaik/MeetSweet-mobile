import { apiFetch } from './api';

export interface Category {
  id: string;
  name: string;
  slug: string;
  postCount: number;
}

export async function getCategories(): Promise<{ categories: Category[] }> {
  const raw = await apiFetch<{ categories: unknown[] }>('/categories');
  const categories = Array.isArray(raw?.categories)
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    ? raw.categories.map((c: any) => ({
        id: c.id,
        name: c.name,
        slug: c.slug,
        postCount: c.postCount ?? c.post_count ?? 0,
      }))
    : [];
  return { categories };
}
