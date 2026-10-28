'use client';

import { cn } from '@/lib/utils';
import { TARZLAR } from '@butika/types';
import { useState } from 'react';

// Tarz durumu neden boş — kullanıcıya ne yapması gerektiğini söyleyen metin.
function nedenMetni(tarzDurumu: string | null): string {
  if (tarzDurumu === 'kapsam_disi') {
    return 'Tarz sözlüğü giyim için; bu butiğin kategorisi kapsam dışı. İstersen elle seç.';
  }
  if (tarzDurumu === 'emin_degil') {
    return 'Model emin olamadı. Siteyi inceleyip elle seç.';
  }
  if (tarzDurumu === 'yetersiz_veri') {
    return 'Yeterli ürün bulunamadı. Siteyi inceleyip elle seç.';
  }
  return 'Henüz hesaplanmadı. Siteyi inceleyip elle seçebilirsin.';
}

interface TarzFieldProps {
  tarz1: string | null;
  tarz2: string | null;
  tarzGuven: string | null;
  tarzDurumu: string | null;
  tarzGerekce: string | null;
  tarzHesapTarihi: string | null;
}

export function TarzField({
  tarz1,
  tarz2,
  tarzGuven,
  tarzDurumu,
  tarzGerekce,
  tarzHesapTarihi,
}: TarzFieldProps) {
  // Seçim sırası önemli: ilk seçilen birincil (baskın) tarz. En fazla 2.
  const [secili, setSecili] = useState<string[]>([tarz1, tarz2].filter(Boolean) as string[]);

  function toggle(tarz: string) {
    setSecili((mevcut) => {
      if (mevcut.includes(tarz)) return mevcut.filter((t) => t !== tarz);
      if (mevcut.length >= 2) return [mevcut[0] as string, tarz];
      return [...mevcut, tarz];
    });
  }

  const tarih = tarzHesapTarihi
    ? new Date(tarzHesapTarihi).toLocaleDateString('tr-TR', {
        day: 'numeric',
        month: 'short',
        year: 'numeric',
      })
    : null;

  return (
    <fieldset className="flex flex-col gap-3">
      <legend className="text-xs uppercase tracking-[0.18em] text-ink/70 font-medium leading-none">
        Tarz{' '}
        <span className="normal-case tracking-normal text-ink/40">(en fazla 2, önce baskın)</span>
      </legend>

      {/* Form her zaman değer gönderir; boş dize = etiketsiz. */}
      <input type="hidden" name="tarz1" value={secili[0] ?? ''} />
      <input type="hidden" name="tarz2" value={secili[1] ?? ''} />

      {!tarz1 && (
        <p className="border border-clay/30 bg-clay/5 px-3 py-2 text-xs leading-relaxed text-clay">
          ⚠ {nedenMetni(tarzDurumu)}
        </p>
      )}

      <div className="flex flex-wrap gap-2">
        {TARZLAR.map((t) => {
          const sira = secili.indexOf(t);
          return (
            <button
              key={t}
              type="button"
              onClick={() => toggle(t)}
              className={cn(
                'rounded-full border px-4 py-1.5 text-sm transition-colors',
                sira >= 0
                  ? 'border-gold bg-gold/10 text-ink'
                  : 'border-input text-ink/60 hover:border-gold/40',
              )}
            >
              {sira >= 0 ? `${sira + 1}. ` : ''}
              {t}
            </button>
          );
        })}
      </div>

      {tarzDurumu === 'elle_atandi' ? (
        <p className="text-xs text-ink/40">Elle atandı{tarih ? ` · ${tarih}` : ''}</p>
      ) : tarz1 ? (
        <p className="text-xs text-ink/40">
          Otomatik hesaplandı{tarih ? ` · ${tarih}` : ''}
          {tarzGuven === 'dusuk' ? ' · düşük güven' : ''}
          {tarzGerekce ? ` · ${tarzGerekce}` : ''}
        </p>
      ) : null}
    </fieldset>
  );
}
