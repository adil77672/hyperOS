import jwt from 'jsonwebtoken';
import { JwtClaims } from '@hyperzod/shared-types';

export interface JwtConfig {
  secret: string;
  issuer: string;
  audience: string;
}

export interface SignOptions {
  subject: string;
  expiresInSeconds: number;
  tenantId: string;
  role: string;
}

/**
 * HS256 access tokens (replaces @nestjs/jwt).
 *
 * The claim shape is fixed by API_AND_EVENT_CONTRACTS §2.3: `sub`, `tenantId`,
 * `role`, plus standard `iss`/`aud`/`iat`/`exp`. Verification enforces issuer
 * and audience so a token minted for a different service is rejected.
 */
export class JwtService {
  constructor(private readonly config: JwtConfig) {}

  sign(options: SignOptions): string {
    return jwt.sign(
      { tenantId: options.tenantId, role: options.role },
      this.config.secret,
      {
        algorithm: 'HS256',
        subject: options.subject,
        expiresIn: options.expiresInSeconds,
        issuer: this.config.issuer,
        audience: this.config.audience,
      },
    );
  }

  /** Throws (jsonwebtoken error) on any invalid/expired token — callers catch. */
  verify(token: string): JwtClaims {
    return jwt.verify(token, this.config.secret, {
      algorithms: ['HS256'],
      issuer: this.config.issuer,
      audience: this.config.audience,
    }) as JwtClaims;
  }
}
