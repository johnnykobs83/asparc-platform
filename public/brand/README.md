# Official ASPARC logo

**Installed:** `asparc-logo.jpg`, the official logo supplied on 9 Nov 2026, stored byte-for-byte unaltered and configured in `lib/brand.ts`. It is used in the white site header, on a white panel in the footer and admin sidebar, on the admin login, in emails, and (padded to a square, unaltered) as `app/icon.png` / `app/apple-icon.png`. Still useful from your designer: an SVG master, a reversed (white) version for dark backgrounds, and a square icon mark for the favicon.

## Replacing or adding versions

The website and dashboard use the **official logo exactly as supplied** – no recolouring, cropping, filters or redrawing.

1. Put the supplied file(s) here, e.g. `asparc-logo.svg` (preferred) or `asparc-logo.png` (at least 2× display size).
   If you have a white/reversed version for dark backgrounds, add it too, e.g. `asparc-logo-white.svg`.
2. Open `lib/brand.ts` and set:
   ```ts
   logo: { src: '/brand/asparc-logo.svg', srcOnDark: '/brand/asparc-logo-white.svg', width: <real width>, height: <real height>, … }
   ```
3. Add a favicon as `app/icon.png` (512×512) – Next.js picks it up automatically.

Until then the header shows a plain text "ASPARC" wordmark as a temporary placeholder (it is not a logo design).
