import { index, pgTable, text, timestamp, unique, uuid } from 'drizzle-orm/pg-core';
import { comments } from './comments';
import { users } from './users';

// Kullanıcı içeriği moderasyonu — bir yorumun şikayet kaydı (App Store 1.2 gereği).
// Aynı kullanıcı aynı yorumu bir kez şikayet edebilir (unique).
export const commentReports = pgTable(
  'comment_reports',
  {
    id: uuid().primaryKey().defaultRandom(),
    commentId: uuid()
      .references(() => comments.id, { onDelete: 'cascade' })
      .notNull(),
    reporterUserId: uuid()
      .references(() => users.id, { onDelete: 'cascade' })
      .notNull(),
    reason: text().notNull(), // 'spam' | 'harassment' | 'inappropriate' | 'other'
    createdAt: timestamp({ withTimezone: true }).defaultNow().notNull(),
  },
  (t) => [
    unique('comment_reports_comment_reporter_uq').on(t.commentId, t.reporterUserId),
    index('comment_reports_created_idx').on(t.createdAt.desc()),
  ],
);

export type CommentReport = typeof commentReports.$inferSelect;
export type NewCommentReport = typeof commentReports.$inferInsert;
