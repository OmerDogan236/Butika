import { create } from 'zustand';

// Detaylı test afişinin çarpısı yalnız bu açılış için: bellekte tutulur, diske yazılmaz.
// Uygulama yeniden açılınca afiş yine görünür (sahip kararı, 15 Eki).
interface DetayliDavetState {
  kapatildi: boolean;
  kapat: () => void;
}

export const useDetayliDavetStore = create<DetayliDavetState>((set) => ({
  kapatildi: false,
  kapat: () => set({ kapatildi: true }),
}));
