import type { BulguTuru } from './siniflandir';

type Sayilar = Partial<Record<BulguTuru, { toplam: number; yuksek: number }>>;

const IFADELER: { tur: BulguTuru; yaz: (n: number) => string }[] = [
  { tur: 'park_satilik', yaz: (n) => `${n} alan adı park edilmiş ya da satılık` },
  { tur: 'magaza_kapali', yaz: (n) => `${n} mağaza kapalı görünüyor` },
  { tur: 'baska_alan_adi', yaz: (n) => `${n} butik başka bir alan adına yönleniyor` },
  { tur: 'para_birimi', yaz: (n) => `${n} butik farklı para birimi gösteriyor` },
  { tur: 'marka_uyusmuyor', yaz: (n) => `${n} butiğin sitesindeki marka adı farklı` },
  { tur: 'moda_disi', yaz: (n) => `${n} site moda dışı görünüyor` },
];

export function raporMetni(s: { kontrolEdilen: number; sayilar: Sayilar }): string {
  const bas = `Bu hafta ${s.kontrolEdilen} butik kontrol edildi`;
  const parcalar: string[] = [];

  const ac = s.sayilar.acilmiyor;
  if (ac && ac.toplam > 0) {
    const yuksek = Math.min(ac.yuksek, ac.toplam);
    const orta = ac.toplam - yuksek;
    if (yuksek > 0) parcalar.push(`${yuksek} site ikinci haftadır açılmıyor`);
    if (orta > 0) parcalar.push(`${orta} site bu hafta açılmadı (tekrar bakılacak)`);
  }
  for (const { tur, yaz } of IFADELER) {
    const n = s.sayilar[tur]?.toplam ?? 0;
    if (n > 0) parcalar.push(yaz(n));
  }

  const elle = s.sayilar.elle_bak?.toplam ?? 0;
  const elleCumle = elle > 0 ? `${elle} site otomatik kontrolü engelliyor, elle bakılmalı.` : '';

  if (parcalar.length === 0 && !elleCumle) return `${bas}, yeni sorun yok.`;
  let metin = `${bas}.`;
  if (parcalar.length > 0) metin += ` ${parcalar.join(', ')}.`;
  if (elleCumle) metin += ` ${elleCumle}`;
  return metin;
}

const TUR_ETIKETI: Record<BulguTuru, string> = {
  acilmiyor: 'açılmıyor',
  park_satilik: 'park edilmiş ya da satılık',
  magaza_kapali: 'mağaza kapalı',
  baska_alan_adi: 'başka alan adına yönleniyor',
  para_birimi: 'farklı para birimi',
  marka_uyusmuyor: 'marka adı farklı',
  moda_disi: 'moda dışı',
  elle_bak: 'elle bakılmalı',
};

function kac(s: string): string {
  return s
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;');
}

export function epostaIcerigi(
  ozet: string,
  enOnemliler: { ad: string; tur: BulguTuru; kanit: string }[],
  adminUrl: string,
): { subject: string; html: string; text: string } {
  const liste = enOnemliler.slice(0, 10);
  const subject = 'Butik kontrolü: bu hafta bakılacak butikler var';

  const text = [
    ozet,
    '',
    ...liste.map((b) => `- ${b.ad}: ${TUR_ETIKETI[b.tur]} (${b.kanit})`),
    '',
    `Ayrıntılar: ${adminUrl}`,
  ].join('\n');

  const maddeler = liste
    .map(
      (b) =>
        `<li style="margin:0 0 6px"><strong>${kac(b.ad)}</strong>: ${kac(TUR_ETIKETI[b.tur])} <span style="color:#666">(${kac(b.kanit)})</span></li>`,
    )
    .join('');
  const html = `<div style="font-family:-apple-system,Helvetica,Arial,sans-serif;max-width:560px;margin:0 auto;color:#222">
<h2 style="margin:0 0 12px">Butik kontrolü</h2>
<p style="margin:0 0 16px">${kac(ozet)}</p>
${liste.length > 0 ? `<ul style="padding-left:18px;margin:0 0 20px">${maddeler}</ul>` : ''}
<p><a href="${kac(adminUrl)}" style="display:inline-block;background:#222;color:#fff;padding:10px 18px;border-radius:6px;text-decoration:none">Ayrıntıları aç</a></p>
</div>`;

  return { subject, html, text };
}

/** ISO yıl-hafta, Europe/Istanbul saatine göre (ör. 2026-W40). */
export function haftaAnahtari(tarih: Date): string {
  const p = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Europe/Istanbul',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(tarih);
  const g = (t: string) => Number(p.find((x) => x.type === t)?.value);
  const d = new Date(Date.UTC(g('year'), g('month') - 1, g('day')));
  const gun = d.getUTCDay() || 7;
  d.setUTCDate(d.getUTCDate() + 4 - gun); // haftanın perşembesi
  const yil = d.getUTCFullYear();
  const hafta = Math.ceil(((d.getTime() - Date.UTC(yil, 0, 1)) / 86400000 + 1) / 7);
  return `${yil}-W${String(hafta).padStart(2, '0')}`;
}
