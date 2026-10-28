'use client';

import { cn } from '@/lib/utils';
import { useState } from 'react';

const SEGMENTLER = [
  { deger: 'uygun', etiket: 'Uygun' },
  { deger: 'orta', etiket: 'Orta' },
  { deger: 'yuksek', etiket: 'Yüksek' },
  { deger: 'luks', etiket: 'Lüks' },
] as const;

// Segment neden hesaplanamadı — kullanıcıya ne yapması gerektiğini söyleyen metin.
function nedenMetni(fiyatGuven: string | null, temsiliFiyatTl: string | null): string | null {
  if (fiyatGuven === 'fiyat_supheli') {
    const f = temsiliFiyatTl
      ? `${Math.round(Number(temsiliFiyatTl)).toLocaleString('tr-TR')} ₺`
      : '';
    return `Fiyat şüpheli — bulunan ortanca ${f}, gerçekçi görünmüyor. Siteyi inceleyip elle seç.`;
  }
  if (fiyatGuven === 'yetersiz_veri') {
    return 'Veri alınamadı — sitede yeterli ürün fiyatı bulunamadı. Siteyi inceleyip elle seç.';
  }
  return 'Veri alınamadı — siteye erişilemedi. Siteyi inceleyip elle seç.';
}

interface SegmentFieldProps {
  fiyatSegmenti: string | null;
  fiyatGuven: string | null;
  temsiliFiyatTl: string | null;
  urunSayisiKategori: number | null;
  fiyatHesapTarihi: string | null;
}

export function SegmentField({
  fiyatSegmenti,
  fiyatGuven,
  temsiliFiyatTl,
  urunSayisiKategori,
  fiyatHesapTarihi,
}: SegmentFieldProps) {
  const [secili, setSecili] = useState<string | null>(fiyatSegmenti);

  const tarih = fiyatHesapTarihi
    ? new Date(fiyatHesapTarihi).toLocaleDateString('tr-TR', {
        day: 'numeric',
        month: 'short',
        year: 'numeric',
      })
    : null;

  return (
    <fieldset className="flex flex-col gap-3">
      <legend className="text-xs uppercase tracking-[0.18em] text-ink/70 font-medium leading-none">
        Fiyat segmenti
      </legend>

      {/* Form her zaman bir değer gönderir; boş dize = belirsiz bırak. */}
      <input type="hidden" name="fiyatSegmenti" value={secili ?? ''} />

      {!fiyatSegmenti && (
        <p className="border border-clay/30 bg-clay/5 px-3 py-2 text-xs leading-relaxed text-clay">
          ⚠ {nedenMetni(fiyatGuven, temsiliFiyatTl)}
        </p>
      )}

      <div className="flex flex-wrap gap-2">
        {SEGMENTLER.map((s) => {
          const aktif = secili === s.deger;
          return (
            <button
              key={s.deger}
              type="button"
              onClick={() => setSecili(s.deger)}
              className={cn(
                'rounded-full border px-4 py-1.5 text-sm transition-colors',
                aktif
                  ? 'border-gold bg-gold/10 text-ink'
                  : 'border-input text-ink/60 hover:border-gold/40',
              )}
            >
              {s.etiket}
            </button>
          );
        })}
      </div>

      {secili && (
        <button
          type="button"
          onClick={() => setSecili(null)}
          className="self-start text-xs text-ink/40 underline underline-offset-2 hover:text-ink/70"
        >
          Belirsiz bırak
        </button>
      )}

      {fiyatGuven === 'elle_atandi' ? (
        <p className="text-xs text-ink/40">Elle atandı{tarih ? ` · ${tarih}` : ''}</p>
      ) : fiyatSegmenti ? (
        <p className="text-xs text-ink/40">
          Otomatik hesaplandı{tarih ? ` · ${tarih}` : ''}
          {temsiliFiyatTl
            ? ` · temsili fiyat ${Math.round(Number(temsiliFiyatTl)).toLocaleString('tr-TR')} ₺`
            : ''}
          {urunSayisiKategori ? ` · ${urunSayisiKategori} üründen` : ''}
        </p>
      ) : null}
    </fieldset>
  );
}
