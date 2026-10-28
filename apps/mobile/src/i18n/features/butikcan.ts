// Butikcan AI sohbet ekranının sabit UI metinleri (API'den gelen yanıtlar çevrilmez).
export const butikcanTr = {
  kicker: 'Butika AI',
  greeting:
    'Merhaba, ben Butikcan ✨ Nasıl bir şey arıyorsun — bir davet, günlük bir kombin, belki kışlık bir parça? Anlat bana, sana en güzel butikleri bulayım!',
  errorReply: 'Ay, bir aksilik oldu 🙈 tekrar yazar mısın?',
  inputPlaceholder: "Butikcan'a yaz…",
  aiConsentTitle: 'Butikcan yapay zekâ kullanır',
  aiConsentBody:
    'Butikcan’a yazdıkların ve profilinde varsa beden bilgin (cinsiyet, boy, kilo), sana butik önerisi üretmek için yapay zekâ hizmet sağlayıcımız Google’ın Gemini altyapısına (ABD) iletilir. Lütfen başkalarına ait kişisel bilgi yazma.',
  aiConsentLink: 'Aydınlatma Metni',
  aiConsentAccept: 'Kabul ediyorum',
  aiConsentDecline: 'Vazgeç',
} as const;

export const butikcanEn = {
  kicker: 'Butika AI',
  greeting:
    "Hi, I'm Butikcan ✨ What are you looking for — an event outfit, an everyday look, maybe a winter piece? Tell me, and I'll find you the loveliest boutiques!",
  errorReply: 'Oh, something went wrong 🙈 could you type that again?',
  inputPlaceholder: 'Message Butikcan…',
  aiConsentTitle: 'Butikcan uses AI',
  aiConsentBody:
    'What you write to Butikcan and, if set in your profile, your body details (gender, height, weight) are sent to our AI provider Google’s Gemini (USA) to generate boutique suggestions. Please don’t share other people’s personal information.',
  aiConsentLink: 'Privacy Notice',
  aiConsentAccept: 'I agree',
  aiConsentDecline: 'Cancel',
} as const;
