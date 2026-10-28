// apps/admin/app/(app)/style-test/page.tsx
import { PageHeader } from '@/components/PageHeader';
import { api } from '@/lib/api';
import {
  DETAYLI_SORULAR,
  FIYAT_ETIKETLERI,
  type Oran,
  RAPOR_KUCUK_GRUP,
  RENK_ETIKETLERI,
  SENARYO_SORULARI,
  type TarzTestiRaporu,
  YAS_ETIKETLERI,
  detayliEtiket,
} from '@butika/types';
import Link from 'next/link';
import type { ReactNode } from 'react';

// Tarz testi ve öneri analitiği. Yalnız toplam ve oran; kişi listelenmez.
// Tasarım: docs/superpowers/specs/2026-09-16-tarz-testi-ve-oneriler-tasarim.md (bölüm 5)

const RANGES = [
  { key: '1d', label: 'Bugün' },
  { key: '7d', label: '7 gün' },
  { key: '30d', label: '30 gün' },
  { key: '90d', label: '90 gün' },
] as const;

// Anahtar: geçilen son adım → kullanıcının bıraktığı yer. Adımlar sürüme göre değişir.
const BIRAKILAN_ADIM: Record<number, Record<string, string>> = {
  // Sürüm 1 (uzun test, 1.1.0)
  1: {
    '0': 'Kahvaltı sorusunda',
    '1': 'Davet sorusunda',
    '2': 'Ayakkabı sorusunda',
    '3': 'Tarz sorusunda',
    '4': 'Fiyat sorusunda',
    '5': 'Renk sorusunda',
    '6': 'Göndermeden önce',
  },
  // Sürüm 2 (kısa test): kahvaltı → tarz → fiyat → yaş
  2: {
    '0': 'Kahvaltı sorusunda',
    '1': 'Tarz sorusunda',
    '2': 'Fiyat sorusunda',
    '3': 'Yaş sorusunda',
  },
};

const SURUM_ADI: Record<number, string> = {
  1: 'Uzun test (sürüm 1)',
  2: 'Kısa test (sürüm 2)',
};

const KAYNAK_ADI: Record<string, string> = {
  onboarding: 'İlk açılış (onboarding)',
  guncelleme: 'Güncelleme sonrası',
  vitrin_karti: 'Vitrin kartı',
  siralama_menusu: 'Sıralama menüsü',
  ayarlar: 'Ayarlar',
  profil: 'Profil',
};

const ESLESME: Record<string, string> = {
  test: 'Test tarzıyla eşleşme',
  favori: 'Favori tarzıyla eşleşme',
  fiyat: 'Fiyat aralığı',
  kategori: 'Ortak kategori',
  onboarding: 'Onboarding kategorisi',
};

const SORU_ADI: Record<string, string> = {
  kahvalti: 'Kahvaltı',
  davet: 'Davet',
  ayakkabi: 'Ayakkabı',
};

const sikEtiketi = (soru: string, anahtar: string) =>
  SENARYO_SORULARI.find((s) => s.anahtar === soru)?.siklar.find((k) => k.anahtar === anahtar)
    ?.etiket ?? anahtar;

const yuzde = (o: number | null) =>
  o === null ? 'yetersiz veri' : `%${o.toLocaleString('tr-TR')}`;

function Bolum({
  baslik,
  aciklama,
  children,
}: { baslik: string; aciklama?: string; children: ReactNode }) {
  return (
    <section className="mb-12">
      <header className="mb-6 flex items-end justify-between border-b border-mist pb-3">
        <h2 className="font-display text-2xl italic text-ink">{baslik}</h2>
        {aciklama ? (
          <span className="text-xs uppercase tracking-[0.2em] text-ink/40">{aciklama}</span>
        ) : null}
      </header>
      {children}
    </section>
  );
}

function Sayi({ etiket, deger }: { etiket: string; deger: string | number }) {
  return (
    <div className="border border-mist p-6">
      <p className="text-xs uppercase tracking-[0.22em] text-ink/50">{etiket}</p>
      <p className="mt-3 font-display text-4xl italic leading-none text-ink">
        {typeof deger === 'number' ? deger.toLocaleString('tr-TR') : deger}
      </p>
    </div>
  );
}

function OranListesi({
  satirlar,
  etiket,
}: { satirlar: Oran[]; etiket?: (anahtar: string) => string }) {
  if (satirlar.length === 0) return <p className="text-sm italic text-ink/40">Veri yok.</p>;
  return (
    <ul className="flex flex-col gap-2">
      {satirlar.map((s) => (
        <li
          key={s.anahtar}
          className="grid grid-cols-[minmax(0,14rem)_1fr_7rem] items-center gap-4 text-sm"
        >
          <span className="truncate text-ink">{etiket ? etiket(s.anahtar) : s.anahtar}</span>
          <span className="h-2 bg-mist/40">
            <span className="block h-2 bg-gold" style={{ width: `${s.oran ?? 0}%` }} />
          </span>
          <span className="text-right text-ink/60">
            {s.adet} · {yuzde(s.oran)}
          </span>
        </li>
      ))}
    </ul>
  );
}

export default async function StyleTestPage({
  searchParams,
}: {
  searchParams: Promise<{ range?: string }>;
}) {
  const params = await searchParams;
  const range = RANGES.find((r) => r.key === params.range)?.key ?? '30d';
  const r = await api.get<TarzTestiRaporu>(`/admin/tarz-testi?range=${range}`);

  return (
    <>
      <PageHeader
        kicker="Tarz Testi"
        title="Tarz ve öneri analitiği"
        description="Testi kimler bitirdi, hangi tarzlar öne çıkıyor, öneriler işe yarıyor mu. 5 kişiden küçük gruplarda oran gösterilmez."
        action={
          <div className="flex items-center gap-1 rounded-md border border-mist p-1">
            {RANGES.map((x) => (
              <Link
                key={x.key}
                href={`/style-test?range=${x.key}`}
                className={
                  x.key === range
                    ? 'rounded bg-ink px-3 py-1.5 text-xs uppercase tracking-[0.18em] text-cream'
                    : 'px-3 py-1.5 text-xs uppercase tracking-[0.18em] text-ink/60 hover:text-ink'
                }
              >
                {x.label}
              </Link>
            ))}
          </div>
        }
      />

      <Bolum baslik="Katılım">
        <div className="mb-8 grid grid-cols-1 gap-4 sm:grid-cols-2">
          <Sayi etiket="Başlatan (tüm sürümler)" deger={r.katilim.baslatan} />
          <Sayi etiket="Bitiren (tüm sürümler)" deger={r.katilim.bitiren} />
        </div>
        {r.katilim.surumler.map((v) => (
          <div key={v.testSurumu} className="mb-10">
            <h3 className="mb-4 font-display text-xl italic text-ink">
              {SURUM_ADI[v.testSurumu] ?? `Sürüm ${v.testSurumu}`}
            </h3>
            <div className="mb-6 grid grid-cols-1 gap-4 sm:grid-cols-4">
              <Sayi etiket="Başlatan" deger={v.baslatan} />
              <Sayi etiket="Bitiren" deger={v.bitiren} />
              <Sayi etiket="Hepsini atlayan" deger={v.hepsiniAtlayan} />
              <Sayi etiket="Yarıda bırakan" deger={v.yarida} />
            </div>
            <h4 className="mb-3 text-xs uppercase tracking-[0.2em] text-ink/50">
              Nerede bırakıldı
            </h4>
            <OranListesi
              satirlar={v.birakilanAdim}
              etiket={(a) => BIRAKILAN_ADIM[v.testSurumu]?.[a] ?? `${a}. adımdan sonra`}
            />
            {v.kaynaga.length > 0 ? (
              <>
                <h4 className="mb-3 mt-6 text-xs uppercase tracking-[0.2em] text-ink/50">
                  Nereden açıldı
                </h4>
                <table className="w-full border border-mist text-sm">
                  <thead>
                    <tr className="text-left text-xs uppercase tracking-[0.18em] text-ink/50">
                      <th className="px-6 py-3 font-medium">Yer</th>
                      <th className="px-6 py-3 font-medium">Başlatan</th>
                      <th className="px-6 py-3 font-medium">Bitiren</th>
                      <th className="px-6 py-3 font-medium">Hepsini atlayan</th>
                      <th className="px-6 py-3 font-medium">Yarıda</th>
                    </tr>
                  </thead>
                  <tbody>
                    {v.kaynaga.map((k) => (
                      <tr key={k.kaynak} className="border-t border-mist/60">
                        <td className="px-6 py-2 text-ink">{KAYNAK_ADI[k.kaynak] ?? k.kaynak}</td>
                        <td className="px-6 py-2 text-ink/80">{k.baslatan}</td>
                        <td className="px-6 py-2 text-ink/80">{k.bitiren}</td>
                        <td className="px-6 py-2 text-ink/80">{k.hepsiniAtlayan}</td>
                        <td className="px-6 py-2 text-ink/80">{k.yarida}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
                <p className="mt-2 text-xs text-ink/40">
                  Güncelleme sonrası "Daha sonra" diyenler ayrıca kaydedilmez; yarıda bırakanlar
                  arasındadır.
                </p>
              </>
            ) : null}
          </div>
        ))}
        <h3 className="mb-3 mt-8 text-xs uppercase tracking-[0.2em] text-ink/50">Günlük</h3>
        {r.katilim.gunluk.length === 0 ? (
          <p className="text-sm italic text-ink/40">Bu aralıkta test yok.</p>
        ) : (
          <table className="w-full border border-mist text-sm">
            <thead>
              <tr className="text-left text-xs uppercase tracking-[0.18em] text-ink/50">
                <th className="px-6 py-3 font-medium">Gün</th>
                <th className="px-6 py-3 font-medium">Başlatan</th>
                <th className="px-6 py-3 font-medium">Bitiren</th>
              </tr>
            </thead>
            <tbody>
              {r.katilim.gunluk.map((g) => (
                <tr key={g.gun} className="border-t border-mist/60">
                  <td className="px-6 py-2 text-ink">{g.gun}</td>
                  <td className="px-6 py-2 text-ink/80">{g.baslatan}</td>
                  <td className="px-6 py-2 text-ink/80">{g.bitiren}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </Bolum>

      <Bolum baslik="Tarz dağılımı" aciklama={`${r.tarz.kisi} kişi · kişi başına son test`}>
        <OranListesi satirlar={r.tarz.dagilim} />
        <div className="mt-8 grid grid-cols-1 gap-4 sm:grid-cols-2">
          <Sayi etiket="Moduna göre giyinen (esnek)" deger={yuzde(r.tarz.esnekOrani)} />
          <Sayi
            etiket={`Test = favori tarzı (${r.tarz.favoriOrtusme.kisi} kişi)`}
            deger={yuzde(r.tarz.favoriOrtusme.oran)}
          />
        </div>
        <h3 className="mb-3 mt-8 text-xs uppercase tracking-[0.2em] text-ink/50">
          Söylenen ↔ senaryolardan çıkan
        </h3>
        <div className="grid grid-cols-1 gap-6 md:grid-cols-2">
          {r.tarz.soylenenSecilen.map((g) => (
            <div key={g.tarz} className="border border-mist p-5">
              <p className="mb-3 font-display text-lg italic text-ink">
                Kendini "{g.tarz}" seçen {g.kisi} kişi, senaryolarda:
              </p>
              <OranListesi satirlar={g.senaryo} />
            </div>
          ))}
        </div>
      </Bolum>

      <Bolum baslik="Yaş" aciklama={`${r.yas.kisi} kişi · yalnız kısa test`}>
        <OranListesi
          satirlar={r.yas.dagilim}
          etiket={(a) => YAS_ETIKETLERI[a as keyof typeof YAS_ETIKETLERI] ?? a}
        />
      </Bolum>

      <Bolum baslik="Fiyat ve renk" aciklama="kişilerin yüzde kaçı seçti">
        <div className="grid grid-cols-1 gap-8 md:grid-cols-2">
          <div>
            <h3 className="mb-3 text-xs uppercase tracking-[0.2em] text-ink/50">Fiyat aralığı</h3>
            <OranListesi
              satirlar={r.fiyatRenk.fiyat}
              etiket={(a) => FIYAT_ETIKETLERI[a as keyof typeof FIYAT_ETIKETLERI] ?? a}
            />
          </div>
          <div>
            <h3 className="mb-3 text-xs uppercase tracking-[0.2em] text-ink/50">
              Renk (yalnız uzun test)
            </h3>
            <OranListesi
              satirlar={r.fiyatRenk.renk}
              etiket={(a) => RENK_ETIKETLERI[a as keyof typeof RENK_ETIKETLERI] ?? a}
            />
          </div>
        </div>
        <h3 className="mb-3 mt-8 text-xs uppercase tracking-[0.2em] text-ink/50">
          Tarza göre fiyat
        </h3>
        <div className="grid grid-cols-1 gap-6 md:grid-cols-2">
          {r.fiyatRenk.fiyatTarza.map((g) => (
            <div key={g.tarz} className="border border-mist p-5">
              <p className="mb-3 font-display text-lg italic text-ink">
                {g.tarz} ({g.kisi} kişi)
              </p>
              <OranListesi
                satirlar={g.fiyat}
                etiket={(a) => FIYAT_ETIKETLERI[a as keyof typeof FIYAT_ETIKETLERI] ?? a}
              />
            </div>
          ))}
        </div>
      </Bolum>

      <Bolum baslik="Öneri başarısı">
        <div className="mb-8 grid grid-cols-1 gap-4 sm:grid-cols-3">
          <Sayi etiket="Gösterim" deger={r.oneri.gosterim} />
          <Sayi etiket={`Tıklama (${r.oneri.tiklama})`} deger={yuzde(r.oneri.tiklamaOrani)} />
          <Sayi
            etiket={`Öneriden kayıt (${r.oneri.kaydetme}) · gösterim başına`}
            deger={yuzde(r.oneri.kaydetmeOrani)}
          />
        </div>
        <div className="grid grid-cols-1 gap-8 md:grid-cols-2">
          <div>
            <h3 className="mb-3 text-xs uppercase tracking-[0.2em] text-ink/50">Tıklanan sıra</h3>
            <OranListesi satirlar={r.oneri.sirayaGore} etiket={(a) => `${a}. sıra`} />
          </div>
          <div>
            <h3 className="mb-3 text-xs uppercase tracking-[0.2em] text-ink/50">
              Eşleşme türüne göre tıklanma
            </h3>
            <OranListesi
              satirlar={r.oneri.eslesmeyeGore.map((e) => ({
                anahtar: e.eslesme,
                adet: e.tiklanan,
                oran: e.oran,
              }))}
              etiket={(a) => ESLESME[a] ?? a}
            />
          </div>
        </div>
        <h3 className="mb-3 mt-8 text-xs uppercase tracking-[0.2em] text-ink/50">
          En çok tıklanan önerilen butikler
        </h3>
        {r.oneri.enCokTiklanan.length === 0 ? (
          <p className="text-sm italic text-ink/40">Veri yok.</p>
        ) : (
          <ol className="flex flex-col gap-1 text-sm text-ink">
            {r.oneri.enCokTiklanan.map((b) => (
              <li key={b.butikId}>
                {b.ad} <span className="text-ink/40">· {b.adet}</span>
              </li>
            ))}
          </ol>
        )}
      </Bolum>

      <Bolum baslik="Senaryo şıkları" aciklama="test sürümüne göre">
        <div className="grid grid-cols-1 gap-6 md:grid-cols-2">
          {r.senaryo.map((s) => (
            <div key={`${s.testSurumu}-${s.soru}`} className="border border-mist p-5">
              <p className="mb-3 font-display text-lg italic text-ink">
                {SORU_ADI[s.soru] ?? s.soru} · sürüm {s.testSurumu} · {s.kisi} kişi
              </p>
              <OranListesi satirlar={s.siklar} etiket={(a) => sikEtiketi(s.soru, a)} />
            </div>
          ))}
        </div>
      </Bolum>

      <Bolum baslik="Detaylı test" aciklama="isimsiz">
        <div className="mb-8 grid grid-cols-1 gap-4 sm:grid-cols-3">
          <Sayi etiket="Dolduran" deger={r.detayli.dolduran} />
          <Sayi etiket="Afişi gören" deger={r.detayli.davet.goren} />
          <Sayi etiket="Afişe tıklayan" deger={r.detayli.davet.tiklayan} />
          <Sayi etiket="Tıklama oranı" deger={yuzde(r.detayli.davet.tiklamaOrani)} />
          <Sayi etiket="Afişi kapatan" deger={r.detayli.davet.kapatan} />
          <Sayi etiket="Kapatma oranı" deger={yuzde(r.detayli.davet.kapatmaOrani)} />
        </div>
        {r.detayli.dolduran < RAPOR_KUCUK_GRUP ? (
          <p className="text-sm italic text-ink/40">
            {RAPOR_KUCUK_GRUP} kişiden az: dağılım gösterilmiyor.
          </p>
        ) : (
          r.detayli.sorular.map((s) => (
            <div key={s.adim} className="mb-8">
              <h3 className="mb-3 text-xs uppercase tracking-[0.2em] text-ink/50">
                {DETAYLI_SORULAR[s.adim]}
              </h3>
              <OranListesi satirlar={s.dagilim} etiket={(a) => detayliEtiket(s.adim, a)} />
            </div>
          ))
        )}
      </Bolum>
    </>
  );
}
