import { BRAND } from '@/lib/brand';

/**
 * Renders the OFFICIAL logo exactly as supplied: no filters, recolouring or
 * cropping, and the aspect ratio is always preserved (only the height is set).
 * The supplied artwork is blue on white, so on dark backgrounds it sits on a
 * white panel unless a reversed version is added as `logo.srcOnDark`.
 */
export function Logo({ onDark = false, className = 'h-14', panel = true }: { onDark?: boolean; className?: string; panel?: boolean }) {
  const reversed = onDark ? BRAND.logo.srcOnDark : null;
  const src = reversed ?? BRAND.logo.src;
  if (src) {
    const img = (
      // eslint-disable-next-line @next/next/no-img-element
      <img src={src} alt={BRAND.logo.alt} width={BRAND.logo.width} height={BRAND.logo.height} className={`block w-auto max-w-none object-contain ${className}`} />
    );
    return onDark && !reversed && panel ? <span className="inline-flex rounded-lg bg-white p-2.5 shadow-sm">{img}</span> : img;
  }
  // Temporary text placeholder (only if no logo file is configured)
  return (
    <span className={`inline-flex flex-col leading-none`} data-logo-placeholder="true" aria-label={BRAND.logo.alt}>
      <span className={`font-display text-[28px] font-extrabold tracking-[0.18em] ${onDark ? 'text-white' : 'text-charcoal'}`}>ASPARC</span>
    </span>
  );
}
