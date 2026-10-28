'use client';

import { Field } from '@/components/ui/field';
import { Input } from '@/components/ui/input';
import { EDITOR_NOTU_MAKS } from '@butika/types';
import { useState } from 'react';

interface EditorFieldProps {
  editorSecimi: boolean;
  editorSirasi: number | null;
  editorNotu: string | null;
}

/** Vitrinin üstündeki "Editörün Seçimi" şeridi: işaret, elle sıra, kart notu. */
export function EditorField({ editorSecimi, editorSirasi, editorNotu }: EditorFieldProps) {
  const [secili, setSecili] = useState(editorSecimi);

  return (
    <fieldset className="flex flex-col gap-3">
      <legend className="text-xs uppercase tracking-[0.18em] text-ink/70 font-medium leading-none">
        Editörün Seçimi
      </legend>

      {/* Alan formda var işareti: kutu boşken tarayıcı hiçbir şey göndermez. */}
      <input type="hidden" name="editorAlanVar" value="1" />
      <label className="flex h-10 items-center gap-3 text-sm">
        <input
          type="checkbox"
          name="editorSecimi"
          checked={secili}
          onChange={(e) => setSecili(e.target.checked)}
          className="h-4 w-4 accent-gold"
        />
        <span>Vitrinde Editörün Seçimi şeridinde göster</span>
      </label>

      <Field label="Sıra" htmlFor="editorSirasi" hint="Küçük olan önce; boşsa sona (isteğe bağlı)">
        <Input
          id="editorSirasi"
          name="editorSirasi"
          type="number"
          min={0}
          max={9999}
          step={1}
          defaultValue={editorSirasi ?? ''}
          className="w-28"
        />
      </Field>

      <Field
        label="Editör notu"
        htmlFor="editorNotu"
        hint="Kartta butik adının altında görünür (isteğe bağlı)"
      >
        <Input
          id="editorNotu"
          name="editorNotu"
          defaultValue={editorNotu ?? ''}
          maxLength={EDITOR_NOTU_MAKS}
          placeholder="Modal takımları yaz akşamları için kusursuz."
        />
      </Field>
    </fieldset>
  );
}
