import 'reflect-metadata';
import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import type { Request } from 'express';
import { ApiErrorCode } from '@hyperzod/shared-types';
import { ApiException, HttpStatus } from '../common/api-exception';

type ClassType<T> = new () => T;

/**
 * Validates and transforms a request body against a class-validator DTO
 * (replaces Nest's global ValidationPipe).
 *
 * `whitelist + forbidNonWhitelisted` semantics: unknown keys are rejected, not
 * silently dropped, so a client sending `price_amount_cents` to an endpoint
 * that inherits currency gets told, not ignored.
 */
export async function parseBody<T extends object>(
  cls: ClassType<T>,
  body: unknown,
): Promise<T> {
  const instance = plainToInstance(cls, body ?? {}, {
    enableImplicitConversion: false,
  });

  const errors = await validate(instance as object, {
    whitelist: true,
    forbidNonWhitelisted: true,
    forbidUnknownValues: true,
  });

  if (errors.length > 0) {
    const fields = errors.flatMap((e) => collectMessages(e));
    throw ApiException.validation('Request validation failed.', { fields });
  }

  return instance;
}

function collectMessages(error: {
  property: string;
  constraints?: Record<string, string>;
  children?: unknown[];
}): string[] {
  const own = error.constraints ? Object.values(error.constraints) : [];
  const nested = (error.children ?? []).flatMap((c) =>
    collectMessages(c as Parameters<typeof collectMessages>[0]),
  );
  return [...own, ...nested];
}

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Validates a path param is a UUID (replaces ParseUUIDPipe). */
export function uuidParam(req: Request, name: string): string {
  const value = req.params[name];
  if (typeof value !== 'string' || !UUID_RE.test(value)) {
    throw new ApiException(
      ApiErrorCode.VALIDATION_FAILED,
      `Path parameter "${name}" must be a UUID.`,
      HttpStatus.BAD_REQUEST,
      { field: name },
    );
  }
  return value;
}

/** Reads a single-valued query string param, ignoring array duplicates. */
export function queryString(req: Request, name: string): string | undefined {
  const raw = req.query[name];
  if (typeof raw === 'string') return raw;
  if (Array.isArray(raw) && typeof raw[0] === 'string') return raw[0];
  return undefined;
}
