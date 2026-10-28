'use client';

import { Button } from '@/components/ui/button';
import type { BildirimDurumu } from '@butika/types';
import { useState, useTransition } from 'react';
import { bildirimDurumu } from './actions';

/** Taslak → Onayla; taslak/planlı → İptal; planlı → Taslağa al. */
export function DurumDugmeleri({ id, durum }: { id: string; durum: BildirimDurumu }) {
  const [pending, start] = useTransition();
  const [hata, setHata] = useState<string | null>(null);
  const degistir = (yeni: 'planlandi' | 'iptal' | 'taslak') =>
    start(async () => {
      const r = await bildirimDurumu(id, yeni);
      setHata(r.error ?? null);
    });

  if (durum !== 'taslak' && durum !== 'planlandi') return null;
  return (
    <div className="flex flex-wrap items-center gap-2">
      {durum === 'taslak' ? (
        <Button size="sm" variant="gold" disabled={pending} onClick={() => degistir('planlandi')}>
          Onayla
        </Button>
      ) : (
        <Button size="sm" variant="outline" disabled={pending} onClick={() => degistir('taslak')}>
          Taslağa al
        </Button>
      )}
      <Button size="sm" variant="ghost" disabled={pending} onClick={() => degistir('iptal')}>
        İptal
      </Button>
      {hata ? <span className="text-xs text-clay">{hata}</span> : null}
    </div>
  );
}
