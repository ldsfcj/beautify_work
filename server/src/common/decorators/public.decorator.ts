import { SetMetadata } from '@nestjs/common';

/**
 * Metadata key used by JwtAuthGuard to detect routes that should bypass auth.
 */
export const IS_PUBLIC_KEY = 'isPublic';

/**
 * Mark a route handler as public (skip JWT auth check).
 * Placeholder implementation — full guard wired up in Task 5.
 */
export const Public = (): MethodDecorator & ClassDecorator =>
  SetMetadata(IS_PUBLIC_KEY, true);
