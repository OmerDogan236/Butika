import { expect, test } from 'bun:test';
import { kargoTakipAdresi } from './carriers';

test('butiğin verdiği takip adresi önce gelir', () => {
  expect(kargoTakipAdresi('https://kargo.example/takip/1', 'Aras Kargo', '123')).toBe(
    'https://kargo.example/takip/1',
  );
});

test('takip adresi yoksa firma ve numaradan kurulur (Satın Aldıklarım kartıyla aynı)', () => {
  expect(kargoTakipAdresi(null, 'PTT Kargo', '12 34')).toBe(
    'https://gonderitakip.ptt.gov.tr/Track/Verify?q=1234',
  );
  expect(kargoTakipAdresi(null, null, '999')).toBe('https://t.17track.net/en#nums=999');
});

test('ne adres ne numara varsa null; web dışı adres yok sayılır', () => {
  expect(kargoTakipAdresi(null, 'Aras Kargo', null)).toBeNull();
  expect(kargoTakipAdresi('  ', null, '  ')).toBeNull();
  expect(kargoTakipAdresi('javascript:alert(1)', null, null)).toBeNull();
});
