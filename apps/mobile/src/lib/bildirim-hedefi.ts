// Duyuru bildirimine dokununca ne açılacağı. Sunucu push verisine `target` koyar (admin
// "Bildirimler" → "Dokununca ne açılsın"); değer biçimi @butika/types bildirimHedefiCoz ile aynı:
// vitrin | firsat | butikcan | guncelleme | butik:<id> | kategori:<id>.
// Hedef yoksa ya da tanınmıyorsa null: uygulama yalnız açılır (eski davranış).

export type DuyuruHedefi =
  | { tur: 'sekme'; yol: '/(tabs)' | '/firsat' | '/butikcan' }
  | { tur: 'magaza' }
  | { tur: 'butik'; id: string }
  | { tur: 'kategori'; id: string };

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;

const SEKMELER = {
  vitrin: '/(tabs)',
  firsat: '/firsat',
  butikcan: '/butikcan',
} as const;

export function duyuruHedefi(
  data: Record<string, unknown> | null | undefined,
): DuyuruHedefi | null {
  if (data?.type !== 'announcement' || typeof data.target !== 'string') return null;
  const hedef = data.target;
  if (Object.hasOwn(SEKMELER, hedef))
    return { tur: 'sekme', yol: SEKMELER[hedef as keyof typeof SEKMELER] };
  if (hedef === 'guncelleme') return { tur: 'magaza' };
  const [tur, id] = hedef.split(':');
  if ((tur === 'butik' || tur === 'kategori') && id && UUID.test(id)) return { tur, id };
  return null;
}
