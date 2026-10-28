import { commentReports, comments, users } from '@butika/db';
import { count, desc, eq, sql } from 'drizzle-orm';
import { Hono } from 'hono';
import { type AdminContext, requireAdmin } from '../../lib/admin-auth';
import { db } from '../../lib/db';

export const adminReportsRoutes = new Hono<AdminContext>();

adminReportsRoutes.use('*', requireAdmin);

// GET /admin/reports — şikayet edilen yorumlar (en çok şikayet edilen üstte).
// Silme, mevcut /admin/comments/:id ile yapılır.
adminReportsRoutes.get('/', async (c) => {
  const rows = await db
    .select({
      commentId: comments.id,
      body: comments.body,
      url: comments.url,
      createdAt: comments.createdAt,
      deletedAt: comments.deletedAt,
      authorId: users.id,
      authorName: users.displayName,
      reportCount: count(commentReports.id),
      reasons: sql<string[]>`array_agg(distinct ${commentReports.reason})`,
      lastReportedAt: sql<string>`max(${commentReports.createdAt})`,
    })
    .from(commentReports)
    .innerJoin(comments, eq(commentReports.commentId, comments.id))
    .innerJoin(users, eq(comments.userId, users.id))
    .groupBy(comments.id, users.id)
    .orderBy(desc(count(commentReports.id)))
    .limit(200);

  return c.json({
    items: rows.map((r) => ({
      commentId: r.commentId,
      body: r.body,
      url: r.url,
      createdAt: r.createdAt.toISOString(),
      deleted: r.deletedAt != null,
      author: { id: r.authorId, displayName: r.authorName },
      reportCount: Number(r.reportCount),
      reasons: r.reasons ?? [],
      lastReportedAt: new Date(r.lastReportedAt).toISOString(),
    })),
  });
});
