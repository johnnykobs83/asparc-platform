import type { KnowledgeItem, Service } from '../db/types';

/**
 * Initial knowledge base and service catalogue, seeded on first run.
 * After seeding, management edits everything in /admin (Knowledge Base and
 * Pricing & Services) – no code changes required.
 *
 * Rules followed here:
 *  - Only facts supplied in the ASPARC brief.
 *  - Unconfirmed items are 'draft' / 'pending_confirmation' so the website
 *    and AI present them as such.
 *  - No contact details, hours, addresses or equipment are invented.
 */

type SeedService = Omit<Service, 'id' | 'created_at' | 'updated_at'>;
type SeedKb = Omit<KnowledgeItem, 'id' | 'created_at' | 'updated_at' | 'updated_by'>;

const svc = (s: Partial<SeedService> & Pick<SeedService, 'slug' | 'name' | 'category' | 'summary'>): SeedService => ({
  duration_minutes: null,
  price_cents: null,
  price_unit: null,
  price_status: 'on_enquiry',
  availability: 'available',
  bookable: true,
  payment_link_url: null,
  is_public: true,
  sort_order: 0,
  ...s,
});

export const DEFAULT_SERVICES: SeedService[] = [
  // Sports performance
  svc({
    slug: 'strength-conditioning',
    name: 'Strength & Conditioning',
    category: 'performance',
    summary: 'Individualised strength and conditioning programming and coaching to build robust, powerful athletes.',
    sort_order: 10,
  }),
  svc({
    slug: 'speed-development',
    name: 'Speed Development',
    category: 'performance',
    summary: 'Acceleration, sprint mechanics and maximum-velocity work to make athletes faster over the distances that matter in their sport.',
    sort_order: 20,
  }),
  svc({
    slug: 'agility-change-of-direction',
    name: 'Agility & Change of Direction',
    category: 'performance',
    summary: 'Deceleration, cutting mechanics and reactive agility for multidirectional sports.',
    sort_order: 30,
  }),
  svc({
    slug: 'power-development',
    name: 'Power Development',
    category: 'performance',
    summary: 'Jumping, throwing and loaded power training to improve explosive performance.',
    sort_order: 40,
  }),
  svc({
    slug: 'football-physical-preparation',
    name: 'Football-Specific Physical Preparation',
    category: 'performance',
    summary: 'Physical preparation built around the demands of football (soccer) – pre-season, in-season and off-season.',
    sort_order: 50,
  }),
  svc({
    slug: 'individual-athlete-development',
    name: 'Individual Athlete Development',
    category: 'performance',
    summary: 'One-to-one development programs for professional, semi-professional and aspiring athletes.',
    sort_order: 60,
  }),
  svc({
    slug: 'personal-training',
    name: 'Personal Training (Adults)',
    category: 'performance',
    summary: 'Strength and conditioning for adults wanting to get stronger, fitter and move better.',
    sort_order: 70,
  }),
  // Academy – proposed, draft price
  svc({
    slug: 'performance-academy',
    name: 'Performance Academy – 10-Week Program',
    category: 'academy',
    summary:
      'A 10-week athletic development block for ages 8–18: one 45–60 minute session per week focusing on strength, speed, agility, coordination, power and athletic development.',
    duration_minutes: 60,
    price_cents: 38000,
    price_unit: 'per 10-week program',
    price_status: 'draft',
    availability: 'pending_confirmation',
    sort_order: 100,
  }),
  // Rehabilitation – exercise-based, scope-limited
  svc({
    slug: 'return-to-performance',
    name: 'Return-to-Performance Training',
    category: 'rehabilitation',
    summary:
      'Exercise-based return-to-performance training that bridges the gap between injury rehabilitation and full training – delivered alongside, not instead of, your treating medical or allied health practitioner.',
    sort_order: 200,
  }),
  // Recovery – draft prices, contractor availability to be confirmed
  svc({
    slug: 'remedial-massage-30',
    name: 'Remedial Massage – 30 minutes',
    category: 'recovery',
    summary: 'Targeted remedial massage session.',
    duration_minutes: 30,
    price_cents: 6000,
    price_unit: 'per session',
    price_status: 'draft',
    availability: 'pending_confirmation',
    sort_order: 300,
  }),
  svc({
    slug: 'remedial-massage-45',
    name: 'Remedial Massage – 45 minutes',
    category: 'recovery',
    summary: 'Remedial massage session.',
    duration_minutes: 45,
    price_cents: 8000,
    price_unit: 'per session',
    price_status: 'draft',
    availability: 'pending_confirmation',
    sort_order: 310,
  }),
  svc({
    slug: 'remedial-massage-60',
    name: 'Remedial Massage – 60 minutes',
    category: 'recovery',
    summary: 'Full remedial massage session.',
    duration_minutes: 60,
    price_cents: 10000,
    price_unit: 'per session',
    price_status: 'draft',
    availability: 'pending_confirmation',
    sort_order: 320,
  }),
  // Testing – menu confirmed by the owner (11 Nov 2026). No equipment brands are named.
  ...(
    [
      ['aerobic-fitness-testing', 'Aerobic Fitness Testing', 'Assessment of aerobic fitness.'],
      ['anaerobic-fitness-testing', 'Anaerobic Fitness Testing', 'Assessment of anaerobic fitness.'],
      ['strength-testing', 'Functional Strength Testing', 'Assessment of functional strength.'],
      ['jump-testing', 'Jump Testing', 'Assessment of jump performance.'],
      ['speed-testing', 'Speed Testing', 'Timed sprint assessment over sport-relevant distances.'],
      ['acceleration-testing', 'Acceleration Testing', 'Assessment of short-distance acceleration.'],
      ['power-testing', 'Power Testing', 'Assessment of explosive power output.'],
      ['asymmetry-testing', 'Body Asymmetry Assessment', 'Left/right comparison to identify imbalances worth addressing in training.'],
      ['athletic-profiling', 'Athletic Profiling', 'We profile our players and make recommendations on how to improve deficits.'],
    ] as const
  ).map(([slug, name, summary], i) =>
    svc({ slug, name, category: 'testing', summary, availability: 'available', sort_order: 400 + i * 10 }),
  ),
];

const kb = (k: Partial<SeedKb> & Pick<SeedKb, 'key' | 'category' | 'title' | 'content'>): SeedKb => ({
  data: {},
  status: 'approved',
  is_public: true,
  ...k,
});

export const DEFAULT_KNOWLEDGE: SeedKb[] = [
  // ---- Business ----
  kb({
    key: 'business.overview',
    category: 'business',
    title: 'About ASPARC',
    content:
      'ASPARC – Australian Sports Performance and Rehabilitation Centre – is a premium sports performance, athlete development, rehabilitation and recovery business based in Melbourne, Victoria. ASPARC works with professional and semi-professional athletes, football (soccer) players, junior and youth athletes, community sporting clubs, and adults seeking strength, conditioning and improved physical performance.',
  }),
  kb({
    key: 'business.location',
    category: 'business',
    title: 'Location',
    content: 'Melbourne, Victoria, Australia. The full venue address will be published once confirmed.',
    data: { suburb: '', address: '', map_url: '' },
  }),
  kb({
    key: 'business.contact',
    category: 'business',
    title: 'Contact details',
    content:
      'Contact details are being finalised. Please use the website enquiry form or chat and the team will respond.',
    // Fill these in /admin → Knowledge Base. Empty values are hidden on the site.
    data: { email: '', phone: '', instagram_url: '', facebook_url: '', linkedin_url: '' },
    status: 'draft',
  }),
  kb({
    key: 'hours.opening',
    category: 'hours',
    title: 'Opening hours',
    content: 'Opening hours are being confirmed. Sessions are by appointment.',
    data: { schedule: [] },
    status: 'draft',
  }),
  kb({
    key: 'business.founder',
    category: 'business',
    title: 'Founder – John Kobiela',
    content:
      'ASPARC was founded by John Kobiela, a sports performance professional with experience in professional football high performance, including work with Newcastle Jets and Avondale FC. John holds a Bachelor of Exercise Science and Human Movement (2010) and a Master of High Performance (2017).',
  }),
  kb({
    key: 'business.practitioners',
    category: 'business',
    title: 'Practitioners & scope',
    content:
      'Sports performance, strength and conditioning and exercise-based return-to-performance training are delivered within the exercise science scope of the ASPARC team. ASPARC does not currently provide physiotherapy or other registered clinical services and does not diagnose injuries. Remedial massage practitioner details are being confirmed.',
    is_public: false,
  }),
  // ---- Policies ----
  kb({
    key: 'policy.medical',
    category: 'policy',
    title: 'Medical & injury disclaimer',
    content:
      'ASPARC does not diagnose injuries or medical conditions and does not prescribe medical treatment. Return-to-performance training is exercise-based and should be undertaken with clearance from, or alongside, your treating doctor or registered allied health practitioner. In an emergency call 000.',
  }),
  kb({
    key: 'policy.children',
    category: 'policy',
    title: 'Junior athletes & guardian consent',
    content:
      'For athletes under 18, ASPARC communicates with a parent or guardian, and a parent or guardian must complete Academy registrations and provide consent.',
  }),
  kb({
    key: 'policy.payments',
    category: 'policy',
    title: 'Payments',
    content:
      'Online payment is not yet available. When it is, payments will be taken through a secure payment provider – ASPARC never takes card details through chat, email or enquiry forms.',
  }),
  kb({
    key: 'policy.bookings',
    category: 'policy',
    title: 'Bookings',
    content:
      'Online booking is not yet live. Submit a booking request and the ASPARC team will contact you to arrange a time. A booking is only confirmed when a team member confirms it with you.',
  }),
  kb({
    key: 'policy.cancellation',
    category: 'policy',
    title: 'Cancellation & refund policy',
    content: 'The cancellation and refund policy is being finalised.',
    status: 'draft',
  }),
  kb({
    key: 'policy.privacy_summary',
    category: 'policy',
    title: 'Privacy summary',
    content:
      'ASPARC collects only the information needed to respond to your enquiry (such as name, contact details and the service you are interested in) and uses it to contact you about that enquiry. Marketing messages are only sent with your consent. See the Privacy Policy for details.',
  }),
  // ---- FAQs ----
  kb({
    key: 'faq.physio',
    category: 'faq',
    title: 'Do you provide physiotherapy?',
    content:
      'No. ASPARC does not currently provide physiotherapy or diagnose injuries. We provide exercise-based return-to-performance training and can work alongside your physiotherapist or doctor.',
    data: { keywords: ['physio', 'physiotherapy', 'physiotherapist', 'diagnose', 'diagnosis', 'injury', 'injured'] },
  }),
  kb({
    key: 'faq.who',
    category: 'faq',
    title: 'Who is ASPARC for?',
    content:
      'Professional and semi-professional athletes, football (soccer) players, junior and youth athletes, community sporting clubs, and adults who want to improve their strength, conditioning and physical performance. You do not need to be an elite athlete.',
    data: { keywords: ['who', 'beginner', 'elite', 'adult', 'anyone', 'suitable'] },
  }),
  kb({
    key: 'faq.academy_format',
    category: 'faq',
    title: 'How does the Performance Academy work?',
    content:
      'The proposed Academy program is a 10-week training block with one 45–60 minute session per week, focusing on strength, speed, agility, coordination, power and athletic development. There are four age groups: 8–10, 11–13, 14–16 and 16–18 years. Program details are being finalised – parents can register interest now.',
    data: { keywords: ['academy', 'junior', 'kids', 'child', 'son', 'daughter', 'age group', 'program', 'term'] },
  }),
  kb({
    key: 'faq.booking',
    category: 'faq',
    title: 'Can I book online?',
    content:
      'Live online booking is not available yet. You can submit a booking request with your preferred days and times and the team will contact you to arrange a session.',
    data: { keywords: ['book', 'booking', 'appointment', 'availability', 'available', 'schedule', 'session time'] },
  }),
  kb({
    key: 'faq.payment',
    category: 'faq',
    title: 'Can I pay online?',
    content:
      'Online payments are not available yet. The team will explain payment options when they contact you. Please never share card details in chat.',
    data: { keywords: ['pay', 'payment', 'card', 'invoice', 'stripe', 'deposit'] },
  }),
  kb({
    key: 'faq.clubs',
    category: 'faq',
    title: 'Do you work with sporting clubs?',
    content:
      'Yes. ASPARC works with community sporting clubs. Club partnership enquiries are handled directly by management – share your club details and the team will be in touch.',
    data: { keywords: ['club', 'team', 'partnership', 'squad', 'association', 'school'] },
  }),
  kb({
    key: 'faq.testing',
    category: 'faq',
    title: 'What performance testing do you offer?',
    content:
      'ASPARC performance testing includes aerobic fitness, anaerobic fitness, functional strength, jump, speed, acceleration, power, body asymmetry and athletic profiling. We profile our players and make recommendations on how to improve deficits. Send an enquiry and the team will arrange testing with you.',
    data: { keywords: ['test', 'testing', 'assessment', 'profiling', 'force', 'jump', 'sprint', 'vald', 'forcedecks'] },
  }),
  kb({
    key: 'faq.ai',
    category: 'faq',
    title: 'Am I talking to a person?',
    content:
      'No – ASPARC AI is an AI assistant. It can answer common questions and pass your details to the ASPARC team, who will follow up personally.',
    data: { keywords: ['human', 'person', 'real', 'robot', 'bot', 'ai', 'staff member'] },
  }),
  // ---- AI style (editable; hard safety rules live in code) ----
  kb({
    key: 'ai.style',
    category: 'ai_rule',
    title: 'Assistant tone & style',
    content:
      'Professional, friendly and concise. Use Australian English. Keep answers to a few short sentences, then offer a helpful next step (an enquiry, a booking request or registering interest).',
    is_public: false,
  }),
  // ---- Settings ----
  kb({
    key: 'settings.notifications',
    category: 'settings',
    title: 'Notification settings',
    content: 'Which notification types are emailed to management.',
    data: {
      email_types: [
        'qualified_lead',
        'academy_enquiry',
        'club_partnership',
        'complaint',
        'unresolved_question',
        'booking_request',
        'payment_confirmation',
        'escalation',
      ],
      daily_summary_email: true,
    },
    is_public: false,
  }),
];
