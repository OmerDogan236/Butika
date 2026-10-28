'use client';

import { cn } from '@/lib/utils';
import { YAS_ARALIKLARI, YAS_ETIKETLERI } from '@butika/types';
import { useState } from 'react';

interface YasFieldProps {
  hedefYaslar: string[] | null;
  yasGuven: string | null;
}

export function YasField({ hedefYaslar, yasGuven }: YasFieldProps) {
  const [secili, setSecili] = useState<string[]>(hedefYaslar ?? []);

  function toggle(y: string) {
    setSecili((m) => (m.includes(y) ? m.filter((x) => x !== y) : [...m, y]));
  }

  const belirlenmedi = !hedefYaslar || hedefYaslar.length === 0;

  return (
    <fieldset className="flex flex-col gap-3">
      <legend className="text-xs uppercase tracking-[0.18em] text-ink/70 font-medium leading-none">
        Hedef yaş{' '}
        <span className="normal-case tracking-normal text-ink/40">(birden fazla olabilir)</span>
      </legend>

      {/* Alan formda var işareti: hiç seçili değilse de boş liste gönderilir. */}
      <input type="hidden" name="hedefYasVar" value="1" />
      {secili.map((y) => (
        <input key={y} type="hidden" name="hedefYas" value={y} />
      ))}

      {belirlenmedi ? (
        <p className="text-xs text-ink/40">Henüz belirlenmedi</p>
      ) : yasGuven === 'dusuk' ? (
        <p className="border border-clay/30 bg-clay/5 px-3 py-2 text-xs leading-relaxed text-clay">
          ⚠ Kontrol et (yapay zekâ emin değil). Doğruysa kaydetmen yeterli, onaylanmış sayılır.
        </p>
      ) : null}

      <div className="flex flex-wrap gap-2">
        {YAS_ARALIKLARI.map((y) => (
          <button
            key={y}
            type="button"
            onClick={() => toggle(y)}
            className={cn(
              'rounded-full border px-4 py-1.5 text-sm transition-colors',
              secili.includes(y)
                ? 'border-gold bg-gold/10 text-ink'
                : 'border-input text-ink/60 hover:border-gold/40',
            )}
          >
            {YAS_ETIKETLERI[y]}
          </button>
        ))}
      </div>
    </fieldset>
  );
}
