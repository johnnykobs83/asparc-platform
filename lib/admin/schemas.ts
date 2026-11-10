import { z } from 'zod';

export const KbBody = z.object({
  key: z.string().regex(/^[a-z0-9_.-]{3,80}$/, 'Use lower-case letters, numbers, dots and dashes'),
  category: z.enum(['business', 'hours', 'faq', 'policy', 'ai_rule', 'settings']),
  title: z.string().trim().min(2).max(200),
  content: z.string().max(6000).default(''),
  data: z.record(z.unknown()).default({}),
  status: z.enum(['draft', 'approved', 'archived']).default('draft'),
  is_public: z.boolean().default(true),
});

export const ServiceFields = {
  name: z.string().trim().min(2).max(160),
  category: z.enum(['performance', 'academy', 'rehabilitation', 'recovery', 'testing']),
  summary: z.string().max(1000),
  duration_minutes: z.number().int().positive().max(600).nullable(),
  price_cents: z.number().int().min(0).max(10_000_000).nullable(),
  price_unit: z.string().max(60).nullable(),
  price_status: z.enum(['draft', 'approved', 'on_enquiry']),
  availability: z.enum(['available', 'pending_confirmation', 'unavailable']),
  bookable: z.boolean(),
  payment_link_url: z.string().url().startsWith('https://').nullable(),
  is_public: z.boolean(),
  sort_order: z.number().int(),
};
