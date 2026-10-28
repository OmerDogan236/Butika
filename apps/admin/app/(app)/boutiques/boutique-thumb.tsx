'use client';

import { useState } from 'react';

// Kapak logo/banner ise sığdır (contain), ürün fotoğrafı ise doldur (cover).
export function BoutiqueThumb({ src, alt }: { src: string; alt: string }) {
  const [contain, setContain] = useState(false);
  return (
    <div className="flex h-14 w-12 shrink-0 items-center justify-center overflow-hidden rounded bg-cream">
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src={src}
        alt={alt}
        onLoad={(e) => {
          const { naturalWidth: w, naturalHeight: h } = e.currentTarget;
          if (w && h) setContain(w / h >= 1.25 || Math.max(w, h) < 400);
        }}
        className={contain ? 'h-full w-full object-contain p-1' : 'h-full w-full object-cover'}
      />
    </div>
  );
}
