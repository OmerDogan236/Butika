import { expect, test } from 'bun:test';
import { decodeProtectedHeader, exportPKCS8, generateKeyPair, jwtVerify } from 'jose';
import { createAppleClientSecret } from './apple-token';

test('Apple client_secret, Apple’ın istediği başlık ve alanlarla imzalanır', async () => {
  const { privateKey, publicKey } = await generateKeyPair('ES256', { extractable: true });
  const key = {
    teamId: 'TEAM123456',
    keyId: 'KEY1234567',
    privateKey: await exportPKCS8(privateKey),
    clientId: 'app.butika',
  };
  const now = new Date('2026-09-15T12:00:00Z');

  const secret = await createAppleClientSecret(key, now);

  expect(decodeProtectedHeader(secret)).toEqual({ alg: 'ES256', kid: 'KEY1234567' });
  const { payload } = await jwtVerify(secret, publicKey, {
    issuer: 'TEAM123456',
    subject: 'app.butika',
    audience: 'https://appleid.apple.com',
    currentDate: now,
  });
  expect(payload.exp! - payload.iat!).toBe(300);
});
