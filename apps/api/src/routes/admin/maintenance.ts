import { Hono } from 'hono';
import { type AdminContext, requireAdmin } from '../../lib/admin-auth';
import { purgeDeletedUsers } from '../../lib/cleanup';

export const adminMaintenanceRoutes = new Hono<AdminContext>();

adminMaintenanceRoutes.use('*', requireAdmin);

// POST /admin/maintenance/purge-deleted — 30 günden eski silinen hesapları hemen kalıcı sil.
// (Günlük otomatik iş zaten çalışıyor; bu elle tetikleme/test içindir.)
adminMaintenanceRoutes.post('/purge-deleted', async (c) => {
  const purged = await purgeDeletedUsers();
  return c.json({ purged });
});
