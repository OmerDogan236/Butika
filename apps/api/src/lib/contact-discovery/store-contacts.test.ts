import { describe, expect, test } from 'bun:test';
import { gonderilebilirMi } from './store-contacts';

// Sahibin acik kurali: yalniz 'onaylandi' adrese mail gider.
// Bu testler o kurali kilitler; ileride Brevo katmani buna dayanacak.
describe('gonderilebilirMi', () => {
  test('onaylanmis adrese gonderilir', () => {
    expect(
      gonderilebilirMi({ status: 'onaylandi', email: 'info@marka.com', doNotContact: false }),
    ).toBe(true);
  });

  test('onay bekleyen adrese GONDERILMEZ', () => {
    expect(
      gonderilebilirMi({ status: 'onay_bekliyor', email: 'info@marka.com', doNotContact: false }),
    ).toBe(false);
  });

  test('gecersiz isaretli adrese gonderilmez', () => {
    expect(
      gonderilebilirMi({ status: 'gecersiz', email: 'info@marka.com', doNotContact: false }),
    ).toBe(false);
  });

  test('adres bulunamadiysa gonderilmez', () => {
    expect(gonderilebilirMi({ status: 'bulunamadi', email: null, doNotContact: false })).toBe(
      false,
    );
  });

  test('iletisim istemeyen marka onaylanmis olsa bile gonderilmez', () => {
    expect(
      gonderilebilirMi({ status: 'onaylandi', email: 'info@marka.com', doNotContact: true }),
    ).toBe(false);
  });

  test('durum onaylandi ama adres bossa gonderilmez', () => {
    expect(gonderilebilirMi({ status: 'onaylandi', email: null, doNotContact: false })).toBe(false);
  });

  test('bozuk adres gonderilmez', () => {
    expect(
      gonderilebilirMi({ status: 'onaylandi', email: 'adres-degil', doNotContact: false }),
    ).toBe(false);
  });
});
