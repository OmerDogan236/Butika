'use client';

import { Label } from '@/components/ui/label';
import { cn } from '@/lib/utils';
import { ImagePlus, Loader2, X } from 'lucide-react';
import { useId, useRef, useState } from 'react';

interface UploadFieldProps {
  label: string;
  name: string;
  value: string | null;
  onChange: (publicUrl: string | null) => void;
  prefix?: 'boutiques' | 'logos';
  hint?: string;
}

export function UploadField({
  label,
  name,
  value,
  onChange,
  prefix = 'boutiques',
  hint,
}: UploadFieldProps) {
  const inputRef = useRef<HTMLInputElement>(null);
  const inputId = useId();
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleFile(file: File) {
    setError(null);
    if (!/^image\/(jpeg|png|webp|avif)$/.test(file.type)) {
      setError('Sadece JPEG / PNG / WebP / AVIF kabul edilir');
      return;
    }
    if (file.size > 8 * 1024 * 1024) {
      setError('Görsel 8 MB altı olmalı');
      return;
    }
    setUploading(true);
    try {
      const presign = await fetch('/api/upload-url', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ filename: file.name, contentType: file.type, prefix }),
      });
      if (!presign.ok) {
        const err = await presign.json().catch(() => ({}));
        throw new Error(err.error ?? 'presign başarısız');
      }
      const { uploadUrl, publicUrl } = (await presign.json()) as {
        uploadUrl: string;
        publicUrl: string;
      };
      const put = await fetch(uploadUrl, {
        method: 'PUT',
        headers: { 'Content-Type': file.type },
        body: file,
      });
      if (!put.ok) throw new Error(`MinIO yüklemesi başarısız (${put.status})`);
      onChange(publicUrl);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'yükleme hatası');
    } finally {
      setUploading(false);
    }
  }

  return (
    <div className="flex flex-col gap-2">
      <Label htmlFor={inputId}>{label}</Label>
      <input type="hidden" name={name} value={value ?? ''} />
      <input
        id={inputId}
        ref={inputRef}
        type="file"
        accept="image/jpeg,image/png,image/webp,image/avif"
        className="sr-only"
        onChange={(e) => {
          const file = e.target.files?.[0];
          if (file) handleFile(file);
        }}
      />

      {value ? (
        <div className="group relative aspect-[4/5] w-48 overflow-hidden rounded-md border border-mist bg-cream">
          <img src={value} alt="cover" className="h-full w-full object-cover" />
          <button
            type="button"
            onClick={() => onChange(null)}
            className="absolute right-2 top-2 rounded-full bg-ink/80 p-1.5 text-cream opacity-0 transition-opacity hover:bg-ink group-hover:opacity-100"
            aria-label="Görseli kaldır"
          >
            <X className="h-3.5 w-3.5" strokeWidth={1.5} />
          </button>
        </div>
      ) : (
        <button
          type="button"
          onClick={() => inputRef.current?.click()}
          disabled={uploading}
          className={cn(
            'flex aspect-[4/5] w-48 flex-col items-center justify-center gap-2 rounded-md border border-dashed border-mist bg-cream text-ink/50 transition-colors hover:border-gold hover:text-ink',
            uploading && 'pointer-events-none opacity-60',
          )}
        >
          {uploading ? (
            <Loader2 className="h-5 w-5 animate-spin" strokeWidth={1.5} />
          ) : (
            <ImagePlus className="h-5 w-5" strokeWidth={1.5} />
          )}
          <span className="text-xs uppercase tracking-[0.18em]">
            {uploading ? 'Yükleniyor…' : 'Görsel seç'}
          </span>
        </button>
      )}
      {hint && !error && <p className="text-xs text-ink/50">{hint}</p>}
      {error && <p className="text-xs text-clay">{error}</p>}
    </div>
  );
}
