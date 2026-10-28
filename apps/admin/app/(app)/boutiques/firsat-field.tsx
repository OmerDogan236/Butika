'use client';

import { Field } from '@/components/ui/field';
import { Input } from '@/components/ui/input';
import { FIRSAT_NOTU_MAKS } from '@butika/types';
import { useState } from 'react';

interface FirsatFieldProps {
  firsat: boolean;
  firsatSirasi: number | null;
  firsatNotu: string | null;
}

/** Uygulamadaki "Fırsat" sekmesi ("Hangi butiklerde indirim var?"): işaret, elle sıra, indirim notu. */
export function FirsatField({ firsat, firsatSirasi, firsatNotu }: FirsatFieldProps) {
  const [secili, setSecili] = useState(firsat);

  return (
    <fieldset className="flex flex-col gap-3">
      <legend className="text-xs uppercase tracking-[0.18em] text-ink/70 font-medium leading-none">
        Fırsat
      </legend>

      {/* Alan formda var işareti: kutu boşken tarayıcı hiçbir şey göndermez. */}
      <input type="hidden" name="firsatAlanVar" value="1" />
      <label className="flex h-10 items-center gap-3 text-sm">
        <input
          type="checkbox"
          name="firsat"
          checked={secili}
          onChange={(e) => setSecili(e.target.checked)}
          className="h-4 w-4 accent-gold"
        />
        <span>Fırsat sekmesinde göster (indirimde)</span>
      </label>

      <Field label="Sıra" htmlFor="firsatSirasi" hint="Küçük olan önce; boşsa sona (isteğe bağlı)">
        <Input
          id="firsatSirasi"
          name="firsatSirasi"
          type="number"
          min={0}
          max={9999}
          step={1}
          defaultValue={firsatSirasi ?? ''}
          className="w-28"
        />
      </Field>

      <Field
        label="İndirim notu"
        htmlFor="firsatNotu"
        hint="Kartta butik adının altında görünür (isteğe bağlı)"
      >
        <Input
          id="firsatNotu"
          name="firsatNotu"
          defaultValue={firsatNotu ?? ''}
          maxLength={FIRSAT_NOTU_MAKS}
          placeholder="%30'a varan sezon sonu"
        />
      </Field>
    </fieldset>
  );
}
