import { describe, expect, test } from 'bun:test';
import { epostaZamaniMi, haftalikTurZamaniMi, turHaftasi } from './zamanlama';

describe('haftalikTurZamaniMi', () => {
  test('pazar 22:59 İstanbul: henüz değil', () => {
    expect(haftalikTurZamaniMi(new Date('2026-10-04T19:59:00Z'), false)).toBe(false);
  });
  test('pazar 23:01 İstanbul: zamanı', () => {
    expect(haftalikTurZamaniMi(new Date('2026-10-04T20:01:00Z'), false)).toBe(true);
  });
  test('bu hafta tamamlandıysa: hayır', () => {
    expect(haftalikTurZamaniMi(new Date('2026-10-04T20:01:00Z'), true)).toBe(false);
  });
  test('pazartesi gün boyu sürer, salı başlamaz', () => {
    expect(haftalikTurZamaniMi(new Date('2026-10-05T20:59:00Z'), false)).toBe(true); // pzt 23:59
    expect(haftalikTurZamaniMi(new Date('2026-10-05T21:00:00Z'), false)).toBe(false); // salı 00:00
    expect(haftalikTurZamaniMi(new Date('2026-10-07T10:00:00Z'), false)).toBe(false); // çarşamba
  });
});

describe('epostaZamaniMi', () => {
  test('pazartesi 08:59 İstanbul: hayır, 09:01: evet', () => {
    expect(epostaZamaniMi(new Date('2026-10-05T05:59:00Z'))).toBe(false);
    expect(epostaZamaniMi(new Date('2026-10-05T06:01:00Z'))).toBe(true);
  });
  test('pazar gecesi (tur yeni bitmişken) gönderilmez', () => {
    expect(epostaZamaniMi(new Date('2026-10-04T20:30:00Z'))).toBe(false);
    expect(epostaZamaniMi(new Date('2026-10-04T21:30:00Z'))).toBe(false); // pzt 00:30
  });
  test('pazartesi kaçırıldıysa salı gönderilebilir', () => {
    expect(epostaZamaniMi(new Date('2026-10-06T08:00:00Z'))).toBe(true);
  });
});

describe('turHaftasi', () => {
  test('pazar 23:00 sonrası ve ertesi pazartesi aynı haftadır', () => {
    const pazarGece = turHaftasi(new Date('2026-10-04T20:01:00Z'));
    expect(pazarGece).toBe(turHaftasi(new Date('2026-10-05T20:59:00Z')));
    expect(pazarGece).toBe('2026-W41');
    expect(turHaftasi(new Date('2026-10-04T19:00:00Z'))).toBe('2026-W40');
  });
});
