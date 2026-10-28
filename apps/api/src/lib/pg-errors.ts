// drizzle-orm/postgres-js gerçek sürücü hatasını `.cause` içinde sarar; pg
// SQLSTATE kodu üst seviyede değil zincirde olabilir, o yüzden zinciri geziyoruz.
export function hasPgErrorCode(err: unknown, code: string): boolean {
  let cur: unknown = err;
  for (let i = 0; i < 6 && cur && typeof cur === 'object'; i++) {
    if ((cur as { code?: unknown }).code === code) return true;
    cur = (cur as { cause?: unknown }).cause;
  }
  return false;
}

export function isUniqueViolation(err: unknown): boolean {
  return hasPgErrorCode(err, '23505');
}

export function isForeignKeyViolation(err: unknown): boolean {
  // 23503 = foreign_key_violation; 23001 = restrict_violation. İkisi de
  // "bağımlılık var, silinemez" anlamına gelir.
  return hasPgErrorCode(err, '23503') || hasPgErrorCode(err, '23001');
}
