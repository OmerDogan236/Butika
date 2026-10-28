import { Button } from '@/components/ui/button';
import { api } from '@/lib/api';
import { formatDistanceToNow } from 'date-fns';
import { tr } from 'date-fns/locale';
import { ExternalLink } from 'lucide-react';
import Link from 'next/link';
import { kullaniciButiginiOnaylaAction, kullaniciButiginiReddetAction } from './actions';

interface KullaniciButigi {
  id: string;
  name: string;
  description: string;
  url: string;
  coverImageUrl: string;
  instagram: string | null;
  createdAt: string;
  ekleyenAd: string | null;
  kategoriler: string[];
}

// Kullanıcıların Instagram'dan / siteden "Paylaş… → Butika" ile eklediği butikler. Site otomatik
// kontrolden geçti (e-ticaret, TL, toptan değil, moda); şimdilik yalnız ekleyenin Butiklerim'inde.
// Onayla → vitrine çıkar; Reddet → ekleyenin listesinden de düşer.
export async function KullaniciButikleri() {
  const liste = await api.get<KullaniciButigi[]>('/admin/kullanici-butikleri');
  if (liste.length === 0) return null;
  return (
    <section className="mb-10">
      <h2 className="mb-1 font-display text-2xl italic text-ink">Kullanıcıların eklediği butikler</h2>
      <p className="mb-4 text-sm text-ink/60">
        Instagram'dan paylaşımla eklendi, otomatik kontrolden geçti. Onaylayınca herkesin vitrininde görünür.
      </p>
      <ul className="flex flex-col border border-mist">
        {liste.map((b) => (
          <li key={b.id} className="flex gap-5 border-b border-mist/60 p-5 last:border-b-0">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={b.coverImageUrl} alt="" className="h-24 w-20 shrink-0 rounded object-cover bg-mist" />
            <div className="min-w-0 flex-1">
              <p className="font-display text-xl italic leading-tight text-ink">{b.name}</p>
              <p className="mt-1 text-sm text-ink/70">{b.description}</p>
              <p className="mt-2 flex flex-wrap items-center gap-3 text-xs text-ink/50">
                <a href={b.url} target="_blank" rel="noreferrer noopener" className="inline-flex items-center gap-1 hover:text-ink">
                  {b.url.replace(/^https?:\/\/(www\.)?/, '')}
                  <ExternalLink className="h-3 w-3" strokeWidth={1.5} />
                </a>
                {b.instagram && (
                  <a href={`https://www.instagram.com/${b.instagram}`} target="_blank" rel="noreferrer noopener" className="hover:text-ink">
                    @{b.instagram}
                  </a>
                )}
                <span>{b.kategoriler.join(' · ')}</span>
              </p>
              <p className="mt-1 text-xs uppercase tracking-[0.16em] text-ink/40">
                {b.ekleyenAd ?? 'Kullanıcı'}
                <span className="mx-2">·</span>
                {formatDistanceToNow(new Date(b.createdAt), { addSuffix: true, locale: tr })}
              </p>
              <div className="mt-3 flex items-center gap-3">
                <form
                  action={async () => {
                    'use server';
                    await kullaniciButiginiOnaylaAction(b.id);
                  }}
                >
                  <Button type="submit" variant="gold" size="sm">
                    Onayla, vitrine çıkar
                  </Button>
                </form>
                <Button asChild variant="ghost" size="sm">
                  <Link href={`/boutiques/${b.id}/edit`}>Düzenle</Link>
                </Button>
                <form
                  action={async () => {
                    'use server';
                    await kullaniciButiginiReddetAction(b.id);
                  }}
                >
                  <Button type="submit" variant="ghost" size="sm" className="text-clay hover:text-clay">
                    Reddet
                  </Button>
                </form>
              </div>
            </div>
          </li>
        ))}
      </ul>
    </section>
  );
}
