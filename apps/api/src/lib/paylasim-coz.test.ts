import { describe, expect, test } from 'bun:test';
import { alanAdi, paylasimiCoz } from './paylasim-coz';

describe('paylasimiCoz', () => {
  test('Instagram profil linki (paylaş menüsünden, igsh parametreli)', () => {
    expect(paylasimiCoz('https://www.instagram.com/shop_loveonfriday?igsh=MWx0cDh6&utm_source=qr')).toEqual({
      tur: 'instagram_profil',
      hesap: 'shop_loveonfriday',
    });
  });
  test('büyük harf ve sondaki eğik çizgi', () => {
    expect(paylasimiCoz('https://instagram.com/Mooi.Butik/')).toEqual({
      tur: 'instagram_profil',
      hesap: 'mooi.butik',
    });
  });
  test('gönderi ve reel linki', () => {
    expect(paylasimiCoz('https://www.instagram.com/p/DOa1B2c3D4e/?igsh=xyz')).toEqual({
      tur: 'instagram_gonderi',
      kod: 'DOa1B2c3D4e',
    });
    expect(paylasimiCoz('https://www.instagram.com/reel/C9xYz_-1/')).toEqual({
      tur: 'instagram_gonderi',
      kod: 'C9xYz_-1',
    });
    expect(paylasimiCoz('https://www.instagram.com/shop_loveonfriday/p/DOa1B2c3D4e/')).toEqual({
      tur: 'instagram_gonderi',
      kod: 'DOa1B2c3D4e',
    });
  });
  test('hesap olmayan Instagram yolları tanınmaz', () => {
    expect(paylasimiCoz('https://www.instagram.com/explore/tags/moda/')).toBeNull();
    expect(paylasimiCoz('https://www.instagram.com/stories/birisi/123/')).toBeNull();
    expect(paylasimiCoz('https://www.instagram.com/')).toBeNull();
  });
  test('açıklamalı metindeki butik sitesi linki', () => {
    expect(paylasimiCoz('Şuna bak: https://www.love-onfriday.com/collections/new.')).toEqual({
      tur: 'site',
      alan: 'love-onfriday.com',
      url: 'https://love-onfriday.com',
      adres: 'https://www.love-onfriday.com/collections/new',
    });
  });
  test('Instagram yönlendirme linki atlanır, sonraki link kullanılır', () => {
    expect(paylasimiCoz('https://l.instagram.com/?u=x https://vena.com.tr')).toEqual({
      tur: 'site',
      alan: 'vena.com.tr',
      url: 'https://vena.com.tr',
      adres: 'https://vena.com.tr/',
    });
  });
  test('ürün adresinde izleme parametreleri atılır, beden parametresi kalır', () => {
    expect(paylasimiCoz('http://butik.test/products/elbise?variant=42&utm_source=ig&igsh=x#yorum')).toEqual({
      tur: 'site',
      alan: 'butik.test',
      url: 'https://butik.test',
      adres: 'https://butik.test/products/elbise?variant=42',
    });
  });
  test('kullanıcı adı/şifre içeren adres reddedilir (site.com@baska.com)', () => {
    expect(paylasimiCoz('https://vena.com.tr@kotu.test/x')).toBeNull();
    expect(paylasimiCoz('https://a:b@vena.com.tr')).toBeNull();
  });
  test('link yoksa null', () => {
    expect(paylasimiCoz('merhaba')).toBeNull();
    expect(paylasimiCoz('')).toBeNull();
  });
});

describe('alanAdi', () => {
  test('www ve büyük harf temizlenir', () => {
    expect(alanAdi('https://WWW.Vena.com.tr/urun')).toBe('vena.com.tr');
  });
  test('sondaki nokta ve kullanıcı bilgisi', () => {
    expect(alanAdi('https://vena.com.tr./')).toBe('vena.com.tr');
    expect(alanAdi('https://vena.com.tr@kotu.test')).toBeNull();
  });
  test('alan adı değilse null', () => {
    expect(alanAdi('https://localhost:3000')).toBeNull();
    expect(alanAdi('vena.com.tr')).toBeNull();
  });
});
