import { ZodError } from 'zod';

export class HttpError extends Error {
  readonly status: number;
  readonly code: string;

  constructor(status: number, code: string, message: string) {
    super(message);
    this.name = 'HttpError';
    this.status = status;
    this.code = code;
    Object.setPrototypeOf(this, HttpError.prototype);
  }
}

export interface ActionErrorResponse {
  ok: false;
  error: string;
  code: string;
  status: number;
  details?: Record<string, string[]>;
}

export function toActionError(error: unknown): ActionErrorResponse {
  if (error instanceof HttpError) {
    return {
      ok: false,
      error: error.message,
      code: error.code,
      status: error.status,
    };
  }

  if (error instanceof ZodError) {
    const flattened = error.flatten();
    const firstErrorMessage =
      error.issues[0]?.message || 'Validation failed';
    return {
      ok: false,
      error: firstErrorMessage,
      code: 'VALIDATION_ERROR',
      status: 400,
      details: flattened.fieldErrors as Record<string, string[]>,
    };
  }

  if (error instanceof Error) {
    return {
      ok: false,
      error: error.message,
      code: 'INTERNAL_ERROR',
      status: 500,
    };
  }

  return {
    ok: false,
    error: 'An unexpected internal error occurred',
    code: 'UNKNOWN_ERROR',
    status: 500,
  };
}
