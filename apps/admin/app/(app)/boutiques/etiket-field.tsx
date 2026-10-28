'use client';

import { cn } from '@/lib/utils';
import { BUTIK_ETIKETLERI, type ButikEtiketi, ETIKET_ACIKLAMALARI } from '@butika/types';
import { useState } from 'react';

/**
 * Kategori grubuna özel etiketler — TARZDAN AYRI alan.
 *
 * Tarz sözlüğü giyim içindir ve kullanıcının tarz testiyle eşleştirilir; bu etiketler
 * ise yalnız arama ve Butikcan bağlamı için. Şu an güzellik/parfüm grubu dolu.
 */
export function EtiketField({ etiketler }: { etiketler: string[] }) {
  const [secili, setSecili] = useState<string[]>(etiketler ?? []);

  function toggle(etiket: string) {
    setSecili((mevcut) =>
      mevcut.includes(etiket)
        ? mevcut.filter((e) => e !== etiket)
        : mevcut.length >= 3
          ? mevcut
          : [...mevcut, etiket],
    );
  }

  return (
    <fieldset className="flex flex-col gap-3">
      <legend className="text-xs uppercase tracking-[0.18em] text-ink/70 font-medium leading-none">
        Güzellik etiketi{' '}
        <span className="normal-case tracking-normal text-ink/40">
          (en fazla 3 · yalnız kozmetik ve parfüm butikleri için)
        </span>
      </legend>

      {/* Boş gönderim de anlamlı: "etiketi kaldır" demek. */}
      <input type="hidden" name="etiketler" value={secili.join(',')} />

      <div className="flex flex-wrap gap-2">
        {BUTIK_ETIKETLERI.map((e) => (
          <button
            key={e}
            type="button"
            onClick={() => toggle(e)}
            title={ETIKET_ACIKLAMALARI[e as ButikEtiketi]}
            className={cn(
              'rounded-full border px-4 py-1.5 text-sm transition-colors',
              secili.includes(e)
                ? 'border-gold bg-gold/10 text-ink'
                : 'border-input text-ink/60 hover:border-gold/40',
            )}
          >
            {e}
          </button>
        ))}
      </div>

      <p className="text-xs text-ink/40">
        Tarzdan bağımsızdır, tarz testine girmez. Butikcan "doğal içerikli bir şey", "niş parfüm"
        gibi isteklerde bu etiketlere bakar.
      </p>
    </fieldset>
  );
}
