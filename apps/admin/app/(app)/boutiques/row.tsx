import { Button } from '@/components/ui/button';
import Link from 'next/link';
import { deleteBoutiqueAction } from './actions';
import { BoutiqueThumb } from './boutique-thumb';

interface Boutique {
  id: string;
  name: string;
  coverImageUrl: string;
  isActive: boolean;
  /** Uygulamadaki Fırsat sekmesinde (indirimde) görünüyor mu. */
  firsat?: boolean;
}

export function BoutiqueRow({
  boutique,
  categoryNames,
  url,
}: {
  boutique: Boutique;
  categoryNames: string[];
  /** Arama sonuçlarında aynı adlı kayıtları ayırmak için site adresi. */
  url?: string;
}) {
  return (
    <div className="flex items-center gap-4 py-3 pr-6">
      <BoutiqueThumb src={boutique.coverImageUrl} alt={boutique.name} />
      <div className="min-w-0 flex-1">
        <p className="font-display text-xl italic text-ink">{boutique.name}</p>
        {url ? <p className="mt-0.5 truncate text-xs text-ink/50">{url}</p> : null}
        <p className="mt-1 text-xs uppercase tracking-[0.18em] text-ink/40">
          {categoryNames.join(' · ')}
          <span
            className={
              boutique.isActive
                ? 'ml-3 inline-flex items-center gap-1.5 text-sage'
                : 'ml-3 inline-flex items-center gap-1.5 text-ink/30'
            }
          >
            <span
              className={
                boutique.isActive
                  ? 'h-1.5 w-1.5 rounded-full bg-sage'
                  : 'h-1.5 w-1.5 rounded-full bg-ink/30'
              }
            />
            {boutique.isActive ? 'Aktif' : 'Gizli'}
          </span>
          {boutique.firsat ? <span className="ml-3 text-clay">Fırsat</span> : null}
        </p>
      </div>
      <div className="flex shrink-0 items-center gap-2">
        <Button asChild variant="outline" size="sm">
          <Link href={`/boutiques/${boutique.id}/edit`}>Düzenle</Link>
        </Button>
        <form action={deleteBoutiqueAction.bind(null, boutique.id)}>
          <Button variant="ghost" size="sm" type="submit" className="text-clay hover:text-clay">
            Sil
          </Button>
        </form>
      </div>
    </div>
  );
}
