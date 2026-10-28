// Soru ve şık metinleri @butika/types içindeki tarz testi tanımındadır; burada ekran metinleri var.
export const tarzTestiTr = {
  kicker: 'Tarz testi',
  kisaIlerleme: '{{adim}}/4',
  cokluSecim: 'Birden fazla seçebilirsin',
  tekSecim: 'Birini seç',
  enFazla: 'En fazla {{count}} seçim',
  devam: 'Devam',
  atla: 'Atla',
  bitir: 'Bitir',
  geriA11y: 'Önceki soru',
  kapatA11y: 'Testi kapat',
  hazirBaslik: "Butika'n hazır",
  hazirTarz: 'Tarzın: {{tarzlar}}',
} as const;

export const tarzTestiEn = {
  kicker: 'Style quiz',
  kisaIlerleme: '{{adim}}/4',
  cokluSecim: 'You can pick more than one',
  tekSecim: 'Pick one',
  enFazla: 'Up to {{count}} picks',
  devam: 'Continue',
  atla: 'Skip',
  bitir: 'Finish',
  geriA11y: 'Previous question',
  kapatA11y: 'Close quiz',
  hazirBaslik: 'Your Butika is ready',
  hazirTarz: 'Your style: {{tarzlar}}',
} as const;
