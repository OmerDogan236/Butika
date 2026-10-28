import { pushDevices } from '@butika/db';
import { pushDeviceUpsertSchema } from '@butika/types';
import { zValidator } from '@hono/zod-validator';
import { and, eq, ne } from 'drizzle-orm';
import { Hono } from 'hono';
import { type AuthContext, requireAuth } from '../lib/auth';
import { db } from '../lib/db';

export const pushRoutes = new Hono<AuthContext>();

pushRoutes.use('*', requireAuth);

pushRoutes.post(
  '/devices',
  zValidator('json', pushDeviceUpsertSchema),
  async (c) => {
    const userId = c.get('userId');
    const body = c.req.valid('json');
    const now = new Date();

    const device = await db.transaction(async (tx) => {
      // Aynı Expo token eski/reinstall edilmiş başka bir installation
      // kaydında kalmışsa UNIQUE token conflict oluşmasını engelle.
      await tx
        .delete(pushDevices)
        .where(
          and(
            eq(pushDevices.expoPushToken, body.expoPushToken),
            ne(pushDevices.installationId, body.installationId),
          ),
        );

      const [upsertedDevice] = await tx
        .insert(pushDevices)
        .values({
          userId,
          installationId: body.installationId,
          expoPushToken: body.expoPushToken,
          platform: body.platform,
          enabled: true,
          lastSeenAt: now,
          updatedAt: now,
        })
        .onConflictDoUpdate({
          target: pushDevices.installationId,
          set: {
            userId,
            expoPushToken: body.expoPushToken,
            platform: body.platform,
            enabled: true,
            lastSeenAt: now,
            updatedAt: now,
          },
        })
        .returning({
          id: pushDevices.id,
          installationId: pushDevices.installationId,
          platform: pushDevices.platform,
          enabled: pushDevices.enabled,
          updatedAt: pushDevices.updatedAt,
        });

      return upsertedDevice;
    });

    if (!device) {
      throw new Error('Push device upsert failed');
    }

    return c.json({
      id: device.id,
      installationId: device.installationId,
      platform: device.platform,
      enabled: device.enabled,
      updatedAt: device.updatedAt.toISOString(),
    });
  },
);

pushRoutes.delete('/devices/:installationId', async (c) => {
  const userId = c.get('userId');
  const installationId = c.req.param('installationId');

  const [device] = await db
    .select({
      id: pushDevices.id,
      userId: pushDevices.userId,
    })
    .from(pushDevices)
    .where(eq(pushDevices.installationId, installationId))
    .limit(1);

  if (!device || device.userId !== userId) {
    return c.json({ ok: true });
  }

  await db
    .update(pushDevices)
    .set({
      enabled: false,
      updatedAt: new Date(),
    })
    .where(eq(pushDevices.id, device.id));

  return c.json({ ok: true });
});