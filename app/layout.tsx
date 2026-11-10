import type { Metadata, Viewport } from 'next';
import { Barlow_Condensed, Inter } from 'next/font/google';
import { BRAND } from '@/lib/brand';
import './globals.css';

const display = Barlow_Condensed({ subsets: ['latin'], weight: ['500', '600', '700', '800'], variable: '--font-barlow', display: 'swap' });
const sans = Inter({ subsets: ['latin'], variable: '--font-inter', display: 'swap' });

const siteUrl = process.env.NEXT_PUBLIC_SITE_URL ?? 'https://www.asparc.com.au';

export const metadata: Metadata = {
  metadataBase: new URL(siteUrl),
  title: { default: `${BRAND.name} – ${BRAND.fullName}`, template: `%s | ${BRAND.name}` },
  description: `${BRAND.fullName} – sports performance, athlete development, rehabilitation and recovery in ${BRAND.location}. ${BRAND.supporting}`,
  openGraph: { type: 'website', siteName: BRAND.name, locale: 'en_AU', images: [{ url: BRAND.logo.src ?? '/brand/asparc-logo.jpg', width: BRAND.logo.width, height: BRAND.logo.height, alt: BRAND.logo.alt }] },
  robots: { index: true, follow: true },
};

export const viewport: Viewport = { themeColor: BRAND.colors.charcoal, width: 'device-width', initialScale: 1 };

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en-AU" className={`${display.variable} ${sans.variable}`}>
      <body>{children}</body>
    </html>
  );
}
