// apps/admin/app/(app)/profiller/page.tsx
import { PageHeader } from '@/components/PageHeader';
import { api } from '@/lib/api';
import {
  FIYAT_ETIKETLERI,
  type Oran,
  PROFIL_RAPOR_ARALIKLARI,
  type ProfilRaporu,
  type ProfilUyumu,
  RAPOR_KUCUK_GRUP,
  YAS_ETIKETLERI,
} from '@butika/types';
import Link from 'next/link';
import type { ReactNode } from 'react';

// Kullanıcı profilleri: tarz testi + davranıştan hesaplanan profillerin isimsiz özeti.
// Tasarım: docs/superpowers/specs/2026-10-05-kullanici-profili-tasarim.md (bölüm 5)

const ARALIK_ADI: Record<(typeof PROFIL_RAPOR_ARALIKLARI)[number], string> = {
  '7d': '7 gün',
  '30d': '30 gün',
  '90d': '90 gün',
};

const KAYNAK_ADI: Record<string, string> = {
  test: 'Yalnız test',
  davranis: 'Yalnız davranış',
  karisik: 'Test + davranış',
  bos: 'Boş',
};

const SIRALAMA_ADI: Record<string, string> = {
  kisisel: 'Sana özel (kişisel)',
  onerilen: 'Önerilen (admin sırası)',
};

const yuzde = (o: number | null) =>
  o === null ? 'yetersiz veri' : `%${o.toLocaleString('tr-TR')}`;
const fiyatAdi = (a: string) => FIYAT_ETIKETLERI[a as keyof typeof FIYAT_ETIKETLERI] ?? a;
const yasAdi = (a: string) => YAS_ETIKETLERI[a as keyof typeof YAS_ETIKETLERI] ?? a;
const para = (minor: number, birim: string) =>
  (minor / 100).toLocaleString('tr-TR', {
    style: 'currency',
    currency: birim,
    maximumFractionDigits: 0,
  });

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

function Uyum({ baslik, u }: { baslik: string; u: ProfilUyumu }) {
  return (
    <div className="border border-mist p-6">
      <p className="text-xs uppercase tracking-[0.22em] text-ink/50">{baslik}</p>
      <p className="mt-3 font-display text-4xl italic leading-none text-ink">{yuzde(u.oran)}</p>
      <p className="mt-3 text-sm text-ink/60">
        {u.kisi} kişiden {u.uyusan}'inde uyuşuyor, {u.kisi - u.uyusan}'inde ayrışıyor
      </p>
    </div>
  );
}

function Anahtar({ ad, acik }: { ad: string; acik: boolean }) {
  return (
    <span className="mr-4 inline-flex items-center gap-2 text-xs uppercase tracking-[0.18em]">
      <span className={acik ? 'h-2 w-2 rounded-full bg-sage' : 'h-2 w-2 rounded-full bg-ink/30'} />
      <span className="text-ink/70">
        {ad}: {acik ? 'açık' : 'kapalı'}
      </span>
    </span>
  );
}

export default async function ProfillerPage({
  searchParams,
}: {
  searchParams: Promise<{ range?: string }>;
}) {
  const params = await searchParams;
  const range = PROFIL_RAPOR_ARALIKLARI.find((r) => r === params.range) ?? '30d';
  const r = await api.get<ProfilRaporu>(`/admin/profiller?range=${range}`);
  const kimlik = r.anahtarlar.kimlikGoster;

  return (
    <>
      <PageHeader
        kicker="Kullanıcı Profilleri"
        title="Profil analitiği"
        description={`Tarz testi ve davranıştan (kayıt, satın alma, butik açma) çıkan profiller. Kullanıcılar kısa kimlikle görünür. ${RAPOR_KUCUK_GRUP} kişiden küçük gruplarda oran gösterilmez.`}
        action={
          <div className="flex items-center gap-1 rounded-md border border-mist p-1">
            {PROFIL_RAPOR_ARALIKLARI.map((x) => (
              <Link
                key={x}
                href={`/profiller?range=${x}`}
                className={
                  x === range
                    ? 'rounded bg-ink px-3 py-1.5 text-xs uppercase tracking-[0.18em] text-cream'
                    : 'px-3 py-1.5 text-xs uppercase tracking-[0.18em] text-ink/60 hover:text-ink'
                }
              >
                {ARALIK_ADI[x]}
              </Link>
            ))}
          </div>
        }
      />

      <div className="mb-10 border border-mist px-6 py-4">
        <Anahtar ad="Profil hesabı" acik={r.anahtarlar.hesap} />
        <Anahtar ad="Vitrin ve Butikcan" acik={r.anahtarlar.vitrin} />
        <Anahtar ad="İsim/e-posta" acik={kimlik} />
        <p className="mt-2 text-xs text-ink/40">
          Anahtarlar sunucu ayarıdır (PROFIL_HESAP_ENABLED, PROFIL_VITRIN_ENABLED,
          PROFIL_RAPOR_KIMLIK_GOSTER).
        </p>
      </div>

      <Bolum baslik="Özet" aciklama="güncel profiller">
        <div className="mb-8 grid grid-cols-1 gap-4 sm:grid-cols-2">
          <Sayi etiket="Profil" deger={r.ozet.profil} />
          <Sayi etiket="Dolu profil (boş hariç)" deger={r.ozet.dolu} />
        </div>
        <h3 className="mb-3 text-xs uppercase tracking-[0.2em] text-ink/50">Kaynak</h3>
        <OranListesi satirlar={r.ozet.kaynak} etiket={(a) => KAYNAK_ADI[a] ?? a} />
        <div className="mt-8 grid grid-cols-1 gap-8 md:grid-cols-2">
          <div>
            <h3 className="mb-3 text-xs uppercase tracking-[0.2em] text-ink/50">
              Tarz (birinci tarz)
            </h3>
            <OranListesi satirlar={r.ozet.tarz} />
          </div>
          <div>
            <h3 className="mb-3 text-xs uppercase tracking-[0.2em] text-ink/50">
              Bütçe (en güçlü segment)
            </h3>
            <OranListesi satirlar={r.ozet.butce} etiket={fiyatAdi} />
          </div>
          <div>
            <h3 className="mb-3 text-xs uppercase tracking-[0.2em] text-ink/50">Yaş</h3>
            <OranListesi satirlar={r.ozet.yas} etiket={yasAdi} />
          </div>
          <div>
            <h3 className="mb-3 text-xs uppercase tracking-[0.2em] text-ink/50">
              En çok ilgi gören kategoriler
            </h3>
            <OranListesi satirlar={r.ozet.kategoriler} />
          </div>
        </div>
      </Bolum>

      <Bolum baslik="Test ile davranış farkı" aciklama="testi ve en az 3 kaydı olanlar">
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <Uyum baslik="Tarz uyumu" u={r.fark.tarz} />
          <Uyum baslik="Bütçe uyumu" u={r.fark.butce} />
        </div>
        <p className="mt-3 text-xs text-ink/40">
          Tarz: kayıtlı ürünlerin butiklerinden çıkan birinci tarz, testteki iki tarzdan biriyse
          uyuşur. Bütçe: kayıtların en sık fiyat segmenti testte seçilenlerdense uyuşur.
        </p>
      </Bolum>

      <Bolum baslik="Öneri başarısı" aciklama={ARALIK_ADI[range]}>
        <div className="mb-8 grid grid-cols-1 gap-4 sm:grid-cols-3">
          <Sayi etiket="Öneri gösterimi" deger={r.oneri.gosterim} />
          <Sayi etiket="Öneri tıklaması" deger={r.oneri.tiklama} />
          <Sayi etiket="Öneri tıklama oranı" deger={yuzde(r.oneri.tiklamaOrani)} />
        </div>
        <h3 className="mb-3 text-xs uppercase tracking-[0.2em] text-ink/50">
          Vitrinden butik açma, sıralamaya göre
        </h3>
        <table className="w-full border border-mist text-sm">
          <thead>
            <tr className="text-left text-xs uppercase tracking-[0.18em] text-ink/50">
              <th className="px-6 py-3 font-medium">Sıralama</th>
              <th className="px-6 py-3 font-medium">Açan kişi</th>
              <th className="px-6 py-3 font-medium">Açma</th>
              <th className="px-6 py-3 font-medium">Kişi başına</th>
            </tr>
          </thead>
          <tbody>
            {r.oneri.vitrin.map((v) => (
              <tr key={v.siralama} className="border-t border-mist/60">
                <td className="px-6 py-2 text-ink">{SIRALAMA_ADI[v.siralama] ?? v.siralama}</td>
                <td className="px-6 py-2 text-ink/80">{v.kisi}</td>
                <td className="px-6 py-2 text-ink/80">{v.acma}</td>
                <td className="px-6 py-2 text-ink/80">
                  {v.kisiBasina === null ? 'yetersiz veri' : v.kisiBasina.toLocaleString('tr-TR')}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        <p className="mt-2 text-xs text-ink/40">
          Gösterim başına oran için kart gösterimi gerekir; o ölçüm yalnız PostHog'da
          (boutique_impression).
        </p>
      </Bolum>

      <Bolum
        baslik="Kullanıcılar"
        aciklama={`${r.kullanicilar.satirlar.length} / ${r.kullanicilar.toplam} · son güncellenen`}
      >
        {r.kullanicilar.satirlar.length === 0 ? (
          <p className="text-sm italic text-ink/40">Henüz profil yok.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full border border-mist text-sm">
              <thead>
                <tr className="text-left text-xs uppercase tracking-[0.18em] text-ink/50">
                  <th className="px-4 py-3 font-medium">Kimlik</th>
                  {kimlik ? <th className="px-4 py-3 font-medium">Ad / e-posta</th> : null}
                  <th className="px-4 py-3 font-medium">Kaynak</th>
                  <th className="px-4 py-3 font-medium">Tarz</th>
                  <th className="px-4 py-3 font-medium">Bütçe</th>
                  <th className="px-4 py-3 font-medium">İlgi alanları</th>
                  <th className="px-4 py-3 font-medium">Kayıt</th>
                  <th className="px-4 py-3 font-medium">Güncellendi</th>
                </tr>
              </thead>
              <tbody>
                {r.kullanicilar.satirlar.map((s) => (
                  <tr key={s.kisaKimlik} className="border-t border-mist/60 align-top">
                    <td className="px-4 py-2 font-mono text-xs text-ink">{s.kisaKimlik}</td>
                    {kimlik ? (
                      <td className="px-4 py-2 text-ink/80">
                        {s.ad ?? '—'}
                        <br />
                        <span className="text-xs text-ink/50">{s.eposta ?? '—'}</span>
                      </td>
                    ) : null}
                    <td className="px-4 py-2 text-ink/80">{KAYNAK_ADI[s.kaynak] ?? s.kaynak}</td>
                    <td className="px-4 py-2 text-ink/80">{s.tarzlar.join(', ') || '—'}</td>
                    <td className="px-4 py-2 text-ink/80">
                      {s.butce.map(fiyatAdi).join(', ') || '—'}
                      {Object.entries(s.ortanca).map(([birim, minor]) => (
                        <span key={birim} className="block text-xs text-ink/50">
                          ortanca {para(minor, birim)}
                        </span>
                      ))}
                    </td>
                    <td className="px-4 py-2 text-ink/80">{s.ilgiAlanlari.join(', ') || '—'}</td>
                    <td className="px-4 py-2 text-ink/80">{s.kayitSayisi}</td>
                    <td className="px-4 py-2 text-ink/60">
                      {new Date(s.guncellendi).toLocaleString('tr-TR', {
                        timeZone: 'Europe/Istanbul',
                        dateStyle: 'short',
                        timeStyle: 'short',
                      })}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Bolum>
    </>
  );
}
