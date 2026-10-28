'use client';

import { Button } from '@/components/ui/button';
import { useState, useTransition } from 'react';
import { iadePolitikasiKaydetAction } from './actions';

export function IadePolitikasi({ id, ilk }: { id: string; ilk: string | null }) {
  const [deger, setDeger] = useState(ilk ?? '');
  const [kayitli, setKayitli] = useState(ilk ?? '');
  const [hata, setHata] = useState(false);
  const [bekliyor, basla] = useTransition();

  function kaydet() {
    setHata(false);
    basla(async () => {
      try {
        await iadePolitikasiKaydetAction(id, deger.trim() || null);
        setKayitli(deger.trim());
      } catch {
        setHata(true);
      }
    });
  }

  return (
    <div className="flex flex-col gap-2">
      <textarea
        value={deger}
        onChange={(e) => setDeger(e.target.value)}
        maxLength={600}
        rows={2}
        placeholder="İade politikası (altyapıdan okunamadıysa elle yazın)"
        className="w-full rounded-md border border-mist bg-transparent px-3 py-2 text-sm"
      />
      <div className="flex items-center gap-3">
        <Button
          type="button"
          size="sm"
          variant="outline"
          onClick={kaydet}
          disabled={bekliyor || deger.trim() === kayitli}
        >
          {bekliyor ? 'Kaydediliyor…' : 'Kaydet'}
        </Button>
        {hata && <span className="text-xs text-clay">Kaydedilemedi.</span>}
      </div>
    </div>
  );
}
