import type { MetadataRoute } from 'next';

const PATHS = ['', '/sports-performance', '/performance-academy', '/rehabilitation', '/recovery-remedial-massage', '/performance-testing', '/about', '/contact', '/book', '/privacy-policy', '/terms-and-conditions'];

export default function sitemap(): MetadataRoute.Sitemap {
  const base = process.env.NEXT_PUBLIC_SITE_URL ?? 'https://www.asparc.com.au';
  return PATHS.map((p) => ({ url: `${base}${p}`, changeFrequency: 'monthly', priority: p === '' ? 1 : 0.7 }));
}
