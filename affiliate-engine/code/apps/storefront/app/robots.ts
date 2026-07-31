import type { MetadataRoute } from 'next';
import { isPreview, site } from '../lib/site';

// Required by `output: export`: these routes are emitted as files at build time.
export const dynamic = 'force-static';

export default function robots(): MetadataRoute.Robots {
  // A preview build carries sample listings. Blocking crawlers here is the
  // second layer behind the noindex tag, not a substitute for it.
  if (isPreview) {
    return { rules: [{ userAgent: '*', disallow: '/' }] };
  }

  return {
    rules: [{ userAgent: '*', allow: '/' }],
    sitemap: `${site.baseUrl}/sitemap.xml`,
    host: site.baseUrl,
  };
}
