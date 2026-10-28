import { z } from 'zod';
import { countryCodeSchema, languageSchema } from './country';

export const userSchema = z.object({
  id: z.string().uuid(),
  email: z.string().email().nullable(),
  displayName: z.string(),
  avatarUrl: z.string().url().nullable(),
  gender: z.enum(['female', 'male']).nullable(),
  heightCm: z.number().int().min(100).max(250).nullable(),
  weightKg: z.number().int().min(30).max(300).nullable(),
  showStatsInComments: z.boolean(),
  language: languageSchema.nullable(), // null = oto (cihaz dili)
  countryCode: countryCodeSchema.nullable(), // null = oto (CF-IPCountry)
  createdAt: z.string().datetime(),
});

export type User = z.infer<typeof userSchema>;

export const profileUpdateSchema = z.object({
  gender: z.enum(['female', 'male']).nullable().optional(),
  heightCm: z.number().int().min(100).max(250).nullable().optional(),
  weightKg: z.number().int().min(30).max(300).nullable().optional(),
  showStatsInComments: z.boolean().optional(),
  displayName: z.string().min(1).max(60).optional(),
  language: languageSchema.nullable().optional(),
  countryCode: countryCodeSchema.nullable().optional(),
});
export type ProfileUpdate = z.infer<typeof profileUpdateSchema>;

export const appleSignInSchema = z.object({
  idToken: z.string().min(10), // Apple identityToken (JWT)
  rawNonce: z.string().min(8).max(128).optional(), // replay koruması — backend sha256'sını doğrular
  displayName: z.string().max(120).optional(), // yalnız İLK girişte gelir (Apple sonra null döner)
  // Hesap silinince Apple yetkisini iptal edebilmek için (refresh token'a çevrilir). Eski sürümler göndermez.
  authorizationCode: z.string().min(10).max(1000).optional(),
});
export type AppleSignIn = z.infer<typeof appleSignInSchema>;

export const googleSignInSchema = z.object({
  idToken: z.string().min(10),
});
export type GoogleSignIn = z.infer<typeof googleSignInSchema>;

export const refreshTokenSchema = z.object({
  refreshToken: z.string().min(10),
});

export const authResponseSchema = z.object({
  jwt: z.string(),
  refreshToken: z.string(),
  user: userSchema,
});

export type AuthResponse = z.infer<typeof authResponseSchema>;
