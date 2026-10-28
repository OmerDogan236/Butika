import { z } from 'zod';

export const notificationListSchema = z.object({
  cursor: z.string().uuid().optional(),
  limit: z.coerce.number().int().min(1).max(100).default(30),
});

export const notificationIdSchema = z.object({ id: z.string().uuid() });

interface NotificationBase {
  id: string;
  eventId: string;
  createdAt: string;
  readAt: string | null;
  trackedProductId: string;
  boutiqueId: string;
  boutiqueName: string;
  productTitle: string | null;
  sourceUrl: string;
  currency: string;
}

export interface PriceDropNotification extends NotificationBase {
  type: 'price_drop';
  previousPriceMinor: number;
  newPriceMinor: number;
}

/** The saved size/colour is back in stock; previousPriceMinor is the last in-stock price, if known. */
export interface BackInStockNotification extends NotificationBase {
  type: 'back_in_stock';
  previousPriceMinor: number | null;
  newPriceMinor: number;
}

export type AppNotification = PriceDropNotification | BackInStockNotification;

export interface NotificationPage {
  items: AppNotification[];
  nextCursor: string | null;
}
