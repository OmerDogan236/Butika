import { PageHeader } from '@/components/PageHeader';
import { api } from '@/lib/api';
import { getMarkets, getSelectedCountry } from '@/lib/country';
import {
  type AdminBildirimKitleSayilari,
  type AdminBildirimPlani,
  type BildirimDurumu,
  bildirimHedefiCoz,
} from '@butika/types';
import { BildirimFormu, type Secenek } from './bildirim-formu';
import { DurumDugmeleri } from './durum-dugmeleri';

const TZ = 'Europe/Istanbul';
const GUNLUK_HEDEF = 3;

const DURUM: Record<BildirimDurumu, { etiket: string; sinif: string }> = {
  taslak: { etiket: 'Taslak · onay bekliyor', sinif: 'bg-gold/15 text-gold' },
  planlandi: { etiket: 'Planlandı', sinif: 'bg-ink/10 text-ink' },
  gonderiliyor: { etiket: 'Gönderiliyor', sinif: 'bg-ink/10 text-ink' },
  gonderildi: { etiket: 'Gönderildi', sinif: 'bg-sage/15 text-sage' },
  iptal: { etiket: 'İptal', sinif: 'bg-mist text-ink/50' },
  gecikti: { etiket: 'Gecikti · gönderilmedi', sinif: 'bg-clay/15 text-clay' },
  hata: { etiket: 'Hata', sinif: 'bg-clay/15 text-clay' },
};

const SABIT_HEDEF: Record<string, string> = {
  vitrin: 'Vitrin',
  firsat: 'Fırsat',
  butikcan: 'Butikcan',
  guncelleme: 'Mağazadaki güncelleme sayfası',
};

/** Satırda "Dokununca: …" yazısı. */
function hedefYazisi(p: AdminBildirimPlani): string {
  const h = bildirimHedefiCoz(p.hedef);
  if (!h) return 'Uygulama açılır';
  if (h.tur === 'butik') return `Butik: ${p.hedefAdi ?? 'silinmiş butik'}`;
  if (h.tur === 'kategori') return `Kategori: ${p.hedefAdi ?? 'silinmiş kategori'}`;
  return SABIT_HEDEF[h.tur] ?? h.tur;
}

const gunAnahtari = (iso: string) =>
  new Intl.DateTimeFormat('en-CA', { timeZone: TZ }).format(new Date(iso)); // 2026-10-05
const gunBasligi = (anahtar: string) =>
  new Intl.DateTimeFormat('tr-TR', {
    timeZone: TZ,
    weekday: 'long',
    day: 'numeric',
    month: 'long',
  }).format(new Date(`${anahtar}T12:00:00+03:00`));
const saat = (iso: string) =>
  new Intl.DateTimeFormat('tr-TR', { timeZone: TZ, hour: '2-digit', minute: '2-digit' }).format(
    new Date(iso),
  );

function gunlereAyir(planlar: AdminBildirimPlani[]): [string, AdminBildirimPlani[]][] {
  const m = new Map<string, AdminBildirimPlani[]>();
  for (const p of planlar) {
    const k = gunAnahtari(p.gonderimZamani);
    m.set(k, [...(m.get(k) ?? []), p]);
  }
  return [...m.entries()];
}

function PlanSatiri({ p }: { p: AdminBildirimPlani }) {
  const d = DURUM[p.durum];
  return (
    <li className="flex flex-col gap-3 border-b border-mist/60 p-5 last:border-b-0 sm:flex-row sm:items-start">
      <p className="w-16 shrink-0 font-display text-2xl italic text-ink">
        {saat(p.gonderimZamani)}
      </p>
      <div className="min-w-0 flex-1">
        <p className="font-medium text-ink">{p.baslik}</p>
        <p className="mt-1 text-sm text-ink/70">{p.metin}</p>
        <p className="mt-2 text-xs uppercase tracking-[0.16em] text-ink/40">
          {p.kitle === 'savers' ? 'Fiyat takibi olanlar' : 'Herkes'}
          <span className="mx-2">·</span>
          Dokununca: {hedefYazisi(p)}
          {p.durum === 'gonderildi' ? (
            <>
              <span className="mx-2">·</span>
              {p.basarili ?? 0} cihaza ulaştı
              {p.hatali ? ` · ${p.hatali} hata` : ''}
              <span className="mx-2">·</span>
              PostHog: {p.kampanya}
            </>
          ) : null}
        </p>
      </div>
      <div className="flex shrink-0 flex-col items-start gap-3 sm:items-end">
        <span
          className={`rounded-full px-3 py-1 text-[10px] uppercase tracking-[0.18em] ${d.sinif}`}
        >
          {d.etiket}
        </span>
        <DurumDugmeleri id={p.id} durum={p.durum} />
      </div>
    </li>
  );
}

export default async function BildirimlerPage() {
  const country = await getSelectedCountry(await getMarkets());
  // Hedef butik/kategori listesi üst bardan seçili pazardan gelir.
  const [planlar, kitle, butikler, kategoriler] = await Promise.all([
    api.get<AdminBildirimPlani[]>('/admin/bildirimler'),
    api.get<AdminBildirimKitleSayilari>('/admin/bildirimler/kitle'),
    country ? api.get<Secenek[]>(`/admin/boutiques?country=${country}`) : [],
    country ? api.get<Secenek[]>(`/admin/categories?country=${country}`) : [],
  ]);

  const bugun = gunAnahtari(new Date().toISOString());
  const bekleyen = planlar
    .filter((p) => p.durum === 'taslak' || p.durum === 'planlandi' || p.durum === 'gonderiliyor')
    .sort((a, b) => a.gonderimZamani.localeCompare(b.gonderimZamani));
  const gecmis = planlar.filter((p) => !bekleyen.includes(p));

  return (
    <>
      <PageHeader
        kicker="Uygulama"
        title="Bildirimler"
        description={`Her güne ${GUNLUK_HEDEF} bildirim planlayın. Taslaklar onay bekler; planlananlar zamanı gelince kendiliğinden gider. Şu an bildirimi açık ${kitle.all.kisi} kişi var.`}
      />

      <div className="flex flex-col gap-12">
        <BildirimFormu
          kitle={kitle}
          varsayilanTarih={bugun}
          butikler={butikler}
          kategoriler={kategoriler}
        />

        <section className="flex flex-col gap-6">
          <h2 className="font-display text-3xl italic text-ink">Sıradakiler</h2>
          {bekleyen.length === 0 ? (
            <p className="border border-mist py-12 text-center italic text-ink/40">
              Planlanmış bildirim yok.
            </p>
          ) : (
            gunlereAyir(bekleyen).map(([gun, liste]) => {
              const sayi = liste.filter((p) => p.durum !== 'taslak').length;
              return (
                <div key={gun} className="flex flex-col gap-2">
                  <p className="text-xs uppercase tracking-[0.18em] text-ink/50">
                    {gunBasligi(gun)}
                    <span className="mx-2">·</span>
                    <span className={sayi >= GUNLUK_HEDEF ? 'text-sage' : 'text-gold'}>
                      {sayi}/{GUNLUK_HEDEF} planlı
                    </span>
                  </p>
                  <ul className="flex flex-col border border-mist">
                    {liste.map((p) => (
                      <PlanSatiri key={p.id} p={p} />
                    ))}
                  </ul>
                </div>
              );
            })
          )}
        </section>

        <section className="flex flex-col gap-6">
          <h2 className="font-display text-3xl italic text-ink">Gönderilenler (son 30 gün)</h2>
          {gecmis.length === 0 ? (
            <p className="border border-mist py-12 text-center italic text-ink/40">
              Henüz gönderilen bildirim yok.
            </p>
          ) : (
            gunlereAyir(gecmis).map(([gun, liste]) => (
              <div key={gun} className="flex flex-col gap-2">
                <p className="text-xs uppercase tracking-[0.18em] text-ink/50">{gunBasligi(gun)}</p>
                <ul className="flex flex-col border border-mist">
                  {liste.map((p) => (
                    <PlanSatiri key={p.id} p={p} />
                  ))}
                </ul>
              </div>
            ))
          )}
          <p className="text-xs text-ink/50">
            Kaç kişinin bildirime dokunduğu PostHog’da “push_opened” olayında kampanya adıyla
            görünür (uygulamanın bir sonraki sürümünden itibaren).
          </p>
        </section>
      </div>
    </>
  );
}
