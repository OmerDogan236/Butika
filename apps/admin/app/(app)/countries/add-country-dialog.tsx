'use client';

import { Button } from '@/components/ui/button';
import { ISO_COUNTRIES } from '@/lib/iso-countries';
import { normalizeTr } from '@/lib/normalize';
import { cn } from '@/lib/utils';
import { codeToFlag } from '@butika/types';
import { X } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { useMemo, useState, useTransition } from 'react';
import { createCountryAction } from './actions';

export function AddCountryDialog({
  existing,
  onClose,
}: {
  existing: string[];
  onClose: () => void;
}) {
  const router = useRouter();
  const [query, setQuery] = useState('');
  const [selected, setSelected] = useState<{ code: string; name: string } | null>(null);
  const [lang, setLang] = useState<'tr' | 'en'>('en');
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  const existingSet = useMemo(() => new Set(existing), [existing]);
  const needle = normalizeTr(query.trim());
  const list = ISO_COUNTRIES.filter((c) => !existingSet.has(c.code)).filter(
    (c) => !needle || normalizeTr(c.name).includes(needle) || c.code.toLowerCase().includes(needle),
  );

  function pick(c: { code: string; name: string }) {
    setSelected(c);
    setLang(c.code === 'TR' ? 'tr' : 'en');
    setError(null);
  }

  function submit() {
    if (!selected) return;
    setError(null);
    startTransition(async () => {
      const res = await createCountryAction({
        code: selected.code,
        name: selected.name,
        defaultLanguage: lang,
      });
      if (res?.error) {
        setError(res.error);
        return;
      }
      onClose();
      router.refresh();
    });
  }

  return (
    // biome-ignore lint/a11y/noStaticElementInteractions: backdrop tıklamayla kapanır
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-ink/40 p-4"
      onMouseDown={onClose}
    >
      <div
        className="flex max-h-[80vh] w-full max-w-2xl flex-col overflow-hidden rounded-lg border border-mist bg-cream shadow-xl"
        onMouseDown={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between border-b border-mist px-6 py-4">
          <div>
            <p className="text-xs uppercase tracking-[0.3em] text-ink/50">Pazarlar</p>
            <h2 className="mt-1 font-display text-2xl italic text-ink">Ülke ekle</h2>
          </div>
          <button type="button" onClick={onClose} className="text-ink/40 hover:text-ink">
            <X className="h-5 w-5" strokeWidth={1.5} />
          </button>
        </div>

        <div className="border-b border-mist px-6 py-3">
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Ülke ara…"
            // biome-ignore lint/a11y/noAutofocus: arama modalı, otomatik odak beklenen davranış
            autoFocus
            className="h-9 w-full bg-transparent text-sm text-ink placeholder:text-ink/35 focus:outline-none"
          />
        </div>

        <div className="grid grid-cols-2 gap-2 overflow-y-auto px-6 py-4 sm:grid-cols-3">
          {list.map((c) => (
            <button
              key={c.code}
              type="button"
              onClick={() => pick(c)}
              className={cn(
                'flex items-center gap-2 rounded-md border px-3 py-2 text-left text-sm transition-colors',
                selected?.code === c.code
                  ? 'border-gold bg-gold/10 text-ink'
                  : 'border-mist text-ink/70 hover:border-gold/40',
              )}
            >
              <span className="text-xl leading-none">{codeToFlag(c.code)}</span>
              <span className="truncate">{c.name}</span>
            </button>
          ))}
          {list.length === 0 && (
            <p className="col-span-full py-8 text-center text-sm text-ink/40">
              Eşleşen ülke yok (ya da hepsi zaten ekli).
            </p>
          )}
        </div>

        <div className="flex items-center justify-between gap-3 border-t border-mist px-6 py-4">
          {selected ? (
            <div className="flex items-center gap-3 text-sm">
              <span className="text-xl leading-none">{codeToFlag(selected.code)}</span>
              <span className="text-ink">{selected.name}</span>
              <label className="ml-2 flex items-center gap-1.5 text-ink/60">
                Varsayılan dil
                <select
                  value={lang}
                  onChange={(e) => setLang(e.target.value as 'tr' | 'en')}
                  className="rounded border border-mist bg-cream px-2 py-1 text-ink"
                >
                  <option value="tr">Türkçe</option>
                  <option value="en">English</option>
                </select>
              </label>
            </div>
          ) : (
            <span className="text-sm text-ink/40">Bir ülke seç</span>
          )}
          <div className="flex items-center gap-2">
            {error && <span className="text-xs text-clay">{error}</span>}
            <Button variant="ghost" size="sm" type="button" onClick={onClose}>
              Vazgeç
            </Button>
            <Button
              variant="gold"
              size="sm"
              type="button"
              onClick={submit}
              disabled={!selected || pending}
            >
              {pending ? 'Ekleniyor…' : 'Ekle'}
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}
