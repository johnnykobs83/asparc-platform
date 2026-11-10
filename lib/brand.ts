/**
 * ASPARC brand system – single source of truth for website and admin.
 *
 * LOGO: the official logo must be used exactly as supplied.
 * 1. Place the supplied file in /public/brand/ (SVG preferred, or PNG).
 * 2. Set `logo.src` (and the file's real width/height) below.
 * Until then a plain text wordmark is shown as a temporary placeholder –
 * it is NOT a logo design and should be replaced, not refined.
 */
export const BRAND = {
  name: 'ASPARC',
  fullName: 'Australian Sports Performance and Rehabilitation Centre',
  domain: 'www.asparc.com.au',
  tagline: 'HIGH PERFORMANCE STARTS HERE.',
  supporting: 'Unlock your potential. Develop your performance. Return stronger.',
  location: 'Melbourne, Victoria, Australia',
  colors: {
    royal: '#14519C',
    sky: '#6B9FC5',
    charcoal: '#101820',
    white: '#FFFFFF',
    mist: '#F2F5F8',
  },
  logo: {
    // Official logo, supplied 9 Nov 2026 – stored byte-for-byte unaltered.
    src: '/brand/asparc-logo.jpg' as string | null,
    // No reversed (white) version supplied: on dark backgrounds the logo is
    // shown on a white panel rather than recoloured.
    srcOnDark: null as string | null,
    width: 1182,
    height: 1098,
    alt: 'ASPARC – Australian Sports Performance and Rehabilitation Centre',
  },
  assistantName: 'ASPARC AI',
  assistantTitle: 'ASPARC AI – Your Performance Assistant',
} as const;

/** Photography slots. Drop files with these names into /public/images/. See /public/images/README.md */
export const IMAGES = {
  hero: '/images/hero.jpg',
  performance: '/images/sports-performance.jpg',
  academy: '/images/academy.jpg',
  rehab: '/images/rehabilitation.jpg',
  recovery: '/images/recovery.jpg',
  testing: '/images/performance-testing.jpg',
  founder: '/images/founder.jpg',
  about: '/images/about.jpg',
} as const;
