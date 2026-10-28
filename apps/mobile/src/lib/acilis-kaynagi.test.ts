import { beforeEach, expect, test } from 'bun:test';
import {
  SINYAL_PENCERESI_MS,
  _sifirla,
  acilisKaynagiAl,
  linkAcilisiniBildir,
  linkYuku,
  pushAcilisiniBildir,
  pushYuku,
  sogukAcilisKaynagi,
  sogukPushKontrolBitti,
} from './acilis-kaynagi';

beforeEach(_sifirla);

test('sinyal yoksa organic', () => {
  expect(acilisKaynagiAl()).toEqual({ source: 'organic' });
});

test('bildirim: tür, kampanya, olay kimliği', () => {
  pushAcilisiniBildir({ type: 'announcement', campaign: 'lujo-kupa' }, 1000);
  expect(acilisKaynagiAl(2000)).toEqual({
    source: 'push',
    push_type: 'announcement',
    push_campaign: 'lujo-kupa',
  });
  // tüketildi: sonraki açılış organic
  expect(acilisKaynagiAl(2500)).toEqual({ source: 'organic' });
});

test('bağlantı: utm değerleri ve ekran', () => {
  linkAcilisiniBildir(
    'butika://boutique/abc?utm_source=instagram&utm_medium=story&utm_campaign=ekim%20secki&x=1',
    0,
  );
  expect(acilisKaynagiAl(10)).toEqual({
    source: 'deeplink',
    link_screen: 'boutique',
    utm_source: 'instagram',
    utm_medium: 'story',
    utm_campaign: 'ekim secki',
  });
});

test('ana ekrandan açılışın kök adresi bağlantı sayılmaz', () => {
  for (const kok of ['butika:///', 'butika://', 'exp://192.168.1.5:8081/--/']) {
    linkAcilisiniBildir(kok, 0);
    expect(acilisKaynagiAl(1)).toEqual({ source: 'organic' });
  }
  linkAcilisiniBildir('butika:///?utm_source=instagram', 0);
  expect(acilisKaynagiAl(1)).toEqual({ source: 'deeplink', utm_source: 'instagram' });
});

test('bildirim bağlantıdan önce gelir; eski sinyal sayılmaz', () => {
  linkAcilisiniBildir('butika://firsat', 0);
  pushAcilisiniBildir({ type: 'price_drop', eventId: 'e1' }, 0);
  expect(acilisKaynagiAl(5).source).toBe('push');
  pushAcilisiniBildir({ type: 'price_drop' }, 0);
  expect(acilisKaynagiAl(SINYAL_PENCERESI_MS + 1).source).toBe('organic');
});

test('yük: boş ve tuhaf değerler atlanır', () => {
  expect(pushYuku({ type: '', campaign: 5 })).toEqual({});
  expect(pushYuku(null)).toEqual({});
  expect(linkYuku('butika://?utm_source=%E0%A4%A')).toEqual({ utm_source: '%E0%A4%A' });
});

test('soğuk açılış: bildirim sorgusu bitince hemen döner', async () => {
  const bekleyen = sogukAcilisKaynagi(5000);
  pushAcilisiniBildir({ type: 'back_in_stock' });
  sogukPushKontrolBitti();
  expect((await bekleyen).source).toBe('push');
});

test('soğuk açılış: sorgu hiç bitmezse süre sonunda organic', async () => {
  expect(await sogukAcilisKaynagi(5)).toEqual({ source: 'organic' });
});
