import type { Context } from 'hono';
import type { ContentfulStatusCode } from 'hono/utils/http-status';

export class ApiError extends Error {
  constructor(
    public readonly status: ContentfulStatusCode,
    public readonly code: string,
    message: string,
    public readonly details?: unknown,
  ) {
    super(message);
    this.name = 'ApiError';
  }

  static badRequest(code: string, message: string, details?: unknown) {
    return new ApiError(400, code, message, details);
  }
  static unauthorized(message = 'unauthorized') {
    return new ApiError(401, 'unauthorized', message);
  }
  static forbidden(message = 'forbidden') {
    return new ApiError(403, 'forbidden', message);
  }
  static notFound(message = 'not found') {
    return new ApiError(404, 'not_found', message);
  }
  static conflict(code: string, message: string) {
    return new ApiError(409, code, message);
  }
  static internal(message = 'internal error') {
    return new ApiError(500, 'internal', message);
  }
}

export function errorResponse(c: Context, err: unknown) {
  if (err instanceof ApiError) {
    return c.json(
      { error: { code: err.code, message: err.message, details: err.details } },
      err.status,
    );
  }
  const message = err instanceof Error ? err.message : String(err);
  return c.json({ error: { code: 'internal', message } }, 500);
}
