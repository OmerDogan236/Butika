// apps/api/src/lib/kayit/urun-etiketi.ts
import {
  URUN_MALZEMELERI,
  URUN_RENKLERI,
  URUN_TURLERI,
  type UrunEtiketi,
  urunEtiketiSchema,
} from '@butika/types';
import { Type } from '@google/genai';
import { env } from '../../env';
import { getClient } from '../gemini';

// Bir hata yüzünden Gemini faturası sürpriz yapmasın: günde en çok bu kadar deneme.
export const GUNLUK_SINIR = 500;
export const kalanHak = (bugunDenenen: number): number => Math.max(0, GUNLUK_SINIR - bugunDenenen);

const TALIMAT = `Sana bir moda ürününün adı verilecek. Ürünün türünü, ana rengini ve ana malzemesini SADECE verilen listelerden seç.
Ad içinde açıkça yazmayan rengi ya da malzemeyi UYDURMA: emin değilsen null yaz. Tür için hiçbir seçenek uymuyorsa "diger" yaz.
Birden çok renk varsa "cok_renkli", desen (çizgili, çiçekli, ekose, leopar vb.) varsa "desenli" seç.`;

const SEMA = {
  type: Type.OBJECT,
  properties: {
    tur: { type: Type.STRING, enum: [...URUN_TURLERI] },
    renk: { type: Type.STRING, enum: [...URUN_RENKLERI], nullable: true },
    malzeme: { type: Type.STRING, enum: [...URUN_MALZEMELERI], nullable: true },
  },
  required: ['tur', 'renk', 'malzeme'],
  propertyOrdering: ['tur', 'renk', 'malzeme'],
};

/** Modelin cevabını sözlüğe göre doğrular; uymayan her şey null. Hata fırlatmaz. */
export function etiketCozumle(metin: string): UrunEtiketi | null {
  try {
    const sonuc = urunEtiketiSchema.safeParse(JSON.parse(metin));
    return sonuc.success ? sonuc.data : null;
  } catch {
    return null;
  }
}

/** Ürün adını etiketler. Gemini kapalıysa, hata verirse ya da cevap sözlüğe uymazsa null. */
export async function etiketle(ad: string): Promise<UrunEtiketi | null> {
  const ai = getClient();
  if (!ai) return null;
  try {
    const res = await ai.models.generateContent({
      model: env.GEMINI_MODEL,
      contents: [{ role: 'user', parts: [{ text: ad.slice(0, 300) }] }],
      config: {
        systemInstruction: TALIMAT,
        responseMimeType: 'application/json',
        responseSchema: SEMA,
        temperature: 0,
        abortSignal: AbortSignal.timeout(20_000),
      },
    });
    return etiketCozumle(res.text ?? '');
  } catch {
    return null;
  }
}
