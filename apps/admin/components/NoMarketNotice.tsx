import { Button } from '@/components/ui/button';
import { Globe } from 'lucide-react';
import Link from 'next/link';

// Aktif pazar yokken kategori/butik ekranlarında gösterilir.
export function NoMarketNotice() {
  return (
    <div className="flex flex-col items-center gap-4 border border-mist px-8 py-24 text-center">
      <Globe className="h-8 w-8 text-ink/30" strokeWidth={1.5} />
      <p className="font-display text-2xl italic text-ink/60">Henüz aktif pazar yok.</p>
      <p className="text-sm text-ink/40">Önce Ülkeler'den bir pazar ekle ve aktifleştir.</p>
      <Button asChild variant="gold" size="lg">
        <Link href="/countries">Ülkeler</Link>
      </Button>
    </div>
  );
}
