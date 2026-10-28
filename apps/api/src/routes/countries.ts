import { Hono } from 'hono';
import { cfCountry, getActiveMarkets, resolveMarket } from '../lib/market';

export const countryRoutes = new Hono();

// GET /countries — aktif pazarlar + CF tespiti + çözülen pazar. İstemci açılışta
// çağırır: `resolved` ile pazarı belirler, `markets` ile picker'ı doldurur.
countryRoutes.get('/', async (c) => {
  const [markets, resolved] = await Promise.all([
    getActiveMarkets(),
    resolveMarket(c, c.req.query('country')),
  ]);
  return c.json({ markets, detected: cfCountry(c), resolved });
});
