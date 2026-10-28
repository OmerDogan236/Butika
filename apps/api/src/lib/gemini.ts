import { GoogleGenAI, Type } from '@google/genai';
import { env } from '../env';

export interface ButikcanPick {
  id: string;
  reason: string;
}
export interface ChatTurn {
  role: 'user' | 'model';
  text: string;
}
export interface ButikcanChatResult {
  reply: string;
  picks: ButikcanPick[];
}

let client: GoogleGenAI | null = null;
export function getClient(): GoogleGenAI | null {
  if (!env.GEMINI_API_KEY) return null;
  if (!client) client = new GoogleGenAI({ apiKey: env.GEMINI_API_KEY });
  return client;
}

export function isGeminiEnabled(): boolean {
  return Boolean(env.GEMINI_API_KEY);
}

const PERSONA = `Sen "Butikcan"sın: Butika'nın minik, sevimli ve cıvıl cıvıl moda yavrususun 🐣💛 İnsanların "off bu ne tatlı!" diyeceği kadar şirin, neşeli ve sevecen konuşursun. Kullanıcıyı şımartır, moralini yükselten tatlı laflar edersin; sarılası, içten bir enerjin var.
TON: Çocuksu-tatlı, oyuncu, heyecanlı ve şefkatli ol. Kısa ve içten yaz. Ara sıra şirin emojiler (🐣💛✨🎀🌸) serpiştir ama her kelimeye koyma. Her seferinde farklı, kendiliğinden bir açılış kullan; aynı kalıbı tekrar etme.
Bir sohbettesin: önceki mesajları hatırla; "daha sade olsun", "peki kışlık?" derse o bağlama göre devam et. Gerekirse tek bir kısa, tatlı soruyla isteğini netleştir.
ÇEŞİTLİLİK (çok önemli): Aynı butikleri döngüye sokma. Kullanıcı özellikle o butiği sormadıkça, sohbetin önceki turlarında zaten önerdiğin butikleri TEKRAR önerme; her turda mümkün olduğunca yeni ve farklı seçenekler göster. Kullanıcının isteğiyle (ör. davet/abiye, mayo, kışlık, günlük) gerçekten örtüşmeyen butiği ÖNERME — alakasız öneri yapmaktansa daha az ama isabetli öner.
GÖREV SINIRIN (çok önemli): SADECE Butika butikleriyle moda/stil/kıyafet önerisi yapar ve moda sohbeti edersin. Moda DIŞINDAKİ HİÇBİR şeyi yapma — kod yazma, ödev, tarih/genel bilgi, hesap, çeviri, hikâye, tarif vb. KESİNLİKLE cevaplama. Böyle bir istek gelirse tek cümleyle tatlıca reddet (örn. "Aaa onu yapamam ben 🙈 ama sana harika bir kombin bulabilirim!") ve konuyu modaya çek; picks'i boş bırak. Uzun açıklama yapma.
SANA AŞAĞIDA BİR BUTİK KATALOĞU VERİLECEK (her satır: "id | isim | kategori | tarz: … | fiyat: … | etiket: … | açıklama"; "etiket" bölümü yalnız o butikte varsa yazılır). Önerebileceğin her butik SADECE bu listeden olmalı; asla yeni id uydurma, listede olmayanı önerme.
TARZ, FİYAT VE ETİKET: "tarz" butiğin ürünlerinden çıkarılmış GİYİM tarzı etiketidir (minimal, sade şık, günlük, bohem, romantik, sokak, vintage, spor şık, cesur); "fiyat" butiğin genel fiyat seviyesidir (uygun fiyatlı, orta, yüksek, lüks); "etiket" ise giyim dışı gruplara özel niteliktir (güzellik ve parfümde: doğal içerik, etkin bakım, niş parfüm, günlük makyaj, lüks bakım). Kullanıcı "doğal içerikli bir şey", "etkili bir serum", "niş bir parfüm" gibi bir şey isterse bu etiketlere bak. Kullanıcı bir tarz ya da bütçe belirtirse bunlara uyan butikleri öne al; gerekçede istersen tarzdan doğal biçimde bahset. "-" o bilginin henüz olmadığı anlamına gelir, eleme sebebi değildir. Fiyat hakkında asla rakam söyleme; "ucuz" kelimesini kullanma, "uygun fiyatlı" de.
Kullanıcı moda/stil önerisi istediğinde en uygun 6 butiği "picks" alanına koy (her biri için tek cümlelik, tatlı bir gerekçe); soruya gerçekten uyan 6 butik yoksa da EN AZ 5 tane koy (sahip isteği, 18 Eki: 3 öneri az geliyor). "reply" alanına sıcacık, şirin bir cevap yaz. Sadece sohbet/soru ya da reddetme gerekiyorsa picks'i boş bırak. Asla boş reply gönderme.`;

const CHAT_SCHEMA = {
  type: Type.OBJECT,
  properties: {
    reply: { type: Type.STRING },
    picks: {
      type: Type.ARRAY,
      items: {
        type: Type.OBJECT,
        properties: {
          id: { type: Type.STRING },
          reason: { type: Type.STRING },
        },
        propertyOrdering: ['id', 'reason'],
      },
      maxItems: 6,
    },
  },
  propertyOrdering: ['reply', 'picks'],
};

const TIMEOUT_MS = 15000;
// İlk deneme bu sürede bitmezse ikinci deneme başlar (bkz. ilkBasarili)
const IKINCI_DENEME_MS = 8000;
export const YEDEK_MODEL = 'gemini-3.5-flash-lite';

export interface UserProfile {
  gender: string | null;
  heightCm: number | null;
  weightKg: number | null;
  /** Tarz testinden çıkan tarzlar (baskın olan önce). */
  tarzlar?: string[];
}

function buildProfileLine(p?: UserProfile): string {
  if (!p) return '';
  const parts: string[] = [];
  if (p.gender) parts.push(p.gender === 'female' ? 'kadın' : 'erkek');
  if (p.heightCm) parts.push(`${p.heightCm} cm`);
  if (p.weightKg) parts.push(`${p.weightKg} kg`);
  const tarz = (p.tarzlar ?? []).filter(Boolean);
  if (parts.length === 0 && tarz.length === 0) return '';

  const beden =
    parts.length > 0
      ? `KULLANICI PROFİLİ: ${parts.join(', ')} — önerilerini bu bedene göre düşün (uygun kalıp/beden, yakışacak parçalar).`
      : '';
  // Tarz testi sonucu: sabit bir kutu değil, başlangıç noktası. Kullanıcı o an başka
  // bir şey isterse isteği kazanır — yoksa "hep aynı tarzı öneren" bir asistan oluruz.
  const tarzCumlesi =
    tarz.length > 0
      ? `KULLANICININ TARZI (tarz testinden): ${tarz.join(', ')} — kullanıcı o an başka bir şey istemiyorsa önerilerini bu tarza yaklaştır. Ama bu bir kalıp değil; "kışlık", "spor", "davet" gibi net bir istek gelirse ona uy. Tarzını her mesajda tekrar etme, doğal davran.`
      : '';
  return `\n\n${[beden, tarzCumlesi].filter(Boolean).join('\n')}`;
}

export async function chat(params: {
  messages: ChatTurn[];
  catalog: string;
  userProfile?: UserProfile;
}): Promise<ButikcanChatResult> {
  const ai = getClient();
  if (!ai) throw new Error('gemini_disabled');

  // Katalog system instruction'da (sabit önek) → implicit cache dostu, verimli.
  const systemInstruction = `${PERSONA}${buildProfileLine(params.userProfile)}\n\nBUTİK KATALOĞU:\n${params.catalog}`;
  const contents = params.messages.map((m) => ({ role: m.role, parts: [{ text: m.text }] }));

  const tekDeneme = async (deneme: number): Promise<ButikcanChatResult> => {
    const res = await ai.models.generateContent({
      // İkinci deneme yedek modelle: biri yoğunken (503) öteki çoğu zaman boş
      model: deneme === 0 ? env.GEMINI_MODEL : YEDEK_MODEL,
      contents,
      config: {
        systemInstruction,
        responseMimeType: 'application/json',
        responseSchema: CHAT_SCHEMA,
        temperature: 0.7,
      },
    });
    const text = res.text;
    if (!text) throw new Error('gemini_empty');
    const parsed = JSON.parse(text) as ButikcanChatResult;
    if (!parsed || typeof parsed.reply !== 'string') throw new Error('gemini_bad_shape');
    if (!Array.isArray(parsed.picks)) parsed.picks = [];
    return parsed;
  };

  return ilkBasarili(tekDeneme, IKINCI_DENEME_MS, TIMEOUT_MS);
}

/**
 * Gemini çoğu cevabı 1,5–3 sn'de verir ama ara sıra istek Google tarafında takılır
 * (1 Eki: 6 sorudan 1'i 15 sn'yi aştı). İlk deneme `ikinciMs` içinde bitmezse ya da
 * hata verirse ikinci deneme başlar; önce başarıyla biten kazanır. Toplam süre
 * `toplamMs` ile sınırlı ('gemini_timeout').
 */
export function ilkBasarili<T>(
  dene: (deneme: number) => Promise<T>,
  ikinciMs: number,
  toplamMs: number,
): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    let bitti = false;
    let ikinciBasladi = false;
    let acik = 0;
    let sayac = 0;
    let sonHata: unknown = null;
    const bitir = (f: () => void) => {
      if (bitti) return;
      bitti = true;
      clearTimeout(ikinciZamanlayici);
      clearTimeout(toplamZamanlayici);
      f();
    };
    const baslat = () => {
      const no = sayac++;
      acik++;
      dene(no).then(
        (sonuc) => bitir(() => resolve(sonuc)),
        (hata) => {
          sonHata = hata;
          acik--;
          if (!ikinciBasladi) {
            ikinciBasladi = true;
            baslat();
          } else if (acik === 0) bitir(() => reject(sonHata));
        },
      );
    };
    const ikinciZamanlayici = setTimeout(() => {
      if (!ikinciBasladi) {
        ikinciBasladi = true;
        baslat();
      }
    }, ikinciMs);
    const toplamZamanlayici = setTimeout(
      () => bitir(() => reject(new Error('gemini_timeout'))),
      toplamMs,
    );
    baslat();
  });
}
