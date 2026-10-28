import { env } from '../../env';
import { logger } from '../logger';
import { GONDEREN_ADI, GONDEREN_EPOSTA, type MailIcerigi } from './template';

// Brevo transactional e-posta istemcisi.
//
// Guncel uc: POST https://api.brevo.com/v3/smtp/email (eski Sendinblue uclari
// KULLANILMIYOR). Anahtar yalniz sunucu ortam degiskeninde; loga yazilmaz,
// yanitlarda ya da admin paneline donen veride yer almaz.

const BREVO_UCU = 'https://api.brevo.com/v3/smtp/email';
const ZAMAN_ASIMI_MS = 20_000;

export type GonderimSonucu = { ok: true; messageId: string } | { ok: false; hata: string };

export function brevoHazirMi(): boolean {
  return typeof env.BREVO_API_KEY === 'string' && env.BREVO_API_KEY.length > 10;
}

/**
 * Tek bir alicaya mail gonderir.
 * @param etiketler Brevo panelinde ve webhook'ta isi ayirt etmek icin
 */
export async function brevoMailGonder(
  alici: string,
  icerik: MailIcerigi,
  etiketler: string[],
): Promise<GonderimSonucu> {
  if (!brevoHazirMi()) return { ok: false, hata: 'brevo_api_key_yok' };

  try {
    const yanit = await fetch(BREVO_UCU, {
      method: 'POST',
      signal: AbortSignal.timeout(ZAMAN_ASIMI_MS),
      headers: {
        'api-key': env.BREVO_API_KEY as string,
        'content-type': 'application/json',
        accept: 'application/json',
      },
      body: JSON.stringify({
        sender: { name: GONDEREN_ADI, email: GONDEREN_EPOSTA },
        replyTo: { name: GONDEREN_ADI, email: GONDEREN_EPOSTA },
        to: [{ email: alici }],
        subject: icerik.subject,
        htmlContent: icerik.html,
        textContent: icerik.text,
        tags: etiketler,
      }),
    });

    if (!yanit.ok) {
      // Yanit govdesinde anahtar YOK; yine de kisaltarak sakliyoruz.
      const govde = (await yanit.text()).slice(0, 300);
      logger.error({ status: yanit.status }, 'brevo gonderim hatasi');
      return { ok: false, hata: `brevo_${yanit.status}: ${govde}` };
    }

    const veri = (await yanit.json()) as { messageId?: string };
    if (!veri.messageId) return { ok: false, hata: 'brevo_messageid_yok' };
    return { ok: true, messageId: veri.messageId };
  } catch (err) {
    const mesaj = err instanceof Error ? err.message : 'bilinmeyen hata';
    logger.error({ err: mesaj }, 'brevo istegi basarisiz');
    return { ok: false, hata: mesaj.slice(0, 300) };
  }
}
