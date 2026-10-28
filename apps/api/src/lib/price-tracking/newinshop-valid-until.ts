// The newinshop.co offers observed so far (saved pages of 2026-09-09, -21 and -25)
// write priceValidUntil as "10/04/2040": 10 April or 4 October, and the page does
// not say which. Whether every offer of the store does so is not known. Both
// readings are returned and the caller holds each one to its ISO rule, so the offer
// counts as current only while both are real calendar dates and neither has passed.
// No reading is preferred and no locale is guessed. Only this store's own https
// pages and only priceValidUntil: every other store and every other date field
// keeps the plain ISO rule.
const HOST = /^(?:www\.)?newinshop\.co$/;
const SLASHED = /^(\d{2})\/(\d{2})\/(\d{4})$/;

/** The day/month/year and month/day/year readings as ISO dates, or null when the
 * page or the value is not this case. A reading that is not a calendar date is
 * returned as written, so the caller's ISO check rejects it. */
export function newinshopValidUntilReadings(page: URL, value: unknown): [string, string] | null {
  if (page.protocol !== 'https:' || !HOST.test(page.hostname) || page.port || page.username || page.password) return null;
  const match = typeof value === 'string' ? SLASHED.exec(value) : null;
  if (!match) return null;
  const [, first, second, year] = match;
  return [`${year}-${second}-${first}`, `${year}-${first}-${second}`];
}
