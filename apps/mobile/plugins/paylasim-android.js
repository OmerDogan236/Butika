// "Paylaş… → Butika" (Android): Butika'yı telefonun paylaşım menüsüne ekler.
// Paylaşılan yazı (Instagram profil/gönderi linki, butik sitesi) MainActivity'de
// butika://paylasim?metin=… derin linkine çevrilir; app/paylasim.tsx kaydı yapar ve
// kullanıcıyı paylaştığı uygulamaya geri bırakır. iOS karşılığı: targets/paylas.
const { withAndroidManifest, withMainActivity } = require('expo/config-plugins');

const ISARET = '// butika-paylasim';

function withPaylasimNiyeti(config) {
  return withAndroidManifest(config, (c) => {
    const app = c.modResults.manifest.application?.[0];
    const ana = app?.activity?.find((a) => a.$['android:name'] === '.MainActivity');
    if (!ana) throw new Error('paylasim-android: MainActivity bulunamadı');
    ana['intent-filter'] = ana['intent-filter'] ?? [];
    const varMi = ana['intent-filter'].some((f) =>
      (f.action ?? []).some((a) => a.$['android:name'] === 'android.intent.action.SEND'),
    );
    if (!varMi) {
      ana['intent-filter'].push({
        action: [{ $: { 'android:name': 'android.intent.action.SEND' } }],
        category: [{ $: { 'android:name': 'android.intent.category.DEFAULT' } }],
        data: [{ $: { 'android:mimeType': 'text/plain' } }],
      });
    }
    return c;
  });
}

function withPaylasimCevirici(config) {
  return withMainActivity(config, (c) => {
    let src = c.modResults.contents;
    if (src.includes(ISARET)) return c;
    if (c.modResults.language !== 'kt') throw new Error('paylasim-android: Kotlin MainActivity bekleniyor');
    src = src.replace(
      'import android.os.Bundle',
      'import android.os.Bundle\nimport android.content.Intent\nimport android.net.Uri',
    );
    src = src.replace('    super.onCreate(null)', `    paylasimiCevir(intent) ${ISARET}\n    super.onCreate(null)`);
    src = src.replace(
      /\n}\s*$/,
      `

  override fun onNewIntent(intent: Intent) {
    paylasimiCevir(intent) ${ISARET}
    super.onNewIntent(intent)
  }

  /**
   * Paylaşım menüsünden gelen yazıyı uygulamanın açabildiği butika://paylasim linkine çevirir.
   * butika://paylasim'i dışarıdan (web sayfası, başka uygulama) açmak kullanıcının haberi
   * olmadan kayıt yaptırabilirdi: yalnız bu çeviriden geçen niyet, süreç başına üretilen
   * gizli işareti taşır; işareti olmayan paylasim linki ana sayfaya düşürülür.
   */
  private fun paylasimiCevir(niyet: Intent?) {
    if (niyet == null) return
    if (niyet.action == Intent.ACTION_SEND) {
      val metin = niyet.getStringExtra(Intent.EXTRA_TEXT) ?: return
      niyet.action = Intent.ACTION_VIEW
      niyet.data = Uri.parse("butika://paylasim?metin=" + Uri.encode(metin.take(2000)))
      niyet.putExtra(PAYLASIM_ISARETI, PAYLASIM_GIZLI)
      return
    }
    val adres = niyet.data ?: return
    if (paylasimaGidiyor(adres) && niyet.getStringExtra(PAYLASIM_ISARETI) != PAYLASIM_GIZLI) {
      niyet.data = Uri.parse("butika://")
    }
  }

  /**
   * Router'ın yorumunu taklit etmez, kapalı tarafta kalır: adresin sorgu (?) ve # öncesi
   * kısmı en çok üç kez %-çözülür, bütün boşluk/görünmez karakterler atılır, küçük harfe
   * çevrilir; içinde herhangi bir yerde "paylasim" geçiyorsa işaretsiz link reddedilir.
   */
  private fun paylasimaGidiyor(adres: Uri): Boolean {
    var yol = adres.toString().split('?', '#')[0]
    repeat(3) { yol = Uri.decode(yol) }
    val sade = yol.filterNot { it.isWhitespace() || it.isISOControl() || it == '\\uFEFF' || it == '\\u200B' }
    return sade.lowercase().contains("paylasim")
  }
}

private const val PAYLASIM_ISARETI = "app.butika.paylasim_isareti"
private val PAYLASIM_GIZLI: String = java.util.UUID.randomUUID().toString()
`,
    );
    c.modResults.contents = src;
    return c;
  });
}

module.exports = (config) => withPaylasimCevirici(withPaylasimNiyeti(config));
