import { expect, test } from 'bun:test';
import { kurulumYuku, referrerUtm } from './kurulum-kaynagi';

test('Play referrer: düz ve bir kez daha kodlanmış biçim', () => {
  expect(referrerUtm('utm_source=instagram&utm_medium=bio&utm_campaign=ekim%20secki')).toEqual({
    utm_source: 'instagram',
    utm_medium: 'bio',
    utm_campaign: 'ekim secki',
  });
  expect(referrerUtm('utm_source%3Dinstagram%26utm_medium%3Dstory')).toEqual({
    utm_source: 'instagram',
    utm_medium: 'story',
  });
});

test('Play organik kurulum ve tanımsız parametreler', () => {
  expect(referrerUtm('utm_source=google-play&utm_medium=organic&gclid=abc')).toEqual({
    utm_source: 'google-play',
    utm_medium: 'organic',
  });
  expect(referrerUtm('')).toEqual({});
});

test('kişi özellikleri bir kez yazılır', () => {
  expect(kurulumYuku('android', 'utm_source=instagram&utm_campaign=bio')).toEqual({
    first_install_platform: 'android',
    first_install_source: 'instagram',
    first_utm_source: 'instagram',
    first_utm_campaign: 'bio',
    has_referrer: true,
    $set_once: {
      first_install_platform: 'android',
      first_install_source: 'instagram',
      first_utm_source: 'instagram',
      first_utm_campaign: 'bio',
    },
  });
  expect(kurulumYuku('ios', null)).toMatchObject({
    first_install_source: 'not_available_ios',
    has_referrer: false,
  });
});
