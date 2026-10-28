'use client';

import { normalizeTr } from '@/lib/normalize';
import { cn } from '@/lib/utils';
import {
  DndContext,
  type DragEndEvent,
  KeyboardSensor,
  PointerSensor,
  closestCenter,
  useSensor,
  useSensors,
} from '@dnd-kit/core';
import {
  SortableContext,
  arrayMove,
  sortableKeyboardCoordinates,
  useSortable,
  verticalListSortingStrategy,
} from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { GripVertical, Search } from 'lucide-react';
import { type ReactNode, useEffect, useState, useTransition } from 'react';

// Önemli: content alanı Server Component'te pre-render edilmiş ReactNode
// taşır. Fonksiyon (renderItem) Client Component'e geçemediği için
// (Next.js server/client boundary kuralı) bu yol kullanılıyor.
export interface SortableItem {
  id: string;
  sortOrder: number;
  content: ReactNode;
  // searchable=true iken filtrelemede kullanılan metin (örn. butik adı).
  searchText?: string;
}

interface SortableListProps {
  items: SortableItem[];
  endpoint: string;
  searchable?: boolean;
  searchPlaceholder?: string;
  extraBody?: Record<string, unknown>;
  // Her satıra sıra numarası kutusu ve "En üste / En alta" düğmeleri (arama açıkken de çalışır).
  positionControls?: boolean;
  // Satırın sağına eklenecek ek kontrol (ör. butik "Taşı" menüsü). Yalnız Client Component'ten verilebilir.
  rowExtra?: (id: string) => ReactNode;
}

export function SortableList({
  items: initial,
  endpoint,
  searchable = false,
  searchPlaceholder = 'Ara…',
  extraBody,
  positionControls = false,
  rowExtra,
}: SortableListProps) {
  const [items, setItems] = useState(initial);
  const [query, setQuery] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  const needle = normalizeTr(query.trim());
  const filtering = searchable && needle.length > 0;
  const visible = filtering
    ? items.filter((i) => normalizeTr(i.searchText ?? '').includes(needle))
    : items;
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 6 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );

  function sirala(id: string, hedefIndex: number) {
    const eskiIndex = items.findIndex((i) => i.id === id);
    if (eskiIndex === -1 || eskiIndex === hedefIndex) return;
    const next = arrayMove(items, eskiIndex, hedefIndex).map((it, i) => ({ ...it, sortOrder: i }));
    setItems(next);
    void persist(next);
  }

  function handleDragEnd(event: DragEndEvent) {
    const { active, over } = event;
    if (!over || active.id === over.id) return;
    const hedefIndex = items.findIndex((i) => i.id === over.id);
    if (hedefIndex !== -1) sirala(String(active.id), hedefIndex);
  }

  async function persist(next: SortableItem[]) {
    setError(null);
    startTransition(async () => {
      try {
        const res = await fetch(endpoint, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            ...extraBody,
            items: next.map(({ id, sortOrder }) => ({ id, sortOrder })),
          }),
        });
        if (!res.ok) {
          const err = await res.json().catch(() => ({}));
          throw new Error(err.error ?? 'Sıralama kaydedilemedi');
        }
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Bağlantı hatası');
      }
    });
  }

  return (
    <>
      {searchable && (
        <div className="flex items-center gap-2 border-b border-mist px-3 py-2.5">
          <Search className="h-4 w-4 shrink-0 text-ink/40" strokeWidth={1.5} />
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder={searchPlaceholder}
            className="h-8 w-full bg-transparent text-sm text-ink placeholder:text-ink/35 focus:outline-none"
          />
          {filtering && (
            <span className="shrink-0 text-xs uppercase tracking-[0.16em] text-ink/40">
              {visible.length} sonuç
            </span>
          )}
        </div>
      )}

      <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
        <SortableContext items={visible.map((i) => i.id)} strategy={verticalListSortingStrategy}>
          <div className="flex flex-col">
            {visible.map((item) => {
              const sira = items.findIndex((i) => i.id === item.id) + 1;
              return (
                <SortableRow
                  key={item.id}
                  id={item.id}
                  disabled={filtering}
                  extra={
                    <>
                      {positionControls && (
                        <SiraKontrolu
                          sira={sira}
                          toplam={items.length}
                          onSira={(n) => sirala(item.id, n - 1)}
                        />
                      )}
                      {rowExtra?.(item.id)}
                    </>
                  }
                >
                  {item.content}
                </SortableRow>
              );
            })}
          </div>
        </SortableContext>
      </DndContext>

      {filtering && visible.length === 0 && (
        <p className="px-3 py-10 text-center text-sm text-ink/40">Eşleşen marka yok.</p>
      )}

      {(pending || error) && (
        <p
          className={cn(
            'mt-4 text-xs uppercase tracking-[0.18em]',
            error ? 'text-clay' : 'text-ink/40',
          )}
        >
          {error ? `! ${error}` : '… kaydediliyor'}
        </p>
      )}
    </>
  );
}

function SortableRow({
  id,
  children,
  disabled,
  extra,
}: {
  id: string;
  children: ReactNode;
  disabled?: boolean;
  extra?: ReactNode;
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id,
    disabled,
  });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
  };

  return (
    <div
      ref={setNodeRef}
      style={style}
      className={cn(
        'flex items-stretch gap-3 border-b border-mist/60 transition-colors last:border-b-0',
        isDragging && 'z-10 bg-cream shadow-lg ring-1 ring-gold/30',
      )}
    >
      <button
        type="button"
        {...attributes}
        {...listeners}
        disabled={disabled}
        aria-label="Sıralamak için sürükle"
        className={cn(
          'flex w-10 items-center justify-center text-ink/30',
          disabled
            ? 'cursor-default opacity-30'
            : 'cursor-grab hover:text-ink/70 active:cursor-grabbing',
        )}
      >
        <GripVertical className="h-4 w-4" strokeWidth={1.5} />
      </button>
      <div className="flex-1">{children}</div>
      {extra ? <div className="flex shrink-0 items-center">{extra}</div> : null}
    </div>
  );
}

function SiraKontrolu({
  sira,
  toplam,
  onSira,
}: {
  sira: number;
  toplam: number;
  onSira: (sira: number) => void;
}) {
  const [deger, setDeger] = useState(String(sira));
  useEffect(() => setDeger(String(sira)), [sira]);

  function uygula() {
    const n = Number.parseInt(deger, 10);
    if (Number.isNaN(n)) return setDeger(String(sira));
    const hedef = Math.min(Math.max(n, 1), toplam);
    if (hedef === sira) return setDeger(String(sira));
    onSira(hedef);
  }

  const dugme =
    'rounded px-2 py-1 text-xs uppercase tracking-[0.14em] text-ink/50 hover:bg-mist/40 hover:text-ink disabled:opacity-30';
  return (
    <div className="flex items-center gap-1.5 pr-3">
      <input
        aria-label="Sıra"
        inputMode="numeric"
        value={deger}
        onChange={(e) => setDeger(e.target.value.replace(/\D/g, ''))}
        onBlur={uygula}
        onKeyDown={(e) => {
          if (e.key === 'Enter') {
            e.preventDefault();
            uygula();
          }
        }}
        className="h-8 w-12 rounded border border-mist bg-transparent text-center text-sm text-ink focus:border-gold focus:outline-none"
      />
      <button type="button" className={dugme} disabled={sira === 1} onClick={() => onSira(1)}>
        En üste
      </button>
      <button
        type="button"
        className={dugme}
        disabled={sira === toplam}
        onClick={() => onSira(toplam)}
      >
        En alta
      </button>
    </div>
  );
}
