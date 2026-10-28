import { describe, expect, test } from 'bun:test';
import {
  firstRouteSegment,
  isBlockedExternalPath,
  urunButiginMi,
  webLinkToAppPath,
} from './deep-link';

describe('dışarıdan gelen bağlantılar', () => {
  test('uygulama içi tarayıcıyı açan bağlantılar engellenir', () => {
    for (const path of [
      'butika://webview?url=https%3A%2F%2Fsahte.example&name=Bilinen%20Butik',
      'butika:///webview?url=https://sahte.example',
      '/webview?url=https://sahte.example',
      'webview',
      'butika://WebView/',
      'butika://%77ebview?url=x',
      'butika://(tabs)/webview?url=x',
      'exp://192.168.1.5:8081/--/webview?url=x',
    ]) {
      expect(isBlockedExternalPath(path)).toBe(true);
    }
  });

  test('diğer bağlantılar olduğu gibi geçer', () => {
    for (const path of [
      'butika://boutique/123',
      '/',
      'butika://',
      'exp+butika://expo-development-client/?url=http%3A%2F%2Flocalhost%3A8081',
      'com.googleusercontent.apps.123456789-abc:/oauth2redirect?code=1',
      'butika://notifications',
      'butika://saved?webview=1',
    ]) {
      expect(isBlockedExternalPath(path)).toBe(false);
    }
  });

  test('paylasim yalnız iOS’ta dışarıya kapalı', () => {
    for (const path of [
      'butika://paylasim?metin=https%3A%2F%2Fwww.instagram.com%2Fx',
      '/paylasim?metin=x',
      'butika:///paylasim',
    ]) {
      expect(isBlockedExternalPath(path, 'ios')).toBe(true);
      expect(isBlockedExternalPath(path, 'android')).toBe(false);
    }
    expect(isBlockedExternalPath('butika://saved', 'ios')).toBe(false);
  });

  test('ilk rota parçası doğru okunur', () => {
    expect(firstRouteSegment('butika://boutique/123?x=1')).toBe('boutique');
    expect(firstRouteSegment('/(tabs)/saved')).toBe('saved');
  });

  test('butika.ai linki uygulama rotasına çevrilir', () => {
    expect(webLinkToAppPath('https://butika.ai/b/vena')).toBe('/b/vena');
    expect(webLinkToAppPath('https://www.butika.ai/b/vena?urun=x&utm_source=ig')).toBe(
      '/b/vena?urun=x&utm_source=ig',
    );
    expect(webLinkToAppPath('https://butika.ai')).toBe('/');
    expect(webLinkToAppPath('https://BUTIKA.AI/b/x')).toBe('/b/x');
    expect(webLinkToAppPath('butika://boutique/1')).toBe('butika://boutique/1');
    expect(webLinkToAppPath('https://butika.ai.sahte.com/b/x')).toBe(
      'https://butika.ai.sahte.com/b/x',
    );
    expect(webLinkToAppPath('https://sahtebutika.ai/b/x')).toBe('https://sahtebutika.ai/b/x');
    // çevrildikten sonra da uygulama içi tarayıcı dışarıdan açılamaz
    expect(isBlockedExternalPath(webLinkToAppPath('https://butika.ai/webview?url=x'))).toBe(true);
  });

  test('ürün linki yalnız butiğin kendi sitesini açar', () => {
    const butik = 'https://www.venajeans.com';
    expect(urunButiginMi('https://venajeans.com/urun/jenny', butik)).toBe(true);
    expect(urunButiginMi('https://www.venajeans.com/urun/jenny?v=1', butik)).toBe(true);
    expect(urunButiginMi('https://VENAJEANS.com:443/x', butik)).toBe(true);
    expect(urunButiginMi('http://venajeans.com/x', butik)).toBe(true);
    for (const kotu of [
      'https://sahte.com/venajeans.com',
      'https://venajeans.com.sahte.com/x',
      'https://venajeans.com@sahte.com/x',
      'https://sahte.com\\@venajeans.com',
      'javascript:alert(1)//venajeans.com',
      'ftp://venajeans.com/x',
      'venajeans.com/x',
      '',
    ]) {
      expect(urunButiginMi(kotu, butik)).toBe(false);
    }
  });
});
