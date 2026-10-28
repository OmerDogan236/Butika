'use client';

import { useRouter } from 'next/navigation';
import { useEffect } from 'react';

// Tur sürerken sunucu bileşenlerini 10 saniyede bir yeniler.
export function AutoYenile({ aktif }: { aktif: boolean }) {
  const router = useRouter();
  useEffect(() => {
    if (!aktif) return;
    const t = setInterval(() => router.refresh(), 10_000);
    return () => clearInterval(t);
  }, [aktif, router]);
  return null;
}
