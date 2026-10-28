import { boutiques, trackedProducts } from '@butika/db';
import { eq, sql } from 'drizzle-orm';
import { db } from '../db';
import { canonicalizeProductUrl } from './canonicalize-url';
import { isTrackableProductUrl } from './product-url-policy';

type EnsureTrackedProductInput = {
  boutiqueId: string;
  url: string;
  title: string;
  priceMinor?: number | null;
  currency?: string | null;
};

const hostOf = (value: string) => {
  try {
    return new URL(value).host;
  } catch {
    return 'invalid-url';
  }
};

export async function ensureTrackedProduct(
  input: EnsureTrackedProductInput,
): Promise<string | null> {
  try {
    // Only products on the boutique's own site are fetched by the server.
    // Anything else stays a plain save and is reported as unsupported.
    const [boutique] = await db
      .select({ url: boutiques.url })
      .from(boutiques)
      .where(eq(boutiques.id, input.boutiqueId))
      .limit(1);
    if (!boutique || !isTrackableProductUrl(input.url, boutique.url)) {
      return null;
    }

    const canonical = canonicalizeProductUrl(input.url);

    const now = new Date();

    const [row] = await db
      .insert(trackedProducts)
      .values({
        boutiqueId: input.boutiqueId,
        canonicalUrl: canonical.canonicalUrl,
        sourceUrl: canonical.sourceUrl,
        domain: canonical.domain,
        sourceProductId: canonical.sourceProductId,
        title: input.title,
        trackingStatus: 'active',
      })
      .onConflictDoUpdate({
        target: trackedProducts.canonicalUrl,
        set: {
          sourceUrl: canonical.sourceUrl,
          // Titles are client-supplied. A later saver must not rewrite the
          // shared row other watchers' messages could be built from.
          title: sql`coalesce(${trackedProducts.title}, excluded.title)`,
          trackingStatus: 'active',
          updatedAt: now,
        },
      })
      .returning({
        id: trackedProducts.id,
      });

    if (!row) {
      return null;
    }

    // Client supplied WebView prices must not change the shared baseline or
    // notify other users. The scheduler establishes a server-verified price.

    return row.id;
  } catch (error) {
    // Host only: full product URLs may carry personal or session parameters.
    console.warn('[price-tracking] tracked product create failed', {
      host: hostOf(input.url),
      error: error instanceof Error ? error.message : String(error),
    });

    return null;
  }
}
